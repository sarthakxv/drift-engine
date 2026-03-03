/**
 * Last.fm fallback for artist genre/tag data.
 * Spotify's artist.genres field is empty post-Feb 2026;
 * Last.fm's artist.getTopTags is our primary genre source.
 */

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

interface LastFmTag {
  name: string;
  count: number;
}

/**
 * Fetch top tags for an artist from Last.fm.
 * Returns lowercased tag names (similar to Spotify's genre strings).
 */
export async function fetchLastFmTags(
  artistName: string,
  apiKey: string,
  maxTags = 10
): Promise<string[]> {
  const params = new URLSearchParams({
    method: "artist.getTopTags",
    artist: artistName,
    api_key: apiKey,
    format: "json",
  });

  try {
    const res = await fetch(`${LASTFM_BASE}?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    const tags: LastFmTag[] = data?.toptags?.tag ?? [];

    return tags
      .filter((t) => t.count > 0)
      .slice(0, maxTags)
      .map((t) => t.name.toLowerCase());
  } catch {
    return [];
  }
}
