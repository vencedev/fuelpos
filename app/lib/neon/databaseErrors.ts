export const STATION_SCHEMA_MISSING =
  "FuelPOS database migration is missing. Apply the Neon station-state migration.";

export function isStationSchemaMissing(error: unknown): boolean {
  return error instanceof Error
    ? error.message.includes("fuelpos_station_state") || error.message.includes("42P01")
    : false;
}
