"use client";

import { useState } from "react";

export default function IngestButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [result, setResult] = useState<string>("");

  async function handleIngest() {
    setStatus("loading");
    setResult("");

    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setResult(data.error ?? "Unknown error");
        return;
      }

      setStatus("done");
      setResult(
        `${data.tracksIngested} tracks, ${data.artistsFetched} artists, ${data.featuresBuilt} features`
      );
    } catch (err) {
      setStatus("error");
      setResult(String(err));
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleIngest}
        disabled={status === "loading"}
        className="rounded-lg bg-accent-a px-6 py-3 text-sm font-semibold text-bg-0 transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {status === "loading" ? "Syncing..." : "Sync Library"}
      </button>
      {result && (
        <p
          className={`text-sm ${status === "error" ? "text-accent-c" : "text-text-1"}`}
        >
          {result}
        </p>
      )}
    </div>
  );
}
