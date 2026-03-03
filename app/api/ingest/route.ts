import { createClient } from "@/lib/supabase/server";
import { runIngest } from "@/lib/ingest/pipeline";
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
    const result = await runIngest(user.id);
    return NextResponse.json({ status: "complete", ...result });
  } catch (err) {
    console.error("Ingest failed:", err);
    return NextResponse.json(
      { error: "Ingestion failed", detail: String(err) },
      { status: 500 }
    );
  }
}
