export type FuelGradeId = string;

export interface FuelBatch {
  id: string;
  fuelGradeId: FuelGradeId;
  liters: number;
  receivedAt: string;
  supplier?: string;
  costPerLiter?: number;
  totalPurchaseCost?: number;
}

export type NewFuelGrade = Omit<
  FuelGrade,
  "id" | "tankLevelPercent" | "remainingLiters"
>;

export type NewFuelBatch = Omit<
  FuelBatch,
  "id" | "costPerLiter" | "totalPurchaseCost"
> & {
  costPerLiter: number;
};

export interface FuelGrade {
  id: FuelGradeId;
  name: string;
  code: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  pricePerLiter: number;
  tankLevelPercent: number;
  remainingLiters: number;
  tankCapacityLiters: number;
  octaneOrCetane: string;
}

export type UserRole = 'owner' | 'manager' | 'attendant' | 'cashier';

export interface AttendantAccount {
  id: string;
  name: string;
  badgeId: string;
  role: UserRole;
  assignedIsland: number;
  active: boolean;
  avatarColor: string;
  phone: string;
  dateHired: string;
}

export interface AttendantPermissions {
  allowManualDiscount: boolean;
  allowVoid: boolean;
  requireSupervisorPinForVoid: boolean;
  allowCustomPresetAmount: boolean;
  allowPriceOverride: boolean;
  allowCashDrop: boolean;
  showShiftRevenueToAttendant: boolean;
  allowOfflinePumpManualEntry: boolean;
  allowDuplicateReceiptReprint: boolean;
  allowTestDispensationCalibration: boolean;
  requireCustomerPlateNumber: boolean;
}

export type PaymentMethod = 'cash' | 'fleet_card' | 'e_wallet' | 'station_credit';

export interface Transaction {
  id: string;
  receiptNumber: string;
  timestamp: string;
  saleDate?: string;
  pumpNumber: number;
  fuelGradeId: FuelGradeId;
  fuelGradeName: string;
  fuelGradeColor: string;
  pricePerLiter: number;
  volumeLiters: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  attendantName: string;
  attendantBadge: string;
  status: 'completed' | 'voided' | 'pending';
  tenderedAmount?: number;
  changeAmount?: number;
  plateNumber?: string;
  meterStart?: number;
  meterEnd?: number;
}

export interface ShiftState {
  totalSalesAmount: number;
  totalLitersDispensed: number;
  transactionsCount: number;
  cashInDrawer: number;
}
