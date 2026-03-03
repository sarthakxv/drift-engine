/**
 * 67-dim embedding assembly: stored genre_vector(64) + runtime-normalized
 * release_year, duration_ms, explicit_val.
 */

export interface NormStats {
  meanYear: number;
  stdYear: number;
  meanDur: number;
  stdDur: number;
}

export interface RawTrackRow {
  genre_vector: number[];
  release_year: number;
  duration_ms: number;
  explicit_val: number;
  source: string;
  rank_position: number | null;
}

const WEIGHT_TABLE: Record<string, number> = {
  top_short: 1.5,
  top_medium: 1.2,
  top_long: 1.0,
  saved: 0.8,
  explore: 1.3,
};

export function computeWeight(source: string, rank: number | null): number {
  const base = WEIGHT_TABLE[source] ?? 0.8;
  if (rank == null || source === "saved" || source === "explore") return base;
  const maxRank = 50;
  const rankBonus =
    source === "top_short"
      ? 1.0 - rank / maxRank
      : source === "top_medium"
        ? 0.8 - rank / maxRank
        : 0.6 - rank / maxRank;
  return base + Math.max(rankBonus, 0);
}

export function computeNormStats(rows: RawTrackRow[]): NormStats {
  const years = rows.map((r) => r.release_year);
  const durs = rows.map((r) => r.duration_ms);

  const meanYear = years.reduce((a, b) => a + b, 0) / years.length;
  const meanDur = durs.reduce((a, b) => a + b, 0) / durs.length;

  const stdYear = Math.max(
    1.0,
    Math.sqrt(
      years.reduce((s, y) => s + (y - meanYear) ** 2, 0) / years.length
    )
  );
  const stdDur = Math.max(
    1.0,
    Math.sqrt(
      durs.reduce((s, d) => s + (d - meanDur) ** 2, 0) / durs.length
    )
  );

  return { meanYear, stdYear, meanDur, stdDur };
}

/**
 * Assemble a 67-dim vector from raw track features + user normalization stats.
 */
export function assembleVector(
  genreVector: number[],
  releaseYear: number,
  durationMs: number,
  explicitVal: number,
  stats: NormStats
): Float64Array {
  const vec = new Float64Array(67);

  // Genre dims (0-63): scale by 0.5/sqrt(activeCount)
  let activeCount = 0;
  for (let i = 0; i < 64; i++) {
    if (genreVector[i] > 0) activeCount++;
  }
  const genreScale = 0.5 / Math.sqrt(Math.max(activeCount, 1));
  for (let i = 0; i < 64; i++) {
    vec[i] = genreVector[i] * genreScale;
  }

  // Numeric dims (64-65): z-score normalized, scaled by 0.35
  vec[64] = 0.35 * (releaseYear - stats.meanYear) / stats.stdYear;
  vec[65] = 0.35 * (durationMs - stats.meanDur) / stats.stdDur;

  // Explicit dim (66): scaled by 0.15
  vec[66] = 0.15 * explicitVal;

  return vec;
}

export function cosineDistance(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}
