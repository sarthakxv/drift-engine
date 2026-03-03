-- Drift Engine: Initial Schema
-- Extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- Enums
create type feedback_action as enum ('like', 'reject', 'skip');
create type candidate_status as enum ('pending', 'shown', 'liked', 'rejected', 'skipped', 'saved', 'expired');
create type discovery_source as enum ('genre_search', 'discography_crawl', 'seed_expansion');

-- Core tables
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  spotify_user_id text unique not null,
  display_name text,
  norm_mean_year real,
  norm_std_year real,
  norm_mean_duration real,
  norm_std_duration real,
  last_cluster_at timestamptz,
  last_discovery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.spotify_tokens (
  user_id uuid primary key references public.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null,
  token_type text not null default 'Bearer',
  updated_at timestamptz not null default now()
);

create table public.artists (
  spotify_artist_id text primary key,
  name text not null,
  genres text[] not null default '{}',
  image_url text,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracks (
  spotify_track_id text primary key,
  name text not null,
  album_name text,
  album_id text,
  release_date date,
  release_year int,
  duration_ms int,
  explicit boolean not null default false,
  spotify_url text,
  updated_at timestamptz not null default now()
);

create table public.track_artists (
  spotify_track_id text not null references public.tracks(spotify_track_id) on delete cascade,
  spotify_artist_id text not null references public.artists(spotify_artist_id) on delete cascade,
  artist_order int not null,
  primary key (spotify_track_id, spotify_artist_id)
);

create table public.track_features (
  spotify_track_id text primary key references public.tracks(spotify_track_id) on delete cascade,
  release_year real not null,
  duration_ms real not null,
  explicit_val real not null default 0,
  genre_vector vector(64) not null,
  updated_at timestamptz not null default now()
);

create table public.user_tracks (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  spotify_track_id text not null references public.tracks(spotify_track_id) on delete cascade,
  source text not null check (source in ('top_short', 'top_medium', 'top_long', 'saved', 'explore')),
  time_range text not null default '',
  rank_position int,
  added_at timestamptz,
  is_saved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, spotify_track_id, source, time_range)
);

create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  cluster_index int not null,
  centroid vector(67) not null,
  genre_profile vector(64),
  top_genres text[] not null default '{}',
  variance real not null,
  track_count int not null,
  inner_radius real not null,
  outer_radius real not null,
  weight real not null default 1.0,
  acceptance_near real not null default 0.5,
  acceptance_mid real not null default 0.5,
  acceptance_far real not null default 0.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cluster_index)
);

create table public.cluster_tracks (
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  spotify_track_id text not null references public.tracks(spotify_track_id) on delete cascade,
  distance real not null,
  primary key (cluster_id, spotify_track_id)
);

create table public.exploration_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  spotify_track_id text not null references public.tracks(spotify_track_id) on delete cascade,
  distance real not null,
  sweet_spot_score real not null,
  diversity_score real not null,
  final_score real not null,
  rank int not null,
  source discovery_source not null default 'genre_search',
  status candidate_status not null default 'pending',
  generated_at timestamptz not null default now(),
  shown_at timestamptz,
  acted_at timestamptz
);

create table public.feedback (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  candidate_id uuid not null references public.exploration_candidates(id) on delete cascade,
  cluster_id uuid not null references public.clusters(id) on delete cascade,
  spotify_track_id text not null references public.tracks(spotify_track_id) on delete cascade,
  action feedback_action not null,
  distance real not null,
  relative_distance real not null,
  created_at timestamptz not null default now()
);

create table public.pwa_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_notified_at timestamptz
);

-- Indexes
create index idx_user_tracks_user on public.user_tracks(user_id, created_at desc);
create index idx_clusters_user on public.clusters(user_id, cluster_index);
create index idx_cluster_tracks_cluster on public.cluster_tracks(cluster_id, distance);
create index idx_candidates_user_status on public.exploration_candidates(user_id, status, generated_at desc);
create index idx_feedback_user_cluster on public.feedback(user_id, cluster_id, created_at desc);
create index idx_artists_fetched on public.artists(fetched_at);

-- NOTE: Create ivfflat index AFTER initial data load for effective list distribution
-- See migration 002_ivfflat_index.sql

-- Row Level Security
alter table public.users enable row level security;
alter table public.spotify_tokens enable row level security;
alter table public.user_tracks enable row level security;
alter table public.clusters enable row level security;
alter table public.cluster_tracks enable row level security;
alter table public.exploration_candidates enable row level security;
alter table public.feedback enable row level security;
alter table public.pwa_subscriptions enable row level security;
alter table public.artists enable row level security;
alter table public.tracks enable row level security;
alter table public.track_artists enable row level security;
alter table public.track_features enable row level security;

-- User-scoped policies
create policy "Users read own row" on public.users for select using (auth.uid() = id);
create policy "Users update own row" on public.users for update using (auth.uid() = id);

create policy "Tokens owner only" on public.spotify_tokens for all using (auth.uid() = user_id);

create policy "User tracks owner read" on public.user_tracks for select using (auth.uid() = user_id);
create policy "User tracks owner write" on public.user_tracks for insert with check (auth.uid() = user_id);

create policy "Clusters owner only" on public.clusters for select using (auth.uid() = user_id);
create policy "Cluster tracks via cluster owner" on public.cluster_tracks for select
  using (exists (select 1 from public.clusters c where c.id = cluster_id and c.user_id = auth.uid()));

create policy "Candidates owner only" on public.exploration_candidates for select using (auth.uid() = user_id);

create policy "Feedback owner read" on public.feedback for select using (auth.uid() = user_id);
create policy "Feedback owner write" on public.feedback for insert with check (auth.uid() = user_id);

create policy "Push subs owner only" on public.pwa_subscriptions for all using (auth.uid() = user_id);

-- Shared catalog: read-only for authenticated users
create policy "Artists readable by authenticated" on public.artists for select using (auth.role() = 'authenticated');
create policy "Tracks readable by authenticated" on public.tracks for select using (auth.role() = 'authenticated');
create policy "Track artists readable by authenticated" on public.track_artists for select using (auth.role() = 'authenticated');
create policy "Track features readable by authenticated" on public.track_features for select using (auth.role() = 'authenticated');
