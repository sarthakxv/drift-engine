import { createClient } from "@/lib/supabase/server";
import { backfillGenres } from "@/lib/ingest/backfill-genres";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillGenres();
    return NextResponse.json({ status: "complete", ...result });
  } catch (err) {
    console.error("Backfill failed:", err);
    return NextResponse.json(
      { error: "Backfill failed", detail: String(err) },
      { status: 500 }
    );
  }
}
