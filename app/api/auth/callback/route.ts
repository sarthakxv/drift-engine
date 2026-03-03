import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}?error=no_code`);
  }

  const supabase = await createClient();
  const { data, error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !data.session) {
    return NextResponse.redirect(`${origin}?error=auth_failed`);
  }

  const { session } = data;
  const providerToken = session.provider_token;
  const providerRefreshToken = session.provider_refresh_token;

  if (providerToken) {
    try {
      // Fetch Spotify user profile
      const profileRes = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${providerToken}` },
      });

      if (!profileRes.ok) {
        throw new Error(`Spotify /me failed: ${profileRes.status}`);
      }

      const profile = await profileRes.json();
      const db = createServiceClient();

      // Upsert user record
      await db.from("users").upsert(
        {
          id: session.user.id,
          spotify_user_id: profile.id,
          display_name: profile.display_name ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      // Upsert Spotify tokens
      await db.from("spotify_tokens").upsert(
        {
          user_id: session.user.id,
          access_token: providerToken,
          refresh_token: providerRefreshToken ?? "",
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          scope: "user-read-private user-read-email user-top-read user-library-read playlist-modify-public playlist-modify-private",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch (e) {
      // User is authenticated even if token storage failed — log and continue
      console.error("Failed to store Spotify data:", e);
    }
  }

  return NextResponse.redirect(origin);
}
