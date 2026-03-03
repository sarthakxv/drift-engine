import { createClient } from "@/lib/supabase/server";
import Landing from "@/components/Landing";
import IngestButton from "@/components/IngestButton";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("display_name, spotify_user_id")
      .eq("id", user.id)
      .single();

    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6">
        <h1 className="text-4xl font-bold tracking-tight text-text-0">
          Drift Engine
        </h1>
        <p className="mt-3 text-lg text-text-1">
          Connected as{" "}
          <span className="font-semibold text-accent-a">
            {profile?.display_name ?? profile?.spotify_user_id ?? "Unknown"}
          </span>
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <IngestButton />
          <a
            href="/api/auth/spotify?action=logout"
            className="rounded-lg border border-text-1/20 px-5 py-2.5 text-sm font-medium text-text-1 transition-colors hover:border-text-1/40"
          >
            Disconnect
          </a>
        </div>
      </main>
    );
  }

  return <Landing />;
}
