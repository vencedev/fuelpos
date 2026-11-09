import { NextResponse } from "next/server";
import type { AttendantAccount, UserRole } from "../../types/pos";
import { createNeonAdminClient as createAdminClient, getAuthenticatedNeon } from "../../lib/neon/client";
import { deriveAttendantPassword } from "../../lib/neon/authPassword";
import type { StationState } from "../../lib/stationMutations";

const MAX_SAVE_ATTEMPTS = 3;
const MANAGER_ROLES = new Set(["owner", "manager"]);
const STAFF_ROLES = new Set<UserRole>(["manager", "attendant", "cashier"]);

function identityFromClaims(claims: unknown) {
  if (!claims || typeof claims !== "object" || !("appMetadata" in claims)) {
    return null;
  }
  const metadata = claims.appMetadata;
  if (!metadata || typeof metadata !== "object") return null;

  const values = metadata as Record<string, unknown>;
  if (
    typeof values.station_id !== "string" ||
    typeof values.role !== "string" ||
    typeof values.attendant_id !== "string"
  ) {
    return null;
  }

  return {
    stationId: values.station_id,
    role: values.role,
    attendantId: values.attendant_id,
  };
}

function validAttendant(value: unknown): value is Omit<AttendantAccount, "id"> {
  if (!value || typeof value !== "object") return false;
  const attendant = value as Partial<AttendantAccount>;
  return (
    typeof attendant.name === "string" && attendant.name.trim().length > 0 &&
    typeof attendant.badgeId === "string" && /^[A-Z0-9-]{2,32}$/.test(attendant.badgeId) &&
    typeof attendant.role === "string" && STAFF_ROLES.has(attendant.role) &&
    Number.isInteger(attendant.assignedIsland) &&
    attendant.active === true &&
    typeof attendant.avatarColor === "string" &&
    typeof attendant.phone === "string" &&
    typeof attendant.dateHired === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(attendant.dateHired)
  );
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedNeon();
  if (auth.error || !auth.data) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const identity = identityFromClaims(auth.data.claims);
  if (!identity) {
    return NextResponse.json({ error: "Station membership is not configured." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const attendant = body.attendant;
  const pin = body.pin;
  if (
    !validAttendant(attendant) ||
    typeof pin !== "string" ||
    !/^\d{4,6}$/.test(pin)
  ) {
    return NextResponse.json({ error: "Invalid attendant account details." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("fuelpos_station_state")
    .select("state, version")
    .eq("station_id", identity.stationId)
    .maybeSingle();
  if (readError || !current) {
    return NextResponse.json({ error: "Station setup is required." }, { status: 404 });
  }

  const currentState = current.state as StationState;
  const actor = currentState.attendants.find(
    (item) => item.id === identity.attendantId
  );
  if (!actor?.active || !MANAGER_ROLES.has(actor.role)) {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  if (attendant.role === "manager" && actor.role !== "owner") {
    return NextResponse.json({ error: "Only the owner can assign manager access." }, { status: 403 });
  }

  if (
    currentState.attendants.some(
      (item) => item.badgeId.toUpperCase() === attendant.badgeId.toUpperCase()
    )
  ) {
    return NextResponse.json({ error: "That badge ID is already assigned." }, { status: 409 });
  }

  const id = `att-${globalThis.crypto.randomUUID()}`;
  const email = `${attendant.badgeId.toLowerCase()}@fuelpos.local`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: deriveAttendantPassword(attendant.badgeId, pin),
    email_confirm: true,
    app_metadata: {
      station_id: identity.stationId,
      attendant_id: id,
      role: attendant.role,
    },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError instanceof Error ? createError.message : "Unable to create the account." },
      { status: 409 }
    );
  }

  const newAttendant: AttendantAccount = {
    id,
    name: attendant.name.trim(),
    badgeId: attendant.badgeId.toUpperCase(),
    role: attendant.role,
    assignedIsland: attendant.assignedIsland,
    active: true,
    avatarColor: attendant.avatarColor,
    phone: attendant.phone,
    dateHired: attendant.dateHired,
  };
  let version = current.version as number;
  let state = currentState;
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
    state = { ...state, attendants: [...state.attendants, newAttendant] };
    const { data, error } = await admin
      .from("fuelpos_station_state")
      .update({ state, version: version + 1, updated_at: new Date().toISOString() })
      .eq("station_id", identity.stationId)
      .eq("version", version)
      .select("version")
      .maybeSingle();

    if (error) break;
    if (data) {
      return NextResponse.json({ ...state, version: data.version }, { status: 201 });
    }

    const { data: latest, error: latestError } = await admin
      .from("fuelpos_station_state")
      .select("state, version")
      .eq("station_id", identity.stationId)
      .maybeSingle();
    if (latestError || !latest) break;
    state = latest.state as StationState;
    version = latest.version as number;
    if (state.attendants.some((item) => item.badgeId.toUpperCase() === attendant.badgeId.toUpperCase())) {
      break;
    }
  }

  await admin.auth.admin.deleteUser(created.user.id);
  return NextResponse.json(
    { error: "Station data changed. Retry creating the attendant." },
    { status: 409 }
  );
}

export async function PATCH(request: Request) {
  const auth = await getAuthenticatedNeon();
  if (auth.error || !auth.data) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const identity = identityFromClaims(auth.data.claims);
  if (!identity) {
    return NextResponse.json({ error: "Station membership is not configured." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const attendantId = body.attendantId;
  const pin = body.pin;
  if (
    typeof attendantId !== "string" ||
    typeof pin !== "string" ||
    !/^\d{4,6}$/.test(pin)
  ) {
    return NextResponse.json({ error: "Invalid PIN reset request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("fuelpos_station_state")
    .select("state")
    .eq("station_id", identity.stationId)
    .maybeSingle();
  if (readError || !current) {
    return NextResponse.json({ error: "Station setup is required." }, { status: 404 });
  }

  const state = current.state as StationState;
  const actor = state.attendants.find((item) => item.id === identity.attendantId);
  const target = state.attendants.find((item) => item.id === attendantId);
  if (!actor?.active || !MANAGER_ROLES.has(actor.role)) {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  if (!target || target.role === "owner" || target.id === actor.id) {
    return NextResponse.json({ error: "This account cannot be reset here." }, { status: 403 });
  }
  if (actor.role === "manager" && target.role === "manager") {
    return NextResponse.json({ error: "Only the owner can reset a manager PIN." }, { status: 403 });
  }

  try {
    let userId: string | null = null;
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      const user = data.users.find(
        (item) => item.app_metadata.attendant_id === attendantId
      );
      if (user) {
        userId = user.id;
        break;
      }
      if (data.users.length < 1000) break;
    }
    if (!userId) {
      return NextResponse.json({ error: "Auth account was not found." }, { status: 404 });
    }

    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: deriveAttendantPassword(target.badgeId, pin),
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to reset attendant PIN." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedNeon();
  if (auth.error || !auth.data) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const identity = identityFromClaims(auth.data.claims);
  const attendantId = new URL(request.url).searchParams.get("id");
  if (!identity || !attendantId) {
    return NextResponse.json({ error: "Invalid attendant request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("fuelpos_station_state")
    .select("state, version")
    .eq("station_id", identity.stationId)
    .maybeSingle();
  if (readError || !current) {
    return NextResponse.json({ error: "Station setup is required." }, { status: 404 });
  }

  const actor = (current.state as StationState).attendants.find(
    (item) => item.id === identity.attendantId
  );
  const target = (current.state as StationState).attendants.find(
    (item) => item.id === attendantId
  );
  if (!actor?.active || !MANAGER_ROLES.has(actor.role)) {
    return NextResponse.json({ error: "Manager access required." }, { status: 403 });
  }
  if (!target || target.role === "owner" || target.id === actor.id) {
    return NextResponse.json({ error: "This attendant cannot be deleted." }, { status: 403 });
  }
  if (actor.role === "manager" && target.role === "manager") {
    return NextResponse.json({ error: "Only the owner can delete a manager." }, { status: 403 });
  }

  let state = current.state as StationState;
  let version = current.version as number;
  let savedVersion: number | null = null;
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
    state = {
      ...state,
      attendants: state.attendants.filter((item) => item.id !== attendantId),
    };
    const { data, error } = await admin
      .from("fuelpos_station_state")
      .update({ state, version: version + 1, updated_at: new Date().toISOString() })
      .eq("station_id", identity.stationId)
      .eq("version", version)
      .select("version")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Unable to remove attendant." }, { status: 500 });
    }
    if (data) {
      savedVersion = (data as { version: number }).version;
      break;
    }

    const { data: latest, error: latestError } = await admin
      .from("fuelpos_station_state")
      .select("state, version")
      .eq("station_id", identity.stationId)
      .maybeSingle();
    if (latestError || !latest) {
      return NextResponse.json({ error: "Unable to update station data." }, { status: 500 });
    }
    state = latest.state as StationState;
    version = latest.version as number;
  }

  if (savedVersion === null) {
    return NextResponse.json(
      { error: "Station data changed. Retry removing the attendant." },
      { status: 409 }
    );
  }

  try {
    let userId: string | null = null;
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });
      if (error) throw error;
      const user = data.users.find(
        (item) => item.app_metadata.attendant_id === attendantId
      );
      if (user) {
        userId = user.id;
        break;
      }
      if (data.users.length < 1000) break;
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        return NextResponse.json(
          { error: "Station access was removed, but Auth account cleanup failed." },
          { status: 500 }
        );
      }
    }
  } catch {
    return NextResponse.json(
      { error: "Station access was removed, but Auth account cleanup failed." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...state, version: savedVersion });
}