create table if not exists public.fuelpos_station_state (
  station_id uuid primary key,
  state jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

alter table public.fuelpos_station_state enable row level security;

create policy "station members can read their station state"
  on public.fuelpos_station_state
  for select
  to authenticated
  using (
    station_id::text = (auth.jwt() -> 'app_metadata' ->> 'station_id')
  );

revoke all on public.fuelpos_station_state from anon, authenticated;
grant select on public.fuelpos_station_state to authenticated;