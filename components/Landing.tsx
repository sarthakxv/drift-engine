"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/sw-register";

export default function Landing() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <h1 className="text-4xl font-bold tracking-tight text-text-0">
        Drift Engine
      </h1>
      <p className="mt-3 text-lg text-text-1">
        Discover music beyond your comfort zone
      </p>
      <div className="mt-8">
        <a
          href="/api/auth/spotify?action=login"
          className="rounded-lg bg-accent-a px-6 py-3 text-sm font-semibold text-bg-0 transition-opacity hover:opacity-90"
        >
          Connect Spotify
        </a>
      </div>
    </main>
  );
}
