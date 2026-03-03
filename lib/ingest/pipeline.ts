import { spotifyFetch } from "@/lib/spotify/client";
import { createServiceClient } from "@/lib/supabase/service";
import { buildGenreVector } from "@/lib/model/genre-vocab";
import { resolveArtists } from "./artist-cache";

// --- Spotify response shapes (local to ingest) ---

interface SpotifyArtistRef {
  id: string;
  name: string;
}

interface SpotifyTrack {
  id: string;
  name: string;
  album: { id: string; name: string; release_date: string };
  artists: SpotifyArtistRef[];
  duration_ms: number;
  explicit: boolean;
  external_urls: { spotify: string };
}

interface IngestResult {
  tracksIngested: number;
  artistsFetched: number;
  featuresBuilt: number;
}

interface CollectedTrack {
  track: SpotifyTrack;
  source: string;
  timeRange: string;
  rank: number | null;
  addedAt: string | null;
}

const TIME_RANGES = ["short_term", "medium_term", "long_term"] as const;
const SOURCE_MAP: Record<string, string> = {
  short_term: "top_short",
  medium_term: "top_medium",
  long_term: "top_long",
};

const BATCH_SIZE = 500;

// --- Helpers ---

function parseReleaseYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.substring(0, 4), 10);
  return isNaN(year) ? null : year;
}

function normalizeReleaseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.substring(0, 4), 10);
  if (isNaN(year) || year < 1) return null;
  if (/^\d{4}$/.test(dateStr)) return `${dateStr}-01-01`;
  if (/^\d{4}-\d{2}$/.test(dateStr)) return `${dateStr}-01`;
  return dateStr;
}

function log(step: string, detail: string) {
  console.log(`[ingest] ${step}: ${detail}`);
}

async function batchUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  ignoreDuplicates = false
) {
  if (rows.length === 0) return;
  const db = createServiceClient();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    log("db", `upserting ${table} batch ${i / BATCH_SIZE + 1} (${chunk.length} rows)`);
    const { error } = await db
      .from(table)
      .upsert(chunk, { onConflict, ignoreDuplicates });
    if (error) {
      console.error(`[ingest] ERROR ${table}:`, error.message);
      throw new Error(`DB upsert ${table}: ${error.message}`);
    }
  }
}

// --- Track collection from Spotify ---

async function fetchTopTracks(userId: string): Promise<CollectedTrack[]> {
  const results: CollectedTrack[] = [];

  for (const range of TIME_RANGES) {
    log("fetch", `top tracks ${range}`);
    const res = await spotifyFetch(
      userId,
      `/me/top/tracks?time_range=${range}&limit=50`
    );
    const data = await res.json();
    const count = data.items?.length ?? 0;
    log("fetch", `top tracks ${range}: ${count} items`);

    for (let i = 0; i < count; i++) {
      results.push({
        track: data.items[i],
        source: SOURCE_MAP[range],
        timeRange: range,
        rank: i,
        addedAt: null,
      });
    }
  }

  return results;
}

async function fetchSavedTracks(userId: string): Promise<CollectedTrack[]> {
  const results: CollectedTrack[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    log("fetch", `saved tracks offset=${offset}`);
    const res = await spotifyFetch(
      userId,
      `/me/tracks?limit=${limit}&offset=${offset}`
    );
    const data = await res.json();
    const count = data.items?.length ?? 0;
    log("fetch", `saved tracks offset=${offset}: ${count} items (total=${data.total})`);

    for (const item of data.items ?? []) {
      results.push({
        track: item.track,
        source: "saved",
        timeRange: "",
        rank: null,
        addedAt: item.added_at ?? null,
      });
    }

    if (!data.next || count < limit) break;
    offset += limit;
  }

  return results;
}

// --- Persistence (batched) ---

