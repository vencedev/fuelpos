create table if not exists public.fuelpos_station_credentials (
  user_id uuid primary key,
  station_id uuid not null references public.fuelpos_station_state(station_id) on delete cascade,
  attendant_id text not null,
  badge_id text not null,
  password_hash text not null,
  role text not null,
  unique (station_id, badge_id)
);

create index if not exists fuelpos_station_credentials_badge_idx
  on public.fuelpos_station_credentials (lower(badge_id));
