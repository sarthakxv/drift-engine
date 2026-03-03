/**
 * Clustering orchestrator — loads user tracks, assembles 67-dim vectors,
 * runs weighted k-means, computes cluster stats, and persists everything.
 */

import { createServiceClient } from "@/lib/supabase/service";
import {
  assembleVector,
  computeNormStats,
  computeWeight,
  cosineDistance,
  type RawTrackRow,
} from "./normalize";
import { weightedKMeans, weightedPercentile } from "./kmeans";
import { fitPCA, projectPoint } from "./pca";
import { getActiveGenreIds } from "@/lib/model/genre-vocab";

/** pgvector returns strings like "[0.5,0.3,...]" — parse to number[] */
function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === "string") return JSON.parse(v) as number[];
  return [];
}

const DEFAULT_K = 6;

export interface ClusteringResult {
  clusters: number;
  totalTracks: number;
  iterations: number;
}

export async function runClustering(
  userId: string,
  k = DEFAULT_K
): Promise<ClusteringResult> {
  const db = createServiceClient();
  console.log("[clustering] starting for user", userId);

  // 1. Load user tracks
  const { data: userTracks, error: utErr } = await db
    .from("user_tracks")
    .select("spotify_track_id, source, rank_position")
    .eq("user_id", userId);

  if (utErr) {
    console.error("[clustering] load error:", utErr);
    throw new Error(`Failed to load tracks: ${utErr.message}`);
  }

  if (!userTracks || userTracks.length === 0) {
    console.log("[clustering] no tracks found — run ingest first");
    return { clusters: 0, totalTracks: 0, iterations: 0 };
  }

  // Load features for those tracks
  const allTrackIds = [...new Set(userTracks.map((t) => t.spotify_track_id))];
  const featureMap = new Map<
    string,
    { genre_vector: number[]; release_year: number; duration_ms: number; explicit_val: number }
  >();

  // Batch feature lookups (Supabase `.in()` has a limit)
  for (let i = 0; i < allTrackIds.length; i += 500) {
    const batch = allTrackIds.slice(i, i + 500);
    const { data: feats } = await db
      .from("track_features")
      .select("spotify_track_id, genre_vector, release_year, duration_ms, explicit_val")
      .in("spotify_track_id", batch);

    for (const f of feats ?? []) {
      featureMap.set(f.spotify_track_id, {
        genre_vector: parseVector(f.genre_vector),
        release_year: f.release_year,
        duration_ms: f.duration_ms,
        explicit_val: f.explicit_val,
      });
    }
  }

  // Deduplicate by track ID (keep highest-weight source)
  const trackMap = new Map<
    string,
    { row: RawTrackRow; trackId: string; genreVecRaw: number[] }
  >();
  for (const r of userTracks) {
    const feat = featureMap.get(r.spotify_track_id);
    if (!feat) continue;

    const row: RawTrackRow = {
      genre_vector: feat.genre_vector,
      release_year: feat.release_year,
      duration_ms: feat.duration_ms,
      explicit_val: feat.explicit_val,
      source: r.source,
      rank_position: r.rank_position,
    };

    const existing = trackMap.get(r.spotify_track_id);
    if (
      !existing ||
      computeWeight(row.source, row.rank_position) >
        computeWeight(existing.row.source, existing.row.rank_position)
    ) {
      trackMap.set(r.spotify_track_id, {
        row,
        trackId: r.spotify_track_id,
        genreVecRaw: feat.genre_vector,
      });
    }
  }

  const entries = [...trackMap.values()];
  const rows = entries.map((e) => e.row);
  const trackIds = entries.map((e) => e.trackId);
  const genreVecsRaw = entries.map((e) => e.genreVecRaw);

  console.log(`[clustering] ${rows.length} unique tracks loaded`);

  // 2. Compute normalization stats
  const normStats = computeNormStats(rows);
  console.log(
    `[clustering] norm stats: year=${normStats.meanYear.toFixed(1)}±${normStats.stdYear.toFixed(1)}, dur=${normStats.meanDur.toFixed(0)}±${normStats.stdDur.toFixed(0)}`
  );

  // 3. Assemble 67-dim vectors + weights
  const vectors: Float64Array[] = [];
  const weights: number[] = [];

  for (const row of rows) {
    vectors.push(
      assembleVector(
        row.genre_vector,
        row.release_year,
        row.duration_ms,
        row.explicit_val,
        normStats
      )
    );
    weights.push(computeWeight(row.source, row.rank_position));
  }

  // Adjust k if too few tracks
  let actualK = k;
  if (vectors.length < k) {
    actualK = Math.max(2, Math.floor(vectors.length / 2));
    console.log(`[clustering] reduced k to ${actualK} (only ${vectors.length} tracks)`);
  }

  // 4. Run weighted k-means
  console.log(`[clustering] running k-means (k=${actualK}, n=${vectors.length})`);
  const { centroids, assignments, iterations } = weightedKMeans(
    vectors,
    weights,
    actualK
  );
  console.log(`[clustering] converged in ${iterations} iterations`);

  // 5. Compute cluster statistics
  const clusterRows: Array<{
    cluster_index: number;
    centroid: number[];
    genre_profile: number[];
    top_genres: string[];
    variance: number;
    track_count: number;
    inner_radius: number;
    outer_radius: number;
    weight: number;
  }> = [];

  const clusterTrackEntries: Array<{
    clusterIndex: number;
    trackId: string;
    distance: number;
  }> = [];

  for (let c = 0; c < actualK; c++) {
    const memberIndices = assignments
      .map((a, i) => (a === c ? i : -1))
      .filter((i) => i >= 0);

    if (memberIndices.length === 0) continue;

    // Distances to centroid
    const distances = memberIndices.map((i) =>
      cosineDistance(vectors[i], centroids[c])
    );
    const memberWeights = memberIndices.map((i) => weights[i]);

    // Weighted variance
    const totalW = memberWeights.reduce((a, b) => a + b, 0);
    const variance =
      distances.reduce((s, d, j) => s + memberWeights[j] * d * d, 0) / totalW;

    // Radii
    const innerRadius = weightedPercentile(distances, memberWeights, 35);
    const outerRadius = weightedPercentile(distances, memberWeights, 80);

    // Genre profile: mean of unscaled genre vectors
    const genreProfile = new Array<number>(64).fill(0);
    for (const idx of memberIndices) {
      for (let g = 0; g < 64; g++) {
        genreProfile[g] += genreVecsRaw[idx][g];
      }
    }
    for (let g = 0; g < 64; g++) {
      genreProfile[g] /= memberIndices.length;
    }

    // Top 5 genres by magnitude
    const topGenres = getActiveGenreIds(
      new Float32Array(genreProfile)
    ).slice(0, 5);

    // Cluster weight: average member weight
    const clusterWeight = totalW / memberIndices.length;

    clusterRows.push({
      cluster_index: c,
      centroid: Array.from(centroids[c]),
      genre_profile: genreProfile,
      top_genres: topGenres,
      variance,
      track_count: memberIndices.length,
      inner_radius: innerRadius,
      outer_radius: outerRadius,
      weight: clusterWeight,
    });

    // Track cluster membership
    for (let j = 0; j < memberIndices.length; j++) {
      clusterTrackEntries.push({
        clusterIndex: c,
        trackId: trackIds[memberIndices[j]],
        distance: distances[j],
      });
    }
  }

  // 6. Persist to DB (transaction-like: delete old, insert new)
  console.log("[clustering] persisting clusters...");

  // Delete old clusters (cascade deletes cluster_tracks, exploration_candidates, feedback)
  await db.from("clusters").delete().eq("user_id", userId);

  // Insert new clusters
  const insertedClusters = [];
  for (const cr of clusterRows) {
    const { data, error } = await db
      .from("clusters")
      .insert({
        user_id: userId,
        cluster_index: cr.cluster_index,
        centroid: JSON.stringify(cr.centroid),
        genre_profile: JSON.stringify(cr.genre_profile),
        top_genres: cr.top_genres,
        variance: cr.variance,
        track_count: cr.track_count,
        inner_radius: cr.inner_radius,
        outer_radius: cr.outer_radius,
        weight: cr.weight,
        acceptance_near: 0.5,
        acceptance_mid: 0.5,
        acceptance_far: 0.5,
      })
      .select("id, cluster_index")
      .single();

    if (error) {
      console.error(`[clustering] insert cluster ${cr.cluster_index} error:`, error);
      continue;
    }
    insertedClusters.push(data);
  }

  // Map cluster_index → cluster UUID
  const indexToId = new Map<number, string>();
  for (const ic of insertedClusters) {
    indexToId.set(ic.cluster_index, ic.id);
  }

  // Insert cluster_tracks in batches
  const ctRows = clusterTrackEntries
    .filter((e) => indexToId.has(e.clusterIndex))
    .map((e) => ({
      cluster_id: indexToId.get(e.clusterIndex)!,
      spotify_track_id: e.trackId,
      distance: e.distance,
    }));

  for (let i = 0; i < ctRows.length; i += 500) {
    const batch = ctRows.slice(i, i + 500);
    await db.from("cluster_tracks").upsert(batch, {
      onConflict: "cluster_id,spotify_track_id",
    });
  }
  console.log(`[clustering] persisted ${ctRows.length} cluster_tracks`);

  // Update user norm stats
  await db
    .from("users")
    .update({
      norm_mean_year: normStats.meanYear,
      norm_std_year: normStats.stdYear,
      norm_mean_duration: normStats.meanDur,
      norm_std_duration: normStats.stdDur,
      last_cluster_at: new Date().toISOString(),
    })
    .eq("id", userId);

  console.log(
    `[clustering] done: ${insertedClusters.length} clusters, ${rows.length} tracks`
  );

  return {
    clusters: insertedClusters.length,
    totalTracks: rows.length,
    iterations,
  };
}

/**
 * Build /api/clusters response with PCA-projected map points.
 */
export async function getClustersWithMap(userId: string) {
  const db = createServiceClient();

  // Load clusters
  const { data: clusters } = await db
    .from("clusters")
    .select("*")
    .eq("user_id", userId)
    .order("cluster_index");

  if (!clusters || clusters.length === 0) {
    return { clusters: [], mapPoints: [] };
  }

  // Load norm stats
  const { data: user } = await db
    .from("users")
    .select("norm_mean_year, norm_std_year, norm_mean_duration, norm_std_duration")
    .eq("id", userId)
    .single();

  if (!user?.norm_mean_year) {
    return { clusters, mapPoints: [] };
  }

  const normStats = {
    meanYear: user.norm_mean_year,
    stdYear: user.norm_std_year,
    meanDur: user.norm_mean_duration,
    stdDur: user.norm_std_duration,
  };

  // Load all cluster tracks with features for PCA
  const clusterIds = clusters.map((c) => c.id);
  const { data: ctRows } = await db
    .from("cluster_tracks")
    .select("cluster_id, spotify_track_id, distance")
    .in("cluster_id", clusterIds);

  if (!ctRows || ctRows.length === 0) {
    return { clusters, mapPoints: [] };
  }

  const allTrackIds = [...new Set(ctRows.map((ct) => ct.spotify_track_id))];

  // Load features for these tracks
  const { data: features } = await db
    .from("track_features")
    .select("spotify_track_id, genre_vector, release_year, duration_ms, explicit_val")
    .in("spotify_track_id", allTrackIds);

  if (!features || features.length === 0) {
    return { clusters, mapPoints: [] };
  }

  const featureMap = new Map(features.map((f) => [f.spotify_track_id, f]));

  // Assemble 67-dim vectors for PCA
  const pVectors: Float64Array[] = [];
  const pTrackIds: string[] = [];
  const pClusterIds: string[] = [];

  // Build lookup: trackId → clusterId
  const trackToCluster = new Map<string, string>();
  for (const ct of ctRows) {
    trackToCluster.set(ct.spotify_track_id, ct.cluster_id);
  }

  for (const trackId of allTrackIds) {
    const feat = featureMap.get(trackId);
    if (!feat) continue;

    const vec = assembleVector(
      parseVector(feat.genre_vector),
      feat.release_year,
      feat.duration_ms,
      feat.explicit_val,
      normStats
    );
    pVectors.push(vec);
    pTrackIds.push(trackId);
    pClusterIds.push(trackToCluster.get(trackId) ?? "");
  }

  // Also include cluster centroids
  for (const cluster of clusters) {
    const centroidArr =
      typeof cluster.centroid === "string"
        ? JSON.parse(cluster.centroid)
        : cluster.centroid;
    pVectors.push(new Float64Array(centroidArr));
    pTrackIds.push(`centroid:${cluster.id}`);
    pClusterIds.push(cluster.id);
  }

  // Fit PCA and project
  const pca = fitPCA(pVectors);
  const mapPoints = pVectors.map((vec, i) => {
    const [x, y] = projectPoint(vec, pca);
    return {
      trackId: pTrackIds[i],
      clusterId: pClusterIds[i],
      x,
      y,
      isCentroid: pTrackIds[i].startsWith("centroid:"),
    };
  });

  return { clusters, mapPoints };
}
