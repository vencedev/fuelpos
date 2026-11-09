import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlClient: NeonQueryFunction<false, false> | null = null;

export function neonSql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    const connectionString = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error("NEON_DATABASE_URL is not configured.");
    sqlClient = neon(connectionString);
  }
  return sqlClient;
}

export type StationRecord = {
  station_id: string;
  state: unknown;
  version: number;
};

export async function readStation(stationId: string): Promise<StationRecord | null> {
  const rows = await neonSql().query(
    "select station_id::text, state, version from public.fuelpos_station_state where station_id = $1",
    [stationId]
  );
  return (rows[0] as StationRecord | undefined) ?? null;
}

export async function insertStation(stationId: string, state: unknown): Promise<void> {
  await neonSql().query(
    "insert into public.fuelpos_station_state (station_id, state, version) values ($1::uuid, $2::jsonb, 1)",
    [stationId, JSON.stringify(state)]
  );
}

export async function updateStation(stationId: string, state: unknown, version: number): Promise<boolean> {
  const rows = await neonSql().query(
    "update public.fuelpos_station_state set state = $2::jsonb, version = version + 1, updated_at = now() where station_id = $1::uuid and version = $3 returning version",
    [stationId, JSON.stringify(state), version]
  );
  return rows.length === 1;
}

export async function resetStationStateRecord(
  stationId: string,
  state: unknown,
  ownerAttendantId: string,
  expectedVersion: number
): Promise<boolean> {
  const rows = await neonSql().query(
    `with updated_station as (
       update public.fuelpos_station_state
       set state = $2::jsonb, version = version + 1, updated_at = now()
       where station_id = $1::uuid and version = $3
       returning station_id
     ), deleted_credentials as (
       delete from public.fuelpos_station_credentials
       where station_id = $1::uuid
         and attendant_id <> $4
         and exists (select 1 from updated_station)
       returning user_id
     )
     select station_id from updated_station`,
    [stationId, JSON.stringify(state), expectedVersion, ownerAttendantId]
  );
  return rows.length === 1;
}
