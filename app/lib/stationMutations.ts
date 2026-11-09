import type {
  AttendantAccount,
  AttendantPermissions,
  FuelBatch,
  FuelGrade,
  PaymentMethod,
  ShiftState,
  Transaction,
} from "../types/pos";

export type StationAttendant = AttendantAccount;

export interface StationState {
  stationName: string;
  stationLocation: string;
  fuelGrades: FuelGrade[];
  fuelBatches: FuelBatch[];
  attendants: StationAttendant[];
  permissions: AttendantPermissions;
  transactions: Transaction[];
  shiftState: ShiftState;
}

export interface StationStateRecord {
  stationId: string;
  state: StationState;
  version: number;
}

export interface StationSaleInput {
  fuelGradeId: string;
  volumeLiters: number;
  paymentMethod: PaymentMethod;
  tenderedAmount?: number;
  plateNumber?: string;
}

export function isStationSaleInput(value: unknown): value is StationSaleInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<StationSaleInput>;
  const validPaymentMethods: PaymentMethod[] = [
    "cash",
    "fleet_card",
    "e_wallet",
    "station_credit",
  ];

  return (
    typeof input.fuelGradeId === "string" &&
    input.fuelGradeId.length > 0 &&
    typeof input.volumeLiters === "number" &&
    Number.isFinite(input.volumeLiters) &&
    validPaymentMethods.includes(input.paymentMethod as PaymentMethod) &&
    (input.tenderedAmount === undefined ||
      (typeof input.tenderedAmount === "number" &&
        Number.isFinite(input.tenderedAmount))) &&
    (input.plateNumber === undefined || typeof input.plateNumber === "string")
  );
}

export function registerStationSale(
  state: StationState,
  input: StationSaleInput,
  attendantId: string
): StationState {
  const attendant = state.attendants.find((item) => item.id === attendantId);
  if (!attendant || !attendant.active) {
    throw new RangeError("The authenticated attendant is not active.");
  }

  const grade = state.fuelGrades.find((item) => item.id === input.fuelGradeId);
  if (!grade) throw new RangeError("The selected fuel grade no longer exists.");

  const volumeLiters = Number(Number(input.volumeLiters).toFixed(3));
  if (!Number.isFinite(volumeLiters) || volumeLiters <= 0) {
    throw new RangeError("Sale volume must be greater than zero.");
  }
  if (volumeLiters > grade.remainingLiters) {
    throw new RangeError("Sale volume exceeds available tank stock.");
  }

  const totalAmount = Math.round(grade.pricePerLiter * volumeLiters * 100) / 100;
  const paymentMethods: PaymentMethod[] = [
    "cash",
    "fleet_card",
    "e_wallet",
    "station_credit",
  ];
  if (!paymentMethods.includes(input.paymentMethod)) {
    throw new RangeError("Select a valid payment method.");
  }

  const tenderedAmount = input.tenderedAmount;
  if (
    input.paymentMethod === "cash" &&
    (!Number.isFinite(tenderedAmount) || tenderedAmount! < totalAmount)
  ) {
    throw new RangeError("Cash tendered must cover the sale total.");
  }

  if (
    input.plateNumber !== undefined &&
    (typeof input.plateNumber !== "string" || input.plateNumber.length > 20)
  ) {
    throw new RangeError("Customer plate number is invalid.");
  }

  const date = new Date();
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const dateValues = Object.fromEntries(
    dateParts.map(({ type, value }) => [type, value])
  );
  const saleDate = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
  const timestamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  const receiptSequence = state.transactions.reduce((maximum, transaction) => {
    const match = /^FP-\d{4}-(\d+)$/.exec(transaction.receiptNumber);
    return match ? Math.max(maximum, Number(match[1])) : maximum;
  }, 0) + 1;

  const transaction: Transaction = {
    id: globalThis.crypto.randomUUID(),
    receiptNumber: `LEAR-${dateValues.year}-${receiptSequence.toString().padStart(6, "0")}`,
    timestamp,
    saleDate,
    pumpNumber: 1,
    fuelGradeId: grade.id,
    fuelGradeName: grade.name,
    fuelGradeColor: grade.color,
    pricePerLiter: grade.pricePerLiter,
    volumeLiters,
    totalAmount,
    paymentMethod: input.paymentMethod,
    attendantName: attendant.name,
    attendantBadge: attendant.badgeId,
    status: "completed",
    ...(input.paymentMethod === "cash"
      ? {
          tenderedAmount,
          changeAmount: Number((tenderedAmount! - totalAmount).toFixed(2)),
        }
      : {}),
    ...(input.plateNumber?.trim()
      ? { plateNumber: input.plateNumber.trim() }
      : {}),
  };
  const remainingLiters = grade.remainingLiters - volumeLiters;
  const updatedGrade: FuelGrade = {
    ...grade,
    remainingLiters,
    tankLevelPercent: Math.round(
      (remainingLiters / grade.tankCapacityLiters) * 100
    ),
  };

  return {
    ...state,
    fuelGrades: state.fuelGrades.map((item) =>
      item.id === updatedGrade.id ? updatedGrade : item
    ),
    transactions: [transaction, ...state.transactions],
    shiftState: {
      totalSalesAmount: state.shiftState.totalSalesAmount + totalAmount,
      totalLitersDispensed:
        state.shiftState.totalLitersDispensed + volumeLiters,
      transactionsCount: state.shiftState.transactionsCount + 1,
      cashInDrawer:
        state.shiftState.cashInDrawer +
        (transaction.paymentMethod === "cash" ? totalAmount : 0),
    },
  };
}

export function isStationState(value: unknown): value is StationState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<StationState>;
  return (
    typeof state.stationName === "string" &&
    typeof state.stationLocation === "string" &&
    Array.isArray(state.fuelGrades) &&
    Array.isArray(state.fuelBatches) &&
    Array.isArray(state.attendants) &&
    state.attendants.every(
      (attendant) =>
        Boolean(attendant) &&
        typeof attendant === "object" &&
        !("pin" in attendant)
    ) &&
    Array.isArray(state.transactions) &&
    Boolean(state.permissions) &&
    Boolean(state.shiftState)
  );
}

export function canManagerUpdateStationState(
  current: StationState,
  proposed: StationState,
  managerId: string
): boolean {
  if (
    current.stationName !== proposed.stationName ||
    current.stationLocation !== proposed.stationLocation ||
    JSON.stringify(current.transactions) !== JSON.stringify(proposed.transactions) ||
    JSON.stringify(current.shiftState) !== JSON.stringify(proposed.shiftState) ||
    current.attendants.length !== proposed.attendants.length
  ) {
    return false;
  }

  return current.attendants.every((attendant) => {
    const updated = proposed.attendants.find((item) => item.id === attendant.id);
    if (!updated) return false;

    if (attendant.role === "owner" || attendant.role === "manager") {
      return JSON.stringify(attendant) === JSON.stringify(updated);
    }
    if (updated.role === "owner" || updated.role === "manager") return false;
    if (
      attendant.id === managerId &&
      (updated.role !== attendant.role || updated.active !== attendant.active)
    ) {
      return false;
    }

    return true;
  });
}