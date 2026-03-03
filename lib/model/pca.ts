/**
 * Simple PCA: 67-dim → 2-dim projection.
 * Computes top 2 principal components via power iteration on the covariance matrix.
 * Suitable for <5k vectors — runs in <50ms.
 */

const DIM = 67;

export interface PCAProjection {
  components: [Float64Array, Float64Array]; // two eigenvectors
  mean: Float64Array;
}

function subtractMean(vectors: Float64Array[]): {
  centered: Float64Array[];
  mean: Float64Array;
} {
  const n = vectors.length;
  const mean = new Float64Array(DIM);
  for (const v of vectors) {
    for (let d = 0; d < DIM; d++) mean[d] += v[d];
  }
  for (let d = 0; d < DIM; d++) mean[d] /= n;

  const centered = vectors.map((v) => {
    const c = new Float64Array(DIM);
    for (let d = 0; d < DIM; d++) c[d] = v[d] - mean[d];
    return c;
  });

  return { centered, mean };
}

/** Multiply covariance (implicitly defined by centered data) by a vector: C * x = (1/n) * X^T * (X * x) */
function covTimesVec(
  centered: Float64Array[],
  x: Float64Array
): Float64Array {
  const n = centered.length;
  // Compute X * x (project each sample onto x)
  const projections = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let dot = 0;
    for (let d = 0; d < DIM; d++) dot += centered[i][d] * x[d];
    projections[i] = dot;
  }

  // Compute X^T * projections
  const result = new Float64Array(DIM);
  for (let i = 0; i < n; i++) {
    const p = projections[i];
    for (let d = 0; d < DIM; d++) result[d] += centered[i][d] * p;
  }

  for (let d = 0; d < DIM; d++) result[d] /= n;
  return result;
}

function normalize(v: Float64Array): number {
  let norm = 0;
  for (let d = 0; d < DIM; d++) norm += v[d] * v[d];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let d = 0; d < DIM; d++) v[d] /= norm;
  }
  return norm;
}

/** Find top eigenvector via power iteration. */
function powerIteration(
  centered: Float64Array[],
  maxIter = 100
): Float64Array {
  const v = new Float64Array(DIM);
  for (let d = 0; d < DIM; d++) v[d] = Math.random() - 0.5;
  normalize(v);

  for (let i = 0; i < maxIter; i++) {
    const next = covTimesVec(centered, v);
    normalize(next);

    // Check convergence
    let dot = 0;
    for (let d = 0; d < DIM; d++) dot += v[d] * next[d];
    for (let d = 0; d < DIM; d++) v[d] = next[d];
    if (Math.abs(dot) > 1 - 1e-8) break;
  }

  return v;
}

/** Deflate: remove the component along `eigenvec` from all centered vectors. */
function deflate(
  centered: Float64Array[],
  eigenvec: Float64Array
): Float64Array[] {
  return centered.map((c) => {
    let dot = 0;
    for (let d = 0; d < DIM; d++) dot += c[d] * eigenvec[d];
    const deflated = new Float64Array(DIM);
    for (let d = 0; d < DIM; d++) deflated[d] = c[d] - dot * eigenvec[d];
    return deflated;
  });
}

export function fitPCA(vectors: Float64Array[]): PCAProjection {
  if (vectors.length < 2) {
    return {
      components: [new Float64Array(DIM), new Float64Array(DIM)],
      mean: new Float64Array(DIM),
    };
  }

  const { centered, mean } = subtractMean(vectors);

  // First principal component
  const pc1 = powerIteration(centered);

  // Deflate and find second
  const deflated = deflate(centered, pc1);
  const pc2 = powerIteration(deflated);

  return { components: [pc1, pc2], mean };
}

/** Project a single 67-dim vector to 2D using a fitted PCA. */
export function projectPoint(
  vec: Float64Array,
  pca: PCAProjection
): [number, number] {
  let x = 0;
  let y = 0;
  for (let d = 0; d < DIM; d++) {
    const centered = vec[d] - pca.mean[d];
    x += centered * pca.components[0][d];
    y += centered * pca.components[1][d];
  }
  return [x, y];
}
