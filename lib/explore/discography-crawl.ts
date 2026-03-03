/**
 * Strategy 2: Discography crawl for candidate discovery.
 * Fetches albums and tracks for boundary artists.
 */

import { spotifyFetch } from "@/lib/spotify/client";
import type { DiscoverySource } from "@/lib/types";

interface RawCandidate {
  spotifyTrackId: string;
  source: DiscoverySource;
}

/**
 * Crawl discography for given artist IDs.
 * Fetches recent albums (last 5 years) and their tracks.
 */
export async function discographyCrawl(
  userId: string,
  artistIds: string[],
  existingTrackIds: Set<string>,
  source: DiscoverySource = "discography_crawl"
): Promise<RawCandidate[]> {
  const candidates: RawCandidate[] = [];
  const seen = new Set<string>();
  const fiveYearsAgo = new Date().getFullYear() - 5;

  for (const artistId of artistIds) {
    try {
      // Fetch albums
      const albumRes = await spotifyFetch(
        userId,
        `/artists/${artistId}/albums?include_groups=album,single&limit=20`
      );
      const albumData = await albumRes.json();

      // Filter to recent albums
      const recentAlbums = (albumData.items ?? []).filter(
        (album: { release_date: string }) => {
          const year = parseInt(album.release_date?.substring(0, 4) ?? "0", 10);
          return year >= fiveYearsAgo;
        }
      );

      // Fetch tracks from up to 3 recent albums
      for (const album of recentAlbums.slice(0, 3)) {
        try {
          const tracksRes = await spotifyFetch(
            userId,
            `/albums/${album.id}/tracks?limit=50`
          );
          const tracksData = await tracksRes.json();

          for (const track of tracksData.items ?? []) {
            if (
              !seen.has(track.id) &&
              !existingTrackIds.has(track.id)
            ) {
              seen.add(track.id);
              candidates.push({ spotifyTrackId: track.id, source });
            }
          }
        } catch {
          // Skip failed album track fetches
        }
      }
    } catch {
      // Skip failed artist album fetches
    }
  }

  return candidates;
}
