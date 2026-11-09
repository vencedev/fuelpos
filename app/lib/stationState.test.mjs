import assert from "node:assert/strict";
import test from "node:test";
import {
  canManagerUpdateStationState,
  registerStationSale,
} from "./stationMutations.ts";
import { createInitialStationState } from "./stationState.ts";

test("bootstraps an empty station with only the authenticated owner", () => {
  const owner = {
    id: "owner-auth-id",
    name: "ADM-001",
    badgeId: "ADM-001",
    role: "owner",
    assignedIsland: 0,
    active: true,
    avatarColor: "bg-red-600",
    phone: "",
    dateHired: "2026-11-08",
  };

  const state = createInitialStationState(owner);

  assert.deepEqual(state.fuelGrades, []);
  assert.deepEqual(state.fuelBatches, []);
  assert.deepEqual(state.attendants, [owner]);
  assert.deepEqual(state.transactions, []);
  assert.deepEqual(state.shiftState, {
    totalSalesAmount: 0,
    totalLitersDispensed: 0,
    transactionsCount: 0,
    cashInDrawer: 0,
  });
});

const createStationStateFixture = () => ({
  fuelGrades: [{
    id: "diesel",
    name: "Diesel Max",
    code: "DSL",
    color: "#f59e0b",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    badgeBorder: "border-amber-500",
    pricePerLiter: 56.8,
    tankLevelPercent: 50,
    remainingLiters: 1000,
    tankCapacityLiters: 2000,
    octaneOrCetane: "Cetane 54",
  }],
  fuelBatches: [],
  attendants: [{ id: "att-1", name: "Attendant One", badgeId: "AT-104", active: true }],
  permissions: {},
  transactions: [],
  shiftState: {
    totalSalesAmount: 0,
    totalLitersDispensed: 0,
    transactionsCount: 0,
    cashInDrawer: 0,
  },
});

const sale = (overrides = {}) => ({
  fuelGradeId: "diesel",
  volumeLiters: 10,
  paymentMethod: "cash",
  tenderedAmount: 600,
  ...overrides,
});

test("registers a sale using current server price and authenticated attendant", () => {
  const state = createStationStateFixture();
  const updated = registerStationSale(state, sale(), "att-1");
  const transaction = updated.transactions[0];
  const diesel = updated.fuelGrades.find((grade) => grade.id === "diesel");

  assert.equal(transaction.totalAmount, 568);
  assert.equal(transaction.pricePerLiter, 56.8);
  assert.equal(transaction.attendantName, "Attendant One");
  assert.equal(transaction.status, "completed");
  assert.equal(transaction.changeAmount, 32);
  assert.equal(diesel.remainingLiters, 990);
  assert.equal(updated.shiftState.transactionsCount, 1);
  assert.equal(state.fuelGrades[0].remainingLiters, 1000);
});

test("rejects sales that exceed available stock", () => {
  const state = createStationStateFixture();

  assert.throws(
    () => registerStationSale(state, sale({ volumeLiters: 20000 }), "att-1"),
    /exceeds available tank stock/i
  );
});

test("rejects sales for inactive attendants", () => {
  const state = createStationStateFixture();
  state.attendants[0].active = false;

  assert.throws(
    () => registerStationSale(state, sale(), "att-1"),
    /not active/i
  );
});

test("does not accept an invalid payment or under-tendered cash", () => {
  const state = createStationStateFixture();

  assert.throws(
    () => registerStationSale(state, sale({ paymentMethod: "unknown" }), "att-1"),
    /valid payment method/i
  );
  assert.throws(
    () => registerStationSale(state, sale({ tenderedAmount: 100 }), "att-1"),
    /must cover the sale total/i
  );
});

test("prevents managers from rewriting sales or assigning manager access", () => {
  const state = createStationStateFixture();
  state.attendants = [
    { id: "manager-1", role: "manager", active: true },
    { id: "attendant-1", role: "attendant", active: true },
  ];
  const changedSales = {
    ...state,
    shiftState: { ...state.shiftState, totalSalesAmount: 1 },
  };
  const elevatedAttendant = {
    ...state,
    attendants: state.attendants.map((attendant) =>
      attendant.id === "attendant-1"
        ? { ...attendant, role: "manager" }
        : attendant
    ),
  };

  assert.equal(canManagerUpdateStationState(state, changedSales, "manager-1"), false);
  assert.equal(canManagerUpdateStationState(state, elevatedAttendant, "manager-1"), false);
});