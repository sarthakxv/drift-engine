import { createClient } from "@/lib/supabase/server";
import { runClustering, getClustersWithMap } from "@/lib/model/clustering";
import { NextResponse } from "next/server";

/** GET — return clusters + PCA-projected map points */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getClustersWithMap(user.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Clusters GET failed:", err);
    return NextResponse.json(
      { error: "Failed to load clusters", detail: String(err) },
      { status: 500 }
    );
  }
}

/** POST — trigger clustering */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runClustering(user.id);
    return NextResponse.json({ status: "complete", ...result });
  } catch (err) {
    console.error("Clustering failed:", err);
    return NextResponse.json(
      { error: "Clustering failed", detail: String(err) },
      { status: 500 }
    );
  }
}
