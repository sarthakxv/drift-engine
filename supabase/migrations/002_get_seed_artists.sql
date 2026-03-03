-- RPC function: get seed artists from liked candidates since last discovery
create or replace function public.get_seed_artists(
  p_user_id uuid,
  p_since timestamptz
)
returns table (spotify_artist_id text)
language sql
stable
security definer
as $$
  select distinct ta.spotify_artist_id
  from public.feedback f
  join public.exploration_candidates ec on ec.id = f.candidate_id
  join public.track_artists ta on ta.spotify_track_id = ec.spotify_track_id
  where f.user_id = p_user_id
    and f.action = 'like'
    and f.created_at > p_since;
$$;
