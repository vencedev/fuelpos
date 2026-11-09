import { loadEnvConfig } from "@next/env";
import { createNeonAdminClient as createAdminClient } from "../app/lib/neon/client";
import { deriveAttendantPassword } from "../app/lib/neon/authPassword";
import { insertStation } from "../app/lib/neon/server";
import { createInitialStationState } from "../app/lib/stationState";

async function main() {
  loadEnvConfig(process.cwd());

  const badgeId = process.env.FUELPOS_OWNER_BADGE_ID ?? "ADMIN";
  const pin = process.env.FUELPOS_OWNER_PIN;
  const stationId = process.env.FUELPOS_STATION_ID ?? globalThis.crypto.randomUUID();

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    throw new Error("Set FUELPOS_OWNER_PIN to a 4-6 digit value before provisioning.");
  }

  const owner = {
    id: "att-4",
    name: "Station Owner",
    badgeId: badgeId.toUpperCase(),
    role: "owner" as const,
    assignedIsland: 0,
    active: true,
    avatarColor: "bg-red-600",
    phone: "",
    dateHired: new Date().toISOString().slice(0, 10),
  };
  await insertStation(stationId, createInitialStationState(owner));

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: `${badgeId.toLowerCase()}@fuelpos.local`,
    password: deriveAttendantPassword(badgeId, pin),
    email_confirm: true,
    app_metadata: {
      station_id: stationId,
      attendant_id: "att-4",
      role: "owner",
    },
  });

  if (error || !data.user) {
    throw new Error(error instanceof Error ? error.message : "Unable to create the owner account.");
  }

  console.log(`Owner account provisioned for ${badgeId}.`);
  console.log(`Station ID: ${stationId}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unable to provision owner.");
  process.exitCode = 1;
});