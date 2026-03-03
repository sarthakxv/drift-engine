import { createServiceClient } from "@/lib/supabase/service";
import { refreshSpotifyToken } from "./token-refresh";

const SPOTIFY_BASE = "https://api.spotify.com/v1";
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 32000;

function jitter(ms: number): number {
  return ms * (0.5 + Math.random() * 0.5);
}

async function getValidToken(userId: string): Promise<string> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("spotify_tokens")
    .select("access_token, expires_at")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("No Spotify tokens found for user");
  }

  const expiresAt = new Date(data.expires_at).getTime();
  const buffer = 5 * 60 * 1000; // refresh 5 min before expiry

  if (Date.now() > expiresAt - buffer) {
    return refreshSpotifyToken(userId);
  }

  return data.access_token;
}

/**
 * Authenticated Spotify API fetch with automatic token refresh,
 * exponential backoff with jitter, and 429 Retry-After respect.
 */
export async function spotifyFetch(
  userId: string,
  path: string,
  options?: RequestInit
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const token = await getValidToken(userId);

    const res = await fetch(`${SPOTIFY_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });

    if (res.ok) return res;

    // Token was invalidated externally — force one refresh
    if (res.status === 401 && attempt === 0) {
      await refreshSpotifyToken(userId);
      continue;
    }

    // Rate limited — respect Retry-After header
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "1", 10);
      const backoff = jitter(BACKOFF_BASE_MS * 2 ** attempt);
      const wait = Math.min(
        Math.max(retryAfter * 1000, backoff),
        BACKOFF_MAX_MS
      );
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    lastError = new Error(`Spotify API ${res.status}: ${path}`);

    // Don't retry 4xx client errors (except 401/429 handled above)
    if (res.status >= 400 && res.status < 500) break;

    // Retry on 5xx with backoff
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      const wait = jitter(BACKOFF_BASE_MS * 2 ** attempt);
      await new Promise((r) => setTimeout(r, Math.min(wait, BACKOFF_MAX_MS)));
      continue;
    }
  }

  throw lastError ?? new Error(`Spotify API failed: ${path}`);
}
