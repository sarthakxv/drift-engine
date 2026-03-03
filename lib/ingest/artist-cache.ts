import { spotifyFetch } from "@/lib/spotify/client";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchLastFmTags } from "@/lib/genres/lastfm";
import { env } from "@/lib/env";

const CACHE_MAX_AGE_DAYS = 30;

interface ArtistRow {
  spotify_artist_id: string;
  name: string;
  genres: string[];
  image_url: string | null;
}

/**
 * Resolve artist metadata for a list of artist IDs.
 * Returns all artists (from cache + freshly fetched).
 * Artists cached within 30 days are not re-fetched.
 */
export async function resolveArtists(
  userId: string,
  artistIds: string[]
): Promise<Map<string, ArtistRow>> {
  if (artistIds.length === 0) return new Map();

  const db = createServiceClient();
  const cutoff = new Date(
    Date.now() - CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // Check cache for all artist IDs
  const { data: cached } = await db
    .from("artists")
    .select("spotify_artist_id, name, genres, image_url")
    .in("spotify_artist_id", artistIds)
    .gte("fetched_at", cutoff);

  const result = new Map<string, ArtistRow>();
  const cachedIds = new Set<string>();

  for (const row of cached ?? []) {
    result.set(row.spotify_artist_id, row);
    cachedIds.add(row.spotify_artist_id);
  }

  const uncached = artistIds.filter((id) => !cachedIds.has(id));
  console.log(
    `[ingest] artists: ${cachedIds.size} cached, ${uncached.length} to fetch`
  );

  for (let i = 0; i < uncached.length; i++) {
    const artistId = uncached[i];
    if (i % 25 === 0 && i > 0) {
      console.log(`[ingest] artists: fetched ${i}/${uncached.length}`);
    }

    try {
      const res = await spotifyFetch(userId, `/artists/${artistId}`);
      const data = await res.json();

      // Spotify genres are empty post-Feb 2026 — fall back to Last.fm tags
      let genres: string[] = data.genres ?? [];
      if (genres.length === 0) {
        genres = await fetchLastFmTags(data.name, env.LASTFM_API_KEY);
      }

      const row: ArtistRow = {
        spotify_artist_id: data.id,
        name: data.name,
        genres,
        image_url: data.images?.[0]?.url ?? null,
      };

      await db.from("artists").upsert(
        {
          ...row,
          fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "spotify_artist_id" }
      );

      result.set(data.id, row);
    } catch (err) {
      console.error(`[ingest] artist ${artistId} failed:`, err);
    }
  }

  console.log(`[ingest] artists: done, ${result.size} total`);
  return result;
}
