export const STATION_SCHEMA_MISSING =
  "FuelPOS database migration is missing. Apply the station-state migration in Supabase.";

export function isStationSchemaMissing(error: unknown): boolean {
  return (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "PGRST205"
  );
}