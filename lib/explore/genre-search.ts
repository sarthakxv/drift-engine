/**
 * Strategy 1: Genre-based Spotify search for candidate discovery.
 */

import { spotifyFetch } from "@/lib/spotify/client";
import { SUPER_GENRES } from "@/lib/model/genre-vocab";
import type { DiscoverySource } from "@/lib/types";

interface RawCandidate {
  spotifyTrackId: string;
  source: DiscoverySource;
}

/**
 * Search Spotify for tracks matching a cluster's top genres.
 * Uses tiered approach: structured genre filter, then free-text fallback.
 */
export async function genreSearch(
  userId: string,
  topGenres: string[],
  topArtists: string[],
  existingTrackIds: Set<string>,
  maxQueries = 5
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const seen = new Set<string>();

  // Map super-genre IDs back to human-readable keywords for search
  const genreKeywords = topGenres.slice(0, 5).map((gid) => {
    const sg = SUPER_GENRES.find((s) => s.id === gid);
    return sg ? sg.keywords[0] : gid;
  });

  const yearRanges = ["2022-2026", "2018-2026", "2010-2026"];
  let queriesUsed = 0;

  // Primary: structured genre filter
  for (const keyword of genreKeywords) {
    if (queriesUsed >= maxQueries) break;

    const yearRange = yearRanges[queriesUsed % yearRanges.length];
    const query = `genre:"${keyword}" year:${yearRange}`;
    const results = await searchTracks(userId, query);
    queriesUsed++;

    let added = 0;
    for (const trackId of results) {
      if (!seen.has(trackId) && !existingTrackIds.has(trackId)) {
        seen.add(trackId);
        candidates.push({ spotifyTrackId: trackId, source: "genre_search" });
        added++;
      }
    }

    // Fallback: free-text if structured filter yields few results
    if (added < 3 && queriesUsed < maxQueries) {
      const fallbackQuery = topArtists.length > 0
        ? `"${keyword}" artist:"${topArtists[0]}"`
        : `"${keyword}" new`;
      const fallbackResults = await searchTracks(userId, fallbackQuery);
      queriesUsed++;

      for (const trackId of fallbackResults) {
        if (!seen.has(trackId) && !existingTrackIds.has(trackId)) {
          seen.add(trackId);
          candidates.push({ spotifyTrackId: trackId, source: "genre_search" });
        }
      }
    }
  }

  return candidates;
}

async function searchTracks(
  userId: string,
  query: string
): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(query);
    const res = await spotifyFetch(
      userId,
      `/search?q=${encoded}&type=track&limit=10`
    );
    const data = await res.json();
    return (data.tracks?.items ?? []).map(
      (t: { id: string }) => t.id
    );
  } catch {
    return [];
  }
}