async function persistTracks(
  collected: CollectedTrack[],
  userId: string
): Promise<{ uniqueArtistIds: string[] }> {
  const seenTracks = new Set<string>();
  const artistIds = new Set<string>();
  const now = new Date().toISOString();

  const trackRows: Record<string, unknown>[] = [];
  const trackArtistRows: Record<string, unknown>[] = [];
  const artistStubRows: Record<string, unknown>[] = [];
  const seenArtists = new Set<string>();

  for (const { track } of collected) {
    if (seenTracks.has(track.id)) continue;
    seenTracks.add(track.id);

    trackRows.push({
      spotify_track_id: track.id,
      name: track.name,
      album_name: track.album?.name ?? null,
      album_id: track.album?.id ?? null,
      release_date: normalizeReleaseDate(track.album?.release_date),
      release_year: parseReleaseYear(track.album?.release_date),
      duration_ms: track.duration_ms,
      explicit: track.explicit,
      spotify_url: track.external_urls?.spotify ?? null,
      updated_at: now,
    });

    for (let i = 0; i < track.artists.length; i++) {
      const artist = track.artists[i];
      artistIds.add(artist.id);
      trackArtistRows.push({
        spotify_track_id: track.id,
        spotify_artist_id: artist.id,
        artist_order: i,
      });
      if (!seenArtists.has(artist.id)) {
        seenArtists.add(artist.id);
        artistStubRows.push({
          spotify_artist_id: artist.id,
          name: artist.name,
          genres: [],
          fetched_at: "1970-01-01T00:00:00Z",
          updated_at: now,
        });
      }
    }
  }

  const userTrackRows: Record<string, unknown>[] = collected.map(
    ({ track, source, timeRange, rank, addedAt }) => ({
      user_id: userId,
      spotify_track_id: track.id,
      source,
      time_range: timeRange,
      rank_position: rank,
      added_at: addedAt,
      is_saved: source === "saved",
      created_at: now,
    })
  );

  log("persist", `${trackRows.length} tracks, ${artistStubRows.length} artists, ${trackArtistRows.length} links, ${userTrackRows.length} user_tracks`);

  await batchUpsert("tracks", trackRows, "spotify_track_id");
  await batchUpsert("artists", artistStubRows, "spotify_artist_id", true);
  await batchUpsert(
    "track_artists",
    trackArtistRows,
    "spotify_track_id,spotify_artist_id",
    true
  );
  await batchUpsert(
    "user_tracks",
    userTrackRows,
    "user_id,spotify_track_id,source,time_range"
  );

  log("persist", "all tables written");
  return { uniqueArtistIds: Array.from(artistIds) };
}

// --- Feature building (batched) ---

async function buildTrackFeatures(
  trackIds: string[],
  artistMap: Map<string, { genres: string[] }>
): Promise<number> {
  log("features", `building for ${trackIds.length} tracks`);
  const db = createServiceClient();

  const [tracksResult, taResult] = await Promise.all([
    db
      .from("tracks")
      .select("spotify_track_id, release_year, duration_ms, explicit")
      .in("spotify_track_id", trackIds),
    db
      .from("track_artists")
      .select("spotify_track_id, spotify_artist_id")
      .in("spotify_track_id", trackIds),
  ]);

  const tracks = tracksResult.data;
  if (!tracks || tracks.length === 0) return 0;

  const trackArtists = new Map<string, string[]>();
  for (const row of taResult.data ?? []) {
    const list = trackArtists.get(row.spotify_track_id) ?? [];
    list.push(row.spotify_artist_id);
    trackArtists.set(row.spotify_track_id, list);
  }

  const now = new Date().toISOString();
  const featureRows: Record<string, unknown>[] = [];

  for (const track of tracks) {
    const artistIdsForTrack = trackArtists.get(track.spotify_track_id) ?? [];
    const allGenres: string[] = [];
    for (const aid of artistIdsForTrack) {
      const artist = artistMap.get(aid);
      if (artist) allGenres.push(...artist.genres);
    }

    const genreVec = buildGenreVector(allGenres);

    featureRows.push({
      spotify_track_id: track.spotify_track_id,
      release_year: track.release_year ?? 2000,
      duration_ms: track.duration_ms ?? 0,
      explicit_val: track.explicit ? 1.0 : 0.0,
      genre_vector: JSON.stringify(Array.from(genreVec)),
      updated_at: now,
    });
  }

  await batchUpsert("track_features", featureRows, "spotify_track_id");
  log("features", `built ${featureRows.length} feature vectors`);
  return featureRows.length;
}

// --- Main entry ---

export async function runIngest(userId: string): Promise<IngestResult> {
  log("start", `user=${userId}`);
  const t0 = Date.now();

  // 1. Fetch tracks from Spotify
  log("step", "1/4 fetching top tracks");
  const topTracks = await fetchTopTracks(userId);

  log("step", "2/4 fetching saved tracks");
  const savedTracks = await fetchSavedTracks(userId);

  const allCollected = [...topTracks, ...savedTracks];
  log("collected", `${topTracks.length} top + ${savedTracks.length} saved = ${allCollected.length} total`);

  if (allCollected.length === 0) {
    log("done", "nothing to ingest");
    return { tracksIngested: 0, artistsFetched: 0, featuresBuilt: 0 };
  }

  // 2. Persist tracks, track_artists, user_tracks
  log("step", "3/4 persisting to DB");
  const { uniqueArtistIds } = await persistTracks(allCollected, userId);

  // 3. Resolve artist metadata
  log("step", `3/4 resolving ${uniqueArtistIds.length} artists`);
  const artistMap = await resolveArtists(userId, uniqueArtistIds);
  log("artists", `resolved ${artistMap.size} artists`);

  // 4. Build genre vectors
  log("step", "4/4 building features");
  const uniqueTrackIds = [...new Set(allCollected.map((c) => c.track.id))];
  const featuresBuilt = await buildTrackFeatures(uniqueTrackIds, artistMap);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log("done", `${uniqueTrackIds.length} tracks, ${artistMap.size} artists, ${featuresBuilt} features in ${elapsed}s`);

  return {
    tracksIngested: uniqueTrackIds.length,
    artistsFetched: artistMap.size,
    featuresBuilt,
  };
}
