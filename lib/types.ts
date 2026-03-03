export type FeedbackAction = "like" | "reject" | "skip";
export type CandidateStatus = "pending" | "shown" | "liked" | "rejected" | "skipped" | "saved" | "expired";
export type DiscoverySource = "genre_search" | "discography_crawl" | "seed_expansion";
export type TrackSource = "top_short" | "top_medium" | "top_long" | "saved" | "explore";

export interface ClusterDTO {
  id: string;
  clusterIndex: number;
  centroid: number[];
  variance: number;
  innerRadius: number;
  outerRadius: number;
  weight: number;
  acceptanceNear: number;
  acceptanceMid: number;
  acceptanceFar: number;
  topGenres: string[];
  topArtists: string[];
}

export interface ExplorationCandidateDTO {
  id: string;
  clusterId: string;
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string;
  distance: number;
  sweetSpotScore: number;
  diversityScore: number;
  finalScore: number;
  rank: number;
  discoverySource: DiscoverySource;
}

export interface MapPointDTO {
  x: number;
  y: number;
  trackId: string;
  clusterId: string;
  isCandidate: boolean;
}
