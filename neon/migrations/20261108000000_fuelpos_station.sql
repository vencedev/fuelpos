create table if not exists public.fuelpos_station_state (
  station_id uuid primary key,
  state jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
