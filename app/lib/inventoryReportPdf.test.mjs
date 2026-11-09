import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  buildInventoryDailyStockRows,
  getInventoryDailyStockTotals,
  createInventoryReportPdf,
} from "./inventoryReportPdf.ts";

test("reconstructs daily closing stock from deliveries and completed sales", () => {
  const rows = buildInventoryDailyStockRows(
    [{
      id: "fuel-1",
      name: "Diesel",
      code: "DSL",
      color: "#f59e0b",
      badgeBg: "",
      badgeBorder: "",
      pricePerLiter: 65,
      tankLevelPercent: 10,
      remainingLiters: 1000,
      tankCapacityLiters: 10000,
      octaneOrCetane: "Cetane 50",
    }],
    [
      { id: "batch-1", fuelGradeId: "fuel-1", liters: 200, receivedAt: "2026-11-08" },
      { id: "batch-2", fuelGradeId: "fuel-1", liters: 300, receivedAt: "2026-11-09" },
    ],
    [
      { fuelGradeId: "fuel-1", saleDate: "2026-11-08", status: "completed", volumeLiters: 100 },
      { fuelGradeId: "fuel-1", saleDate: "2026-11-09", status: "completed", volumeLiters: 50 },
      { fuelGradeId: "fuel-1", saleDate: "2026-11-09", status: "voided", volumeLiters: 500 },
    ],
    ["2026-11-07", "2026-11-08", "2026-11-09"],
    "2026-11-09"
  );

  assert.deepEqual(
    rows.map((row) => row.stocks[0].closingStockLiters),
    [650, 750, 1000]
  );
  assert.deepEqual(rows[2].stocks[0], {
    fuelGradeId: "fuel-1",
    fuelGradeName: "Diesel",
    openingStockLiters: 750,
    deliveredLiters: 300,
    soldLiters: 50,
    closingStockLiters: 1000,
  });
  assert.deepEqual(getInventoryDailyStockTotals(rows[2]), {
    openingStockLiters: 750,
    deliveredLiters: 300,
    soldLiters: 50,
    closingStockLiters: 1000,
  });
});

test("creates an inventory PDF with fuel grades and period deliveries", async () => {
  const bytes = await createInventoryReportPdf({
    grades: [{
      id: "fuel-1",
      name: "Diesel",
      code: "DSL",
      color: "#f59e0b",
      badgeBg: "",
      badgeBorder: "",
      pricePerLiter: 65,
      tankLevelPercent: 50,
      remainingLiters: 5000,
      tankCapacityLiters: 10000,
      octaneOrCetane: "Cetane 50",
    }],
    batches: [{
      id: "batch-1",
      fuelGradeId: "fuel-1",
      liters: 2500,
      receivedAt: new Date().toISOString().slice(0, 10),
      costPerLiter: 58,
    }],
    transactions: [],
    period: "month",
    generatedDateKey: "2026-11-09",
  });

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getAuthor(), "LE-AR FUEL STATION");
  assert.equal(pdf.getPageCount(), 2);
});

test("keeps yearly inventory summary on one page", async () => {
  const bytes = await createInventoryReportPdf({
    grades: [],
    batches: [],
    transactions: [],
    period: "year",
    generatedDateKey: "2026-11-09",
  });

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
});

test("lays out fuel grades as columns and daily dates as rows", async () => {
  const grades = Array.from({ length: 3 }, (_, index) => ({
    id: `fuel-${index + 1}`,
    name: `Grade ${index + 1}`,
    code: `G${index + 1}`,
    color: "#f59e0b",
    badgeBg: "",
    badgeBorder: "",
    pricePerLiter: 65,
    tankLevelPercent: 50,
    remainingLiters: 5000,
    tankCapacityLiters: 10000,
    octaneOrCetane: "",
  }));
  const bytes = await createInventoryReportPdf({
    grades,
    batches: [],
    transactions: [],
    period: "month",
    generatedDateKey: "2026-11-09",
  });

  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
});
