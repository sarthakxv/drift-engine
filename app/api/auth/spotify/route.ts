import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Supabase adds user-read-email automatically — don't duplicate it
const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-top-read",
  "user-library-read",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "login") {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        redirectTo: `${origin}/api/auth/callback`,
        scopes: SPOTIFY_SCOPES,
      },
    });

    if (error || !data.url) {
      return NextResponse.json(
        { error: "Failed to initiate Spotify login" },
        { status: 500 }
      );
    }

    return NextResponse.redirect(data.url);
  }

  if (action === "logout") {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return NextResponse.redirect(origin);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
