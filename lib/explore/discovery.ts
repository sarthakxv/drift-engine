/**
 * Candidate discovery orchestrator — runs all three strategies,
 * scores candidates, persists top N per cluster.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { buildGenreVector } from "@/lib/model/genre-vocab";
import { resolveArtists } from "@/lib/ingest/artist-cache";
import { scoreCandidate } from "./scoring";
import { genreSearch } from "./genre-search";
import { discographyCrawl } from "./discography-crawl";
import type { NormStats } from "@/lib/model/normalize";

/** pgvector returns strings like "[0.5,0.3,...]" — parse to number[] */
function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === "string") return JSON.parse(v) as number[];
  return [];
}

const TOP_N_PER_CLUSTER = 15;

interface ClusterRow {
  id: string;
  centroid: number[];
  genre_profile: number[] | null;
  top_genres: string[];
  inner_radius: number;
  outer_radius: number;
  weight: number;
  acceptance_near: number;
  acceptance_mid: number;
  acceptance_far: number;
}

export async function runDiscovery(userId: string): Promise<number> {
  const db = createServiceClient();
  console.log("[discovery] starting for user", userId);

  // Load user's normalization stats
  const { data: user } = await db
    .from("users")
    .select("norm_mean_year, norm_std_year, norm_mean_duration, norm_std_duration, last_discovery_at")
    .eq("id", userId)
    .single();

  if (!user?.norm_mean_year) {
    console.log("[discovery] no norm stats — run clustering first");
    return 0;
  }

  const normStats: NormStats = {
    meanYear: user.norm_mean_year,
    stdYear: user.norm_std_year,
    meanDur: user.norm_mean_duration,
    stdDur: user.norm_std_duration,
  };

  // Load clusters
  const { data: clusters } = await db
    .from("clusters")
    .select("id, centroid, genre_profile, top_genres, inner_radius, outer_radius, weight, acceptance_near, acceptance_mid, acceptance_far")
    .eq("user_id", userId);

  if (!clusters || clusters.length === 0) {
    console.log("[discovery] no clusters found");
    return 0;
  }

  // Load existing user track IDs to filter out
  const { data: existingTracks } = await db
    .from("user_tracks")
    .select("spotify_track_id")
    .eq("user_id", userId);
  const existingIds = new Set((existingTracks ?? []).map((t) => t.spotify_track_id));

  // Load top artists per cluster for search queries
  const { data: clusterTracks } = await db
    .from("cluster_tracks")
    .select("cluster_id, spotify_track_id");
  const clusterTrackMap = new Map<string, string[]>();
  for (const ct of clusterTracks ?? []) {
    const list = clusterTrackMap.get(ct.cluster_id) ?? [];
    list.push(ct.spotify_track_id);
    clusterTrackMap.set(ct.cluster_id, list);
  }

  // Strategy 3: seed expansion from liked candidates
  const lastDiscovery = user.last_discovery_at ?? "1970-01-01T00:00:00Z";
  const { data: seedRows } = await db.rpc("get_seed_artists", {
    p_user_id: userId,
    p_since: lastDiscovery,
  });

  const seedArtistIds = (seedRows ?? []).map(
    (r: { spotify_artist_id: string }) => r.spotify_artist_id
  );

  let totalCandidates = 0;

  // Parse pgvector strings from DB
  const parsedClusters = (clusters as ClusterRow[]).map((c) => ({
    ...c,
    centroid: parseVector(c.centroid),
    genre_profile: c.genre_profile ? parseVector(c.genre_profile) : null,
  }));

  for (const cluster of parsedClusters) {
    console.log(`[discovery] processing cluster ${cluster.id}`);

    // Get top artist names from cluster for search fallback
    const trackIdsInCluster = clusterTrackMap.get(cluster.id) ?? [];
    const { data: artistNames } = await db
      .from("track_artists")
      .select("spotify_artist_id")
      .in("spotify_track_id", trackIdsInCluster.slice(0, 20));
    const topArtistIds = [...new Set((artistNames ?? []).map((a) => a.spotify_artist_id))].slice(0, 5);
    const { data: artistRows } = await db
      .from("artists")
      .select("name")
      .in("spotify_artist_id", topArtistIds);
    const topArtistNames = (artistRows ?? []).map((a) => a.name);

    // Strategy 1: Genre search
    const genreCandidates = await genreSearch(
      userId,
      cluster.top_genres,
      topArtistNames,
      existingIds
    );
    console.log(`[discovery] genre search: ${genreCandidates.length} candidates`);

    // Strategy 2: Discography crawl (boundary artists)
    const boundaryArtists = topArtistIds.slice(0, 4);
    const discoCandidates = await discographyCrawl(
      userId,
      boundaryArtists,
      existingIds
    );
    console.log(`[discovery] discography: ${discoCandidates.length} candidates`);

    // Strategy 3: Seed expansion
    let seedCandidates: Awaited<ReturnType<typeof discographyCrawl>> = [];
    if (seedArtistIds.length > 0) {
      seedCandidates = await discographyCrawl(
        userId,
        seedArtistIds.slice(0, 6),
        existingIds,
        "seed_expansion"
      );
      console.log(`[discovery] seed expansion: ${seedCandidates.length} candidates`);
    }

    // Merge all raw candidates
    const allRaw = [...genreCandidates, ...discoCandidates, ...seedCandidates];
    const uniqueTrackIds = [...new Set(allRaw.map((c) => c.spotifyTrackId))];
    const sourceMap = new Map(allRaw.map((c) => [c.spotifyTrackId, c.source]));

    if (uniqueTrackIds.length === 0) continue;

    // Ensure tracks + artists are in DB
    const newArtistIds = new Set<string>();
    const trackRows: Record<string, unknown>[] = [];

    for (const trackId of uniqueTrackIds) {
      // Check if track already exists
      const { data: existing } = await db
        .from("tracks")
        .select("spotify_track_id")
        .eq("spotify_track_id", trackId)
        .single();

      if (!existing) {
        // Fetch track metadata
        try {
          const res = await (await import("@/lib/spotify/client")).spotifyFetch(
            userId,
            `/tracks/${trackId}`
          );
          const t = await res.json();
          trackRows.push({
            spotify_track_id: t.id,
            name: t.name,
            album_name: t.album?.name ?? null,
            album_id: t.album?.id ?? null,
            release_date: t.album?.release_date ?? null,
            release_year: parseInt(t.album?.release_date?.substring(0, 4) ?? "2000", 10),
            duration_ms: t.duration_ms,
            explicit: t.explicit,
            spotify_url: t.external_urls?.spotify ?? null,
            updated_at: new Date().toISOString(),
          });
          for (const a of t.artists ?? []) {
            newArtistIds.add(a.id);
          }
        } catch {
          // Skip tracks we can't fetch
        }
      }
    }

    if (trackRows.length > 0) {
      await db.from("tracks").upsert(trackRows, { onConflict: "spotify_track_id" });
    }

    // Resolve new artists
    if (newArtistIds.size > 0) {
      await resolveArtists(userId, [...newArtistIds]);
    }

    // Score candidates
    const scored: Array<{
      trackId: string;
      source: string;
      score: ReturnType<typeof scoreCandidate>;
    }> = [];

    for (const trackId of uniqueTrackIds) {
      // Load features
      const { data: features } = await db
        .from("track_features")
        .select("genre_vector, release_year, duration_ms, explicit_val")
        .eq("spotify_track_id", trackId)
        .single();

      if (!features) continue;

      // Count how many of this track's artists are already in user's library
      const { data: ta } = await db
        .from("track_artists")
        .select("spotify_artist_id")
        .eq("spotify_track_id", trackId);

      const { count: existingArtistCount } = await db
        .from("user_tracks")
        .select("spotify_track_id", { count: "exact", head: true })
        .in(
          "spotify_track_id",
          (ta ?? []).map((a) => a.spotify_artist_id)
        );

      const result = scoreCandidate(
        {
          genre_vector: parseVector(features.genre_vector),
          release_year: features.release_year,
          duration_ms: features.duration_ms,
          explicit_val: features.explicit_val,
        },
        cluster,
        normStats,
        existingArtistCount ?? 0
      );

      if (result) {
        scored.push({
          trackId,
          source: sourceMap.get(trackId) ?? "genre_search",
          score: result,
        });
      }
    }

    // Sort by final score, keep top N
    scored.sort((a, b) => (b.score?.finalScore ?? 0) - (a.score?.finalScore ?? 0));
    const topCandidates = scored.slice(0, TOP_N_PER_CLUSTER);

    // Persist to exploration_candidates
    const candidateRows = topCandidates.map((c, i) => ({
      user_id: userId,
      cluster_id: cluster.id,
      spotify_track_id: c.trackId,
      distance: c.score?.distance ?? 0,
      sweet_spot_score: c.score?.sweetSpotScore ?? 0,
      diversity_score: c.score?.diversityScore ?? 0,
      final_score: c.score?.finalScore ?? 0,
      rank: i + 1,
      source: c.source,
      status: "pending",
      generated_at: new Date().toISOString(),
    }));

    if (candidateRows.length > 0) {
      await db.from("exploration_candidates").insert(candidateRows);
      totalCandidates += candidateRows.length;
    }

    console.log(`[discovery] cluster ${cluster.id}: ${topCandidates.length} candidates saved`);
  }

  // Update last_discovery_at
  await db
    .from("users")
    .update({ last_discovery_at: new Date().toISOString() })
    .eq("id", userId);

  console.log(`[discovery] done: ${totalCandidates} total candidates`);
  return totalCandidates;
}
