import { NextResponse } from "next/server";
import { deriveAttendantPassword } from "../../../lib/neon/authPassword";
import { createNeonAdminClient as createAdminClient, createNeonServerClient, getAuthenticatedNeon } from "../../../lib/neon/client";
import {
  isActiveStationOwner,
  parsePinChangePayload,
} from "../../../lib/pinChange";
import type { StationState } from "../../../lib/stationMutations";

function getIdentity(claims: unknown) {
  if (!claims || typeof claims !== "object" || !("appMetadata" in claims)) {
    return null;
  }
  const metadata = claims.appMetadata;
  if (!metadata || typeof metadata !== "object") return null;

  const values = metadata as Record<string, unknown>;
  if (
    typeof values.station_id !== "string" ||
    typeof values.attendant_id !== "string"
  ) {
    return null;
  }

  return {
    stationId: values.station_id,
    attendantId: values.attendant_id,
  };
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedNeon();
  if (auth.error || !auth.data) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const identity = getIdentity(auth.data.claims);
  if (!identity) {
    return NextResponse.json(
      { error: "Station membership is not configured." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const payload = parsePinChangePayload(body);
  if (!payload) {
    return NextResponse.json(
      { error: "Enter a valid current PIN and a different new PIN that matches confirmation." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const admin = createAdminClient();
  const { data: record, error: readError } = await admin
    .from("fuelpos_station_state")
    .select("state")
    .eq("station_id", identity.stationId)
    .maybeSingle();
  if (readError) {
    return NextResponse.json(
      { error: "Unable to verify station ownership." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (!record) {
    return NextResponse.json(
      { error: "Station setup is required." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const state = record.state as StationState;
  const owner = state.attendants.find(
    (attendant) => attendant.id === identity.attendantId
  );
  if (!owner || !isActiveStationOwner(state.attendants, identity.attendantId)) {
    return NextResponse.json(
      { error: "Only the active station owner can change the admin PIN." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  let currentPassword: string;
  let newPassword: string;
  try {
    currentPassword = deriveAttendantPassword(owner.badgeId, payload.currentPin);
    newPassword = deriveAttendantPassword(owner.badgeId, payload.newPin);
  } catch {
    return NextResponse.json(
      { error: "PIN authentication is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const client = await createNeonServerClient();
  const { data: verified, error: verifyError } =
    await client.auth.signInWithPassword({
      email: `${owner.badgeId.toLowerCase()}@fuelpos.local`,
      password: currentPassword,
    });
  if (verifyError || verified.user?.id !== auth.data.user.id) {
    return NextResponse.json(
      { error: "The current PIN is incorrect." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(
    auth.data.user.id,
    { password: newPassword }
  );
  if (updateError) {
    return NextResponse.json(
      { error: "Unable to update the admin PIN." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
