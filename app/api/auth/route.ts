import { NextResponse } from "next/server";
import {
  createNeonServerClient,
  getAuthenticatedNeon,
} from "../../lib/neon/client";
import { deriveAttendantPassword } from "../../lib/neon/authPassword";
import {
  isStationSchemaMissing,
  STATION_SCHEMA_MISSING,
} from "../../lib/neon/databaseErrors";

function getAppMetadata(value: unknown) {
  if (!value || typeof value !== "object" || !("appMetadata" in value)) {
    return null;
  }

  const metadata = value.appMetadata;
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : null;
}

function sessionResponse(metadata: Record<string, unknown>) {
  const attendantId = metadata.attendant_id;
  const stationId = metadata.station_id;
  const role = metadata.role;
  if (
    typeof attendantId !== "string" ||
    typeof stationId !== "string" ||
    typeof role !== "string"
  ) {
    return NextResponse.json(
      { error: "The account is not assigned to a station." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    { attendantId, stationId, role },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET() {
  const auth = await getAuthenticatedNeon();
  if (auth.error || !auth.data) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const metadata = getAppMetadata(auth.data.claims);
  if (!metadata) {
    return NextResponse.json(
      { error: "The account is not assigned to a station." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const stationId = metadata.station_id;
  const attendantId = metadata.attendant_id;
  if (typeof stationId !== "string" || typeof attendantId !== "string") {
    return sessionResponse(metadata);
  }

  const { data: record, error } = await auth.data.neon
    .from("fuelpos_station_state")
    .select("state")
    .eq("station_id", stationId)
    .maybeSingle();
  if (error) {
    return NextResponse.json(
      {
        error: isStationSchemaMissing(error)
          ? STATION_SCHEMA_MISSING
          : "Unable to verify station membership.",
      },
      {
        status: isStationSchemaMissing(error) ? 503 : 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
  if (!record) return sessionResponse(metadata);

  const state = record.state as { attendants?: { id: string; role: string; active: boolean }[] };
  const attendant = state.attendants?.find((item) => item.id === attendantId);
  if (!attendant?.active) {
    return NextResponse.json(
      { error: "Station access is suspended." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  return sessionResponse({ ...metadata, role: attendant.role });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }

  const { badgeId, pin } = body as Record<string, unknown>;
  if (
    typeof badgeId !== "string" ||
    !/^[a-z0-9-]{2,32}$/i.test(badgeId) ||
    typeof pin !== "string" ||
    !/^\d{4,6}$/.test(pin)
  ) {
    return NextResponse.json({ error: "Enter a valid badge and PIN." }, { status: 400 });
  }

  try {
    const client = await createNeonServerClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: `${badgeId.toLowerCase()}@fuelpos.local`,
      password: deriveAttendantPassword(badgeId, pin),
    });

    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid badge or PIN." }, { status: 401 });
    }

    const metadata = data.user.app_metadata as Record<string, unknown>;
    if (
      typeof metadata.attendant_id !== "string" ||
      typeof metadata.station_id !== "string" ||
      typeof metadata.role !== "string"
    ) {
      await client.auth.signOut();
      return NextResponse.json({ error: "This account is not assigned to a station." }, { status: 403 });
    }

    return sessionResponse(metadata);
  } catch {
    return NextResponse.json(
      { error: "Authentication service is unavailable." },
      { status: 503 }
    );
  }
}

export async function DELETE() {
  try {
    const client = await createNeonServerClient();
    const { error } = await client.auth.signOut();
    if (error) {
      return NextResponse.json({ error: "Unable to sign out." }, { status: 500 });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      { error: "Authentication service is unavailable." },
      { status: 503 }
    );
  }
}