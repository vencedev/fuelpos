import assert from "node:assert/strict";
import test from "node:test";
import {
  findActiveStationOwner,
  resetStationState,
} from "./stationState.ts";

const createStationState = () => ({
  stationName: "LE-AR North",
  stationLocation: "Quezon City",
  fuelGrades: [{ id: "diesel", remainingLiters: 500 }],
  fuelBatches: [{ id: "delivery-1", liters: 500 }],
  attendants: [
    { id: "owner-1", role: "owner", active: true, badgeId: "OWN-001" },
    { id: "attendant-1", role: "attendant", active: true, badgeId: "ATT-001" },
  ],
  permissions: { allowCashDrop: true, requireCustomerPlateNumber: true },
  transactions: [{ id: "sale-1", totalAmount: 100 }],
  shiftState: {
    totalSalesAmount: 100,
    totalLitersDispensed: 2,
    transactionsCount: 1,
    cashInDrawer: 100,
  },
});

test("resets operational data while preserving station settings and the active owner", () => {
  const state = createStationState();
  const reset = resetStationState(state, "owner-1");

  assert.deepEqual(reset.fuelGrades, []);
  assert.deepEqual(reset.fuelBatches, []);
  assert.deepEqual(reset.transactions, []);
  assert.deepEqual(reset.attendants, [state.attendants[0]]);
  assert.deepEqual(reset.shiftState, {
    totalSalesAmount: 0,
    totalLitersDispensed: 0,
    transactionsCount: 0,
    cashInDrawer: 0,
  });
  assert.equal(reset.stationName, state.stationName);
  assert.equal(reset.stationLocation, state.stationLocation);
  assert.deepEqual(reset.permissions, state.permissions);
  assert.deepEqual(state, createStationState());
});

test("finds only an active owner for an authorized reset", () => {
  const state = createStationState();

  assert.equal(findActiveStationOwner(state, "owner-1"), state.attendants[0]);
  assert.equal(findActiveStationOwner(state, "attendant-1"), null);

  state.attendants[0].active = false;
  assert.equal(findActiveStationOwner(state, "owner-1"), null);
});

test("rejects reset when the supplied attendant is not an active owner", () => {
  const state = createStationState();

  assert.throws(
    () => resetStationState(state, "attendant-1"),
    /active station owner/i
  );
});
