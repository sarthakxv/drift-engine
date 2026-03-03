import { createServiceClient } from "@/lib/supabase/service";

const TOKEN_URL = "https://accounts.spotify.com/api/token";

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export async function refreshSpotifyToken(userId: string): Promise<string> {
  const db = createServiceClient();
  const { data: tokenRow, error } = await db
    .from("spotify_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .single();

  if (error || !tokenRow?.refresh_token) {
    throw new Error("No refresh token found for user");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokenRow.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify token refresh failed (${res.status}): ${body}`);
  }

  const data: SpotifyTokenResponse = await res.json();

  // Update stored tokens
  await db
    .from("spotify_tokens")
    .update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return data.access_token;
}
