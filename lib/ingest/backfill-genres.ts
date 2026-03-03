/**
 * One-time backfill: fetch Last.fm tags for artists with empty genres,
 * then rebuild track_features genre vectors.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { fetchLastFmTags } from "@/lib/genres/lastfm";
import { buildGenreVector } from "@/lib/model/genre-vocab";
import { env } from "@/lib/env";

export async function backfillGenres(): Promise<{
  artistsUpdated: number;
  featuresRebuilt: number;
}> {
  const db = createServiceClient();

  // 1. Load artists with empty genres
  const { data: artists } = await db
    .from("artists")
    .select("spotify_artist_id, name")
    .eq("genres", "{}");

  if (!artists || artists.length === 0) {
    console.log("[backfill] no artists with empty genres");
    return { artistsUpdated: 0, featuresRebuilt: 0 };
  }

  console.log(`[backfill] ${artists.length} artists with empty genres`);

  let updated = 0;
  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    if (i % 25 === 0 && i > 0) {
      console.log(`[backfill] progress: ${i}/${artists.length}`);
    }

    try {
      const tags = await fetchLastFmTags(artist.name, env.LASTFM_API_KEY);
      if (tags.length > 0) {
        await db
          .from("artists")
          .update({ genres: tags, updated_at: new Date().toISOString() })
          .eq("spotify_artist_id", artist.spotify_artist_id);
        updated++;
      }
    } catch (err) {
      console.error(`[backfill] ${artist.name} failed:`, err);
    }
  }

  console.log(`[backfill] updated genres for ${updated}/${artists.length} artists`);

  // 2. Rebuild all track_features genre vectors
  // Load full rows so upsert has all NOT NULL columns
  const { data: allFeatures } = await db
    .from("track_features")
    .select("spotify_track_id, release_year, duration_ms, explicit_val");

  if (!allFeatures || allFeatures.length === 0) {
    return { artistsUpdated: updated, featuresRebuilt: 0 };
  }

  const featuresByTrack = new Map(
    allFeatures.map((f) => [f.spotify_track_id, f])
  );
  const trackIds = allFeatures.map((f) => f.spotify_track_id);

  // Load artist genres fresh
  const { data: allArtists } = await db
    .from("artists")
    .select("spotify_artist_id, genres");

  const artistGenreMap = new Map<string, string[]>();
  for (const a of allArtists ?? []) {
    artistGenreMap.set(a.spotify_artist_id, a.genres ?? []);
  }

  // Load track→artist mappings
  const { data: trackArtists } = await db
    .from("track_artists")
    .select("spotify_track_id, spotify_artist_id")
    .in("spotify_track_id", trackIds);

  const trackArtistMap = new Map<string, string[]>();
  for (const ta of trackArtists ?? []) {
    const list = trackArtistMap.get(ta.spotify_track_id) ?? [];
    list.push(ta.spotify_artist_id);
    trackArtistMap.set(ta.spotify_track_id, list);
  }

  // Rebuild genre vectors
  const now = new Date().toISOString();
  let nonZero = 0;

  const updateRows: Record<string, unknown>[] = [];
  for (const trackId of trackIds) {
    const existing = featuresByTrack.get(trackId);
    if (!existing) continue;

    const artistIdsForTrack = trackArtistMap.get(trackId) ?? [];
    const allGenres: string[] = [];
    for (const aid of artistIdsForTrack) {
      const genres = artistGenreMap.get(aid);
      if (genres) allGenres.push(...genres);
    }
    const genreVec = buildGenreVector(allGenres);
    if (genreVec.some((v) => v > 0)) nonZero++;

    updateRows.push({
      spotify_track_id: trackId,
      release_year: existing.release_year,
      duration_ms: existing.duration_ms,
      explicit_val: existing.explicit_val,
      genre_vector: JSON.stringify(Array.from(genreVec)),
      updated_at: now,
    });
  }

  console.log(`[backfill] ${nonZero}/${trackIds.length} tracks have non-zero genre vectors`);

  // Batch upsert with all columns
  for (let i = 0; i < updateRows.length; i += 500) {
    const batch = updateRows.slice(i, i + 500);
    const { error } = await db
      .from("track_features")
      .upsert(batch, { onConflict: "spotify_track_id" });
    if (error) {
      console.error("[backfill] upsert error:", error);
    }
  }

  console.log(`[backfill] rebuilt ${updateRows.length} genre vectors`);
  return { artistsUpdated: updated, featuresRebuilt: updateRows.length };
}
