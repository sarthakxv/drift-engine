/**
 * Weighted k-means clustering with cosine distance and k-means++ initialization.
 */

import { cosineDistance } from "./normalize";

const DIM = 67;
const MAX_ITER = 25;
const CONVERGENCE = 1e-4;

export interface KMeansResult {
  centroids: Float64Array[];
  assignments: number[];
  iterations: number;
}

/** Weighted mean of vectors. */
function weightedMean(
  vectors: Float64Array[],
  weights: number[],
  indices: number[]
): Float64Array {
  const result = new Float64Array(DIM);
  let totalW = 0;
  for (const idx of indices) {
    const w = weights[idx];
    totalW += w;
    for (let d = 0; d < DIM; d++) {
      result[d] += vectors[idx][d] * w;
    }
  }
  if (totalW > 0) {
    for (let d = 0; d < DIM; d++) result[d] /= totalW;
  }
  return result;
}

/** K-means++ initialization. */
function kmeansPlusPlusInit(
  vectors: Float64Array[],
  weights: number[],
  k: number
): Float64Array[] {
  const n = vectors.length;
  const centroids: Float64Array[] = [];

  // Pick first centroid weighted by track weight
  const totalW = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalW;
  let firstIdx = 0;
  for (let i = 0; i < n; i++) {
    r -= weights[i];
    if (r <= 0) {
      firstIdx = i;
      break;
    }
  }
  centroids.push(Float64Array.from(vectors[firstIdx]));

  // Pick remaining centroids
  const dists = new Float64Array(n).fill(Infinity);

  for (let c = 1; c < k; c++) {
    // Update min distances to nearest centroid
    for (let i = 0; i < n; i++) {
      const d = cosineDistance(vectors[i], centroids[c - 1]);
      if (d < dists[i]) dists[i] = d;
    }

    // Weighted probability proportional to distance^2 * weight
    let sumD = 0;
    for (let i = 0; i < n; i++) sumD += dists[i] * dists[i] * weights[i];

    r = Math.random() * sumD;
    let nextIdx = 0;
    for (let i = 0; i < n; i++) {
      r -= dists[i] * dists[i] * weights[i];
      if (r <= 0) {
        nextIdx = i;
        break;
      }
    }
    centroids.push(Float64Array.from(vectors[nextIdx]));
  }

  return centroids;
}

export function weightedKMeans(
  vectors: Float64Array[],
  weights: number[],
  k: number
): KMeansResult {
  const n = vectors.length;
  if (n <= k) {
    return {
      centroids: vectors.map((v) => Float64Array.from(v)),
      assignments: vectors.map((_, i) => i),
      iterations: 0,
    };
  }

  let centroids = kmeansPlusPlusInit(vectors, weights, k);
  const assignments = new Array<number>(n).fill(0);
  let iter = 0;

  for (; iter < MAX_ITER; iter++) {
    // Assign each vector to nearest centroid
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let minC = 0;
      for (let c = 0; c < k; c++) {
        const d = cosineDistance(vectors[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          minC = c;
        }
      }
      assignments[i] = minC;
    }

    // Recompute centroids
    const newCentroids: Float64Array[] = [];
    for (let c = 0; c < k; c++) {
      const members = assignments
        .map((a, i) => (a === c ? i : -1))
        .filter((i) => i >= 0);
      if (members.length === 0) {
        // Empty cluster — reinitialize to random point
        newCentroids.push(
          Float64Array.from(vectors[Math.floor(Math.random() * n)])
        );
      } else {
        newCentroids.push(weightedMean(vectors, weights, members));
      }
    }

    // Check convergence
    let maxShift = 0;
    for (let c = 0; c < k; c++) {
      const shift = cosineDistance(centroids[c], newCentroids[c]);
      if (shift > maxShift) maxShift = shift;
    }

    centroids = newCentroids;
    if (maxShift < CONVERGENCE) {
      iter++;
      break;
    }
  }

  return { centroids, assignments, iterations: iter };
}

/** Compute weighted percentile of an array of values. */
export function weightedPercentile(
  values: number[],
  weights: number[],
  percentile: number
): number {
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] }))
    .sort((a, b) => a.v - b.v);

  const totalW = pairs.reduce((s, p) => s + p.w, 0);
  const target = (percentile / 100) * totalW;
  let cumW = 0;

  for (const { v, w } of pairs) {
    cumW += w;
    if (cumW >= target) return v;
  }

  return pairs[pairs.length - 1].v;
}
