import assert from "node:assert/strict";
import test from "node:test";
import {
  addDeliveryToFuelGrade,
  createFuelGradeId,
  deleteDeliveryBatch,
  editDeliveryBatch,
  getFuelBatchCostPerLiter,
  validateDeliveryBatch,
} from "./fuelManagement.ts";

const grade = {
  id: "diesel",
  name: "Diesel Max",
  code: "DSL",
  color: "#f59e0b",
  badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  badgeBorder: "border-amber-500",
  pricePerLiter: 56.8,
  tankLevelPercent: 78,
  remainingLiters: 19500,
  tankCapacityLiters: 25000,
  octaneOrCetane: "Cetane 54",
};

test("adds delivered liters and recalculates the tank level", () => {
  const updated = addDeliveryToFuelGrade(grade, 1000);

  assert.equal(updated.remainingLiters, 20500);
  assert.equal(updated.tankLevelPercent, 82);
  assert.equal(grade.remainingLiters, 19500);
});

test("rejects deliveries that exceed remaining tank capacity", () => {
  assert.throws(
    () => addDeliveryToFuelGrade(grade, 5501),
    /exceeds the remaining tank capacity/i
  );
});

test("rejects non-positive or non-finite delivery quantities", () => {
  assert.throws(() => addDeliveryToFuelGrade(grade, 0), /greater than 0 liters/i);
  assert.throws(() => addDeliveryToFuelGrade(grade, Number.NaN), /greater than 0 liters/i);
});

test("creates a valid unique fuel-grade ID from its code", () => {
  assert.equal(createFuelGradeId("DSL-98", []), "fuel-dsl-98");
  assert.equal(
    createFuelGradeId("DSL 98", ["fuel-dsl-98"]),
    "fuel-dsl-98-2"
  );
});

const batch = {
  id: "batch-1",
  fuelGradeId: "diesel",
  liters: 1000,
  receivedAt: "2026-11-08",
  supplier: "Fuel Supplier",
  costPerLiter: 50,
};

test("requires a positive per-liter cost", () => {
  assert.equal(validateDeliveryBatch(batch), null);
  assert.match(
    validateDeliveryBatch({ ...batch, costPerLiter: undefined }),
    /cost per liter/i
  );
  assert.match(
    validateDeliveryBatch({ ...batch, costPerLiter: 0 }),
    /cost per liter/i
  );
  assert.match(
    validateDeliveryBatch({
      liters: batch.liters,
      receivedAt: batch.receivedAt,
      totalPurchaseCost: 50000,
    }),
    /cost per liter/i
  );
  assert.match(
    validateDeliveryBatch({ ...batch, receivedAt: "2026-99-99" }),
    /valid delivery date/i
  );
});

test("converts saved legacy batch totals to a per-liter rate", () => {
  assert.equal(
    getFuelBatchCostPerLiter({
      liters: 1000,
      totalPurchaseCost: 50000,
    }),
    50
  );
  assert.equal(
    getFuelBatchCostPerLiter({
      liters: 1000,
      costPerLiter: 56.75,
      totalPurchaseCost: 50000,
    }),
    56.75
  );
  assert.equal(
    getFuelBatchCostPerLiter({
      liters: 0,
      totalPurchaseCost: 50000,
    }),
    undefined
  );
});

test("editing a batch adjusts stock by the liters difference and retains its ID", () => {
  const updatedBatch = {
    ...batch,
    liters: 1200,
    costPerLiter: 51,
    supplier: "Updated Supplier",
  };
  const result = editDeliveryBatch(grade, [batch], updatedBatch);

  assert.equal(result.fuelGrade.remainingLiters, 19700);
  assert.equal(result.fuelGrade.tankLevelPercent, 79);
  assert.deepEqual(result.fuelBatches, [updatedBatch]);
  assert.equal(batch.liters, 1000);
});

test("editing batch details without changing liters leaves tank stock unchanged", () => {
  const result = editDeliveryBatch(grade, [batch], {
    ...batch,
    receivedAt: "2026-11-07",
    supplier: "Another Supplier",
    costPerLiter: 51,
  });

  assert.equal(result.fuelGrade.remainingLiters, grade.remainingLiters);
});

test("saving a legacy batch migrates its cost to the per-liter field", () => {
  const legacyBatch = {
    ...batch,
    costPerLiter: undefined,
    totalPurchaseCost: 50000,
  };
  const updatedBatch = {
    ...legacyBatch,
    costPerLiter: getFuelBatchCostPerLiter(legacyBatch),
  };
  const result = editDeliveryBatch(grade, [legacyBatch], updatedBatch);

  assert.equal(result.fuelBatches[0].costPerLiter, 50);
  assert.equal(result.fuelBatches[0].totalPurchaseCost, undefined);
});

test("editing a batch to fewer liters subtracts only the difference from stock", () => {
  const result = editDeliveryBatch(grade, [batch], {
    ...batch,
    liters: 750,
  });

  assert.equal(result.fuelGrade.remainingLiters, 19250);
  assert.equal(result.fuelGrade.tankLevelPercent, 77);
});

test("rejects a batch edit that exceeds tank capacity", () => {
  assert.throws(
    () =>
      editDeliveryBatch(grade, [batch], {
        ...batch,
        liters: 6501,
      }),
    /remaining tank capacity/i
  );
});

test("deleting a batch removes its liters from tank stock and the batch list", () => {
  const result = deleteDeliveryBatch(grade, [batch], batch.id);

  assert.equal(result.fuelGrade.remainingLiters, 18500);
  assert.equal(result.fuelGrade.tankLevelPercent, 74);
  assert.deepEqual(result.fuelBatches, []);
});

test("rejects deleting a batch when its liters exceed current stock", () => {
  const lowStockGrade = { ...grade, remainingLiters: 500 };

  assert.throws(
    () => deleteDeliveryBatch(lowStockGrade, [batch], batch.id),
    /cannot remove this batch/i
  );
});
