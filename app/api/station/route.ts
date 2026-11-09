import { createNeonAdminClient as createAdminClient } from "../../lib/neon/client";
import { NextResponse } from "next/server";
import {
  createInitialStationState,
  findActiveStationOwner,
  normalizeStationVersion,
  resetStationState,
} from "../../lib/stationState";
import {
  canManagerUpdateStationState,
  isStationState,
  isStationSaleInput,
  registerStationSale,
  type StationAttendant,
  type StationState,
} from "../../lib/stationMutations";
import { getAuthenticatedNeon } from "../../lib/neon/client";
import { resetStationStateRecord } from "../../lib/neon/server";
import {
  isStationSchemaMissing,
  STATION_SCHEMA_MISSING,
} from "../../lib/neon/databaseErrors";

const MAX_SAVE_ATTEMPTS = 3;
const OWNER_ROLES = new Set(["owner", "manager"]);
const SALE_ROLES = new Set(["owner", "manager", "attendant", "cashier"]);

function getStationIdentity(claims: unknown) {
  const appMetadata =
    claims && typeof claims === "object" && "appMetadata" in claims
      ? (claims.appMetadata as Record<string, unknown>)
      : {};
  const stationId = appMetadata.station_id;
  const role = appMetadata.role;
  const attendantId = appMetadata.attendant_id;

  if (
    typeof stationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stationId) ||
    typeof role !== "string"
  ) {
    return null;
  }

  return {
    stationId,
    role,
    attendantId: typeof attendantId === "string" ? attendantId : null,
  };
}

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function readStationState(stationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fuelpos_station_state")
    .select("state, version")
    .eq("station_id", stationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const record = data as { state: StationState; version: number | string };
  return {
    ...record,
    version: normalizeStationVersion(record.version),
    state: {
      ...record.state,
      stationName:
        typeof record.state.stationName === "string" && record.state.stationName.trim()
          ? record.state.stationName
          : "LE-AR FUEL STATION",
      stationLocation:
        typeof record.state.stationLocation === "string" && record.state.stationLocation.trim()
          ? record.state.stationLocation
          : "Station location",
    },
  };
}

async function saveStationState(
  stationId: string,
  state: StationState,
  expectedVersion: number
) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fuelpos_station_state")
    .update({
      state,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("station_id", stationId)
    .eq("version", expectedVersion)
    .select("version")
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export async function GET() {
  const auth = await getAuthenticatedNeon();
  if (auth.error || !auth.data) {
    return responseError("Authentication required.", 401);
  }

  const identity = getStationIdentity(auth.data.claims);
  if (!identity) return responseError("Station membership is not configured.", 403);

  try {
    const record = await readStationState(identity.stationId);
    if (!record) return responseError("Station setup is required.", 404);
    const attendant = record.state.attendants.find(
      (item) => item.id === identity.attendantId
    );
    if (!attendant?.active) return responseError("Station access is suspended.", 403);
    return NextResponse.json({ ...record.state, version: record.version });
  } catch (error) {
    return responseError(
      isStationSchemaMissing(error)
        ? STATION_SCHEMA_MISSING
        : "Unable to load station data.",
      isStationSchemaMissing(error) ? 503 : 500
    );
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedNeon();
  if (auth.error || !auth.data) {
    return responseError("Authentication required.", 401);
  }

  const identity = getStationIdentity(auth.data.claims);
  if (!identity) return responseError("Station membership is not configured.", 403);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return responseError("Invalid request body.", 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return responseError("Invalid JSON request body.", 400);
  }

  if (body.action === "bootstrap") {
    if (identity.role !== "owner" || !identity.attendantId) {
      return responseError("Only the station owner can initialize station data.", 403);
    }

    const email = auth.data.user.email?.toLowerCase();
    const badgeId =
      email?.endsWith("@fuelpos.local")
        ? email.slice(0, -"@fuelpos.local".length).toUpperCase()
        : "";
    if (!/^[A-Z0-9-]{2,32}$/.test(badgeId)) {
      return responseError("The owner account is missing a valid station badge.", 403);
    }

    const userMetadata = auth.data.user.user_metadata as Record<string, unknown>;
    const displayName =
      typeof userMetadata.full_name === "string" && userMetadata.full_name.trim()
        ? userMetadata.full_name.trim()
        : badgeId;
    const owner: StationAttendant = {
      id: identity.attendantId,
      name: displayName,
      badgeId,
      role: "owner",
      assignedIsland: 0,
      active: true,
      avatarColor: "bg-red-600",
      phone: "",
      dateHired: auth.data.user.created_at.slice(0, 10),
    };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("fuelpos_station_state")
      .insert({
        station_id: identity.stationId,
        state: createInitialStationState(owner),
        version: 1,
      })
      .select("version")
      .maybeSingle();

    if ((error as { code?: string } | null)?.code === "23505") {
      return responseError("Station data has already been initialized.", 409);
    }
    if (error || !data) {
      return responseError(
        isStationSchemaMissing(error)
          ? STATION_SCHEMA_MISSING
          : "Unable to initialize station data.",
        isStationSchemaMissing(error) ? 503 : 500
      );
    }
    return NextResponse.json({ version: data.version }, { status: 201 });
  }

  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
    try {
      const current = await readStationState(identity.stationId);
      if (!current) return responseError("Station setup is required.", 404);
      const attendant = current.state.attendants.find(
        (item) => item.id === identity.attendantId
      );
      if (!attendant?.active) {
        return responseError("Station access is suspended.", 403);
      }

      if (body.action === "reset") {
        const owner = findActiveStationOwner(current.state, attendant.id);
        if (!owner) {
          return responseError("Only the station owner can reset station data.", 403);
        }
        let expectedVersion: number;
        try {
          expectedVersion = normalizeStationVersion(body.expectedVersion);
        } catch (error) {
          if (error instanceof RangeError) {
            return responseError("Invalid station version.", 400);
          }
          throw error;
        }
        if (expectedVersion !== current.version) {
          return responseError("Station data changed. Reload and retry.", 409);
        }

        const nextState = resetStationState(current.state, owner.id);
        const updated = await resetStationStateRecord(
          identity.stationId,
          nextState,
          owner.id,
          expectedVersion
        );
        if (!updated) {
          return responseError("Station data changed. Reload and retry.", 409);
        }
        return NextResponse.json({
          ...nextState,
          version: current.version + 1,
        });
      }

      let nextState: StationState;
      if (body.action === "sale") {
        if (!SALE_ROLES.has(attendant.role)) {
          return responseError("This account cannot register sales.", 403);
        }
        if (!isStationSaleInput(body.sale)) {
          return responseError("Invalid sale details.", 400);
        }
        nextState = registerStationSale(
          current.state,
          body.sale,
          attendant.id
        );
      } else if (body.action === "replace") {
        if (!OWNER_ROLES.has(attendant.role)) {
          return responseError("Only managers can update station settings.", 403);
        }
        if (!isStationState(body.state)) {
          return responseError("Invalid station state.", 400);
        }
        if (body.expectedVersion !== current.version) {
          return responseError("Station data changed. Reload and retry.", 409);
        }
        if (
          attendant.role === "manager" &&
          !canManagerUpdateStationState(
            current.state,
            body.state,
            attendant.id
          )
        ) {
          return responseError(
            "Managers cannot edit sales history, shift totals, or privileged accounts.",
            403
          );
        }
        nextState = body.state;
      } else {
        return responseError("Unknown station action.", 400);
      }

      if (
        await saveStationState(identity.stationId, nextState, current.version)
      ) {
        return NextResponse.json({ ...nextState, version: current.version + 1 });
      }
    } catch (error) {
      if (error instanceof RangeError) {
        return responseError(error.message, 422);
      }
      return responseError(
        isStationSchemaMissing(error)
          ? STATION_SCHEMA_MISSING
          : body.action === "reset"
            ? "Unable to reset station data."
            : "Unable to save station data.",
        isStationSchemaMissing(error) ? 503 : 500
      );
    }
  }

  return responseError("Station data changed. Retry the operation.", 409);
}