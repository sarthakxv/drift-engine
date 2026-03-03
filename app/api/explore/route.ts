import { createClient } from "@/lib/supabase/server";
import { runDiscovery } from "@/lib/explore/discovery";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

/** POST — trigger candidate discovery */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = body.limit ?? 15;

    const totalCandidates = await runDiscovery(user.id);

    // Return latest candidates
    const db = createServiceClient();
    const { data: candidates } = await db
      .from("exploration_candidates")
      .select(
        `
        id,
        cluster_id,
        spotify_track_id,
        distance,
        sweet_spot_score,
        diversity_score,
        final_score,
        rank,
        source,
        status,
        generated_at
      `
      )
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("final_score", { ascending: false })
      .limit(limit);

    return NextResponse.json({
      status: "complete",
      totalGenerated: totalCandidates,
      candidates: candidates ?? [],
    });
  } catch (err) {
    console.error("Exploration failed:", err);
    return NextResponse.json(
      { error: "Exploration failed", detail: String(err) },
      { status: 500 }
    );
  }
}
