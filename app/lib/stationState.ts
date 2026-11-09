import type { AttendantPermissions } from "../types/pos";
import type { StationAttendant, StationState } from "./stationMutations";

export { isStationState, registerStationSale } from "./stationMutations";
export type {
  StationAttendant,
  StationSaleInput,
  StationState,
  StationStateRecord,
} from "./stationMutations";

export const DEFAULT_STATION_PERMISSIONS: AttendantPermissions = {
  allowManualDiscount: false,
  allowVoid: false,
  requireSupervisorPinForVoid: true,
  allowCustomPresetAmount: true,
  allowPriceOverride: false,
  allowCashDrop: true,
  showShiftRevenueToAttendant: true,
  allowOfflinePumpManualEntry: false,
  allowDuplicateReceiptReprint: true,
  allowTestDispensationCalibration: false,
  requireCustomerPlateNumber: false,
};

export function createInitialStationState(owner: StationAttendant): StationState {
  return {
    stationName: "LE-AR FUEL STATION",
    stationLocation: "Station location",
    fuelGrades: [],
    fuelBatches: [],
    attendants: [{ ...owner }],
    permissions: { ...DEFAULT_STATION_PERMISSIONS },
    transactions: [],
    shiftState: {
      totalSalesAmount: 0,
      totalLitersDispensed: 0,
      transactionsCount: 0,
      cashInDrawer: 0,
    },
  };
}

export function normalizeStationVersion(value: unknown): number {
  const version =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RangeError("Station version is invalid.");
  }
  return version;
}

export function findActiveStationOwner(
  state: StationState,
  attendantId: string
): StationAttendant | null {
  const owner = state.attendants.find(
    (attendant) =>
      attendant.id === attendantId &&
      attendant.role === "owner" &&
      attendant.active
  );
  return owner ?? null;
}

export function resetStationState(
  state: StationState,
  ownerAttendantId: string
): StationState {
  const owner = findActiveStationOwner(state, ownerAttendantId);
  if (!owner) {
    throw new RangeError("An active station owner is required to reset data.");
  }

  return {
    ...state,
    fuelGrades: [],
    fuelBatches: [],
    attendants: [owner],
    transactions: [],
    shiftState: {
      totalSalesAmount: 0,
      totalLitersDispensed: 0,
      transactionsCount: 0,
      cashInDrawer: 0,
    },
  };
}