/**
 * Exploration scoring formula — scores candidate tracks against clusters.
 */

import {
  assembleVector,
  cosineDistance,
  type NormStats,
} from "@/lib/model/normalize";

interface ClusterForScoring {
  centroid: number[];
  genre_profile: number[] | null;
  inner_radius: number;
  outer_radius: number;
  weight: number;
  acceptance_near: number;
  acceptance_mid: number;
  acceptance_far: number;
}

interface CandidateFeatures {
  genre_vector: number[];
  release_year: number;
  duration_ms: number;
  explicit_val: number;
}

export interface ScoredCandidate {
  distance: number;
  sweetSpotScore: number;
  diversityScore: number;
  finalScore: number;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function scoreCandidate(
  candidate: CandidateFeatures,
  cluster: ClusterForScoring,
  normStats: NormStats,
  existingArtistCount: number
): ScoredCandidate | null {
  // Assemble 67-dim vector for candidate
  const candidateVec = assembleVector(
    candidate.genre_vector,
    candidate.release_year,
    candidate.duration_ms,
    candidate.explicit_val,
    normStats
  );

  const centroidVec = new Float64Array(cluster.centroid);
  const d = cosineDistance(candidateVec, centroidVec);

  // Filter: must be within exploration zone
  if (d <= cluster.inner_radius || d >= cluster.outer_radius) return null;

  // Sweet spot (Gaussian)
  const range = cluster.outer_radius - cluster.inner_radius;
  if (range <= 0) return null;
  const mu = cluster.inner_radius + 0.62 * range;
  const sigma = 0.18 * range;
  const sweetSpotScore = Math.exp(-((d - mu) ** 2) / (2 * sigma ** 2));

  // Diversity
  const artistNovelty = 1 - Math.min(existingArtistCount / 3, 1);
  const genreNovelty =
    cluster.genre_profile
      ? 1 - cosineSim(candidate.genre_vector, cluster.genre_profile)
      : 0.5;
  const diversityScore = 0.6 * artistNovelty + 0.4 * genreNovelty;

  // Acceptance region bias
  const relDist = (d - cluster.inner_radius) / range;
  const regionBias =
    relDist < 0.33
      ? cluster.acceptance_near
      : relDist < 0.66
        ? cluster.acceptance_mid
        : cluster.acceptance_far;

  const finalScore =
    0.55 * sweetSpotScore +
    0.3 * diversityScore +
    0.15 * cluster.weight * regionBias;

  return { distance: d, sweetSpotScore, diversityScore, finalScore };
}
