import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFuelSalesBreakdown,
  buildSalesReport,
  buildAttendantSalesRanking,
  getTransactionDateKey,
} from "./salesReports.ts";
import * as salesReports from "./salesReports.ts";

const transaction = (overrides = {}) => ({
  id: "tx-1",
  receiptNumber: "FP-2026-004128",
  timestamp: "13:04:18",
  saleDate: "2026-11-07",
  pumpNumber: 1,
  fuelGradeId: "diesel",
  fuelGradeName: "Diesel Max",
  fuelGradeColor: "#f59e0b",
  pricePerLiter: 56.8,
  volumeLiters: 10.125,
  totalAmount: 575.25,
  paymentMethod: "cash",
  attendantName: "Juan Delgado",
  attendantBadge: "AT-104",
  status: "completed",
  ...overrides,
});

test("groups monthly sales by day and excludes non-completed transactions", () => {
  const report = buildSalesReport(
    [
      transaction(),
      transaction({
        id: "tx-2",
        saleDate: "2026-11-07",
        volumeLiters: 5.25,
        totalAmount: 299.0,
      }),
      transaction({ id: "tx-3", saleDate: "2026-11-08" }),
      transaction({ id: "tx-4", saleDate: "2026-10-31" }),
      transaction({ id: "tx-5", status: "voided" }),
      transaction({ id: "tx-6", status: "pending" }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-07"
  );

  assert.equal(report.buckets.length, 30);
  assert.deepEqual(report.buckets[6], {
    label: "7",
    dateKey: "2026-11-07",
    totalAmount: 874.25,
    volumeLiters: 15.375,
    transactionCount: 2,
  });
  assert.equal(report.totalAmount, 1449.5);
  assert.equal(report.totalVolumeLiters, 25.5);
  assert.equal(report.transactionCount, 3);
  assert.equal(report.averageSale, 483.1666666666667);
});

test("groups yearly sales by month and excludes other years", () => {
  const report = buildSalesReport(
    [
      transaction({ saleDate: "2026-01-03" }),
      transaction({ id: "tx-2", saleDate: "2026-11-07", totalAmount: 1000 }),
      transaction({ id: "tx-3", saleDate: "2025-11-07" }),
    ],
    "year",
    new Date(2026, 0, 1),
    "2026-11-07"
  );

  assert.equal(report.buckets.length, 12);
  assert.deepEqual(report.buckets[0], {
    label: "Jan",
    dateKey: "2026-01-01",
    totalAmount: 575.25,
    volumeLiters: 10.125,
    transactionCount: 1,
  });
  assert.deepEqual(report.buckets[10], {
    label: "Nov",
    dateKey: "2026-11-01",
    totalAmount: 1000,
    volumeLiters: 10.125,
    transactionCount: 1,
  });
  assert.equal(report.totalAmount, 1575.25);
  assert.equal(report.transactionCount, 2);
});

test("ranks attendants by completed sales for today, month, and year", () => {
  const attendants = [{ id: "att-1", name: "Juan", badgeId: "AT-104" }, { id: "att-2", name: "Maria", badgeId: "AT-105" }];
  const transactions = [
    transaction({ id: "tx-today", saleDate: "2026-11-09", attendantBadge: "AT-104", totalAmount: 1000 }),
    transaction({ id: "tx-month", saleDate: "2026-11-01", attendantBadge: "AT-105", totalAmount: 900 }),
    transaction({ id: "tx-year", saleDate: "2025-11-09", attendantBadge: "AT-104", totalAmount: 5000 }),
  ];

  const today = buildAttendantSalesRanking(attendants, transactions, "today", new Date(2026, 10, 9), "2026-11-09");
  const month = buildAttendantSalesRanking(attendants, transactions, "month", new Date(2026, 10, 1), "2026-11-09");
  const year = buildAttendantSalesRanking(attendants, transactions, "year", new Date(2026, 0, 1), "2026-11-09");

  assert.deepEqual(today.map((row) => [row.rank, row.attendantBadge, row.totalAmount]), [[1, "AT-104", 1000]]);
  assert.deepEqual(month.map((row) => [row.rank, row.attendantBadge, row.totalAmount]), [[1, "AT-104", 1000], [2, "AT-105", 900]]);
  assert.deepEqual(year.map((row) => [row.attendantBadge, row.totalAmount]), [["AT-104", 1000], ["AT-105", 900]]);
});

test("uses today's date for legacy transactions without a sale date", () => {
  const report = buildSalesReport(
    [transaction({ saleDate: undefined })],
    "month",
    new Date(2026, 10, 1),
    "2026-11-07"
  );

  assert.equal(report.buckets[6].totalAmount, 575.25);
  assert.equal(
    getTransactionDateKey({ saleDate: undefined }, "2026-11-07"),
    "2026-11-07"
  );
});

test("ignores invalid sale dates instead of assigning them to a report period", () => {
  const report = buildSalesReport(
    [transaction({ saleDate: "2026-02-30" })],
    "month",
    new Date(2026, 1, 1),
    "2026-02-01"
  );

  assert.equal(report.transactionCount, 0);
  assert.equal(getTransactionDateKey({ saleDate: "not-a-date" }, "2026-11-07"), null);
});

test("creates the correct number of days for leap-year monthly reports", () => {
  const report = buildSalesReport(
    [],
    "month",
    new Date(2024, 1, 1),
    "2024-02-01"
  );

  assert.equal(report.buckets.length, 29);
  assert.equal(report.totalAmount, 0);
  assert.equal(report.transactionCount, 0);
});

test("groups completed sales by fuel and includes unsold and historical grades", () => {
  const breakdown = buildFuelSalesBreakdown(
    [
      { id: "diesel", name: "Diesel Max" },
      { id: "regular", name: "Regular 91" },
    ],
    [
      transaction(),
      transaction({
        id: "tx-2",
        totalAmount: 299,
        volumeLiters: 5.25,
      }),
      transaction({
        id: "tx-3",
        fuelGradeId: "removed-grade",
        fuelGradeName: "Legacy Premium",
        totalAmount: 600,
        volumeLiters: 10,
      }),
      transaction({ id: "tx-4", status: "voided" }),
    ]
  );

  assert.deepEqual(breakdown, [
    {
      fuelGradeId: "diesel",
      fuelGradeName: "Diesel Max",
      totalAmount: 874.25,
      totalVolumeLiters: 15.375,
      transactionCount: 2,
    },
    {
      fuelGradeId: "regular",
      fuelGradeName: "Regular 91",
      totalAmount: 0,
      totalVolumeLiters: 0,
      transactionCount: 0,
    },
    {
      fuelGradeId: "removed-grade",
      fuelGradeName: "Legacy Premium",
      totalAmount: 600,
      totalVolumeLiters: 10,
      transactionCount: 1,
    },
  ]);
});

test("calculates monthly fuel costs from actual delivery batches using FIFO", () => {
  const buildFuelCostReport = salesReports.buildFuelCostReport;
  assert.equal(typeof buildFuelCostReport, "function");

  const report = buildFuelCostReport(
    [
      {
        id: "diesel-old",
        fuelGradeId: "diesel",
        liters: 1000,
        receivedAt: "2026-10-10",
        costPerLiter: 50,
      },
      {
        id: "diesel-current",
        fuelGradeId: "diesel",
        liters: 3000,
        receivedAt: "2026-11-03",
        costPerLiter: 54,
      },
      {
        id: "diesel-future",
        fuelGradeId: "diesel",
        liters: 1000,
        receivedAt: "2026-12-01",
        costPerLiter: 90,
      },
      {
        id: "regular-current",
        fuelGradeId: "regular",
        liters: 1000,
        receivedAt: "2026-11-01",
        costPerLiter: 42,
      },
    ],
    [
      transaction(),
      transaction({
        id: "tx-2",
        volumeLiters: 5.25,
        totalAmount: 299,
      }),
      transaction({
        id: "tx-3",
        fuelGradeId: "regular",
        fuelGradeName: "Regular 91",
        volumeLiters: 4,
        totalAmount: 240,
      }),
      transaction({
        id: "tx-4",
        saleDate: "2026-10-31",
      }),
      transaction({
        id: "tx-5",
        status: "voided",
      }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-30"
  );

  assert.deepEqual(report.rows, [
    {
      fuelGradeId: "diesel",
      fuelGradeName: "Diesel Max",
      totalAmount: 874.25,
      totalVolumeLiters: 15.375,
      averageCostPerLiter: 50,
      fuelCost: 768.75,
      netIncome: 105.5,
      transactionCount: 2,
    },
    {
      fuelGradeId: "regular",
      fuelGradeName: "Regular 91",
      totalAmount: 240,
      totalVolumeLiters: 4,
      averageCostPerLiter: 42,
      fuelCost: 168,
      netIncome: 72,
      transactionCount: 1,
    },
  ]);
  assert.equal(report.totalAmount, 1114.25);
  assert.equal(report.fuelCost, 936.75);
  assert.equal(report.netIncome, 177.5);
  assert.equal(report.totalVolumeLiters, 19.375);
  assert.equal(report.transactionCount, 3);
  assert.deepEqual(report.fuelGradesMissingCost, []);
  assert.deepEqual(report.buckets[6], {
    label: "7",
    dateKey: "2026-11-07",
    totalAmount: 1114.25,
    volumeLiters: 19.375,
    transactionCount: 3,
    fuelCost: 936.75,
    netIncome: 177.5,
  });
});

test("calculates yearly fuel costs from purchases available by the report end", () => {
  const buildFuelCostReport = salesReports.buildFuelCostReport;
  assert.equal(typeof buildFuelCostReport, "function");

  const report = buildFuelCostReport(
    [
      {
        id: "diesel-january",
        fuelGradeId: "diesel",
        liters: 1000,
        receivedAt: "2026-01-02",
        costPerLiter: 48,
      },
      {
        id: "diesel-next-year",
        fuelGradeId: "diesel",
        liters: 1000,
        receivedAt: "2027-01-02",
        costPerLiter: 80,
      },
    ],
    [
      transaction({
        saleDate: "2026-01-03",
        volumeLiters: 2,
        totalAmount: 120,
      }),
      transaction({
        id: "tx-2",
        saleDate: "2026-11-07",
        volumeLiters: 3,
        totalAmount: 180,
      }),
      transaction({
        id: "tx-3",
        saleDate: "2025-11-07",
      }),
    ],
    "year",
    new Date(2026, 0, 1),
    "2026-12-31"
  );

  assert.equal(report.totalAmount, 300);
  assert.equal(report.fuelCost, 240);
  assert.equal(report.netIncome, 60);
  assert.equal(report.transactionCount, 2);
  assert.equal(report.buckets[0].netIncome, 24);
  assert.equal(report.buckets[10].netIncome, 36);
  assert.equal(report.buckets[1].fuelCost, 0);
});

test("uses FIFO batch costs available by each daily bucket and keeps totals reconciled", () => {
  const buildFuelCostReport = salesReports.buildFuelCostReport;
  assert.equal(typeof buildFuelCostReport, "function");

  const report = buildFuelCostReport(
    [
      {
        id: "batch-1",
        fuelGradeId: "diesel",
        liters: 1000,
        receivedAt: "2026-11-01",
        costPerLiter: 50,
      },
      {
        id: "batch-2",
        fuelGradeId: "diesel",
        liters: 1000,
        receivedAt: "2026-11-05",
        costPerLiter: 60,
      },
    ],
    [
      transaction({
        saleDate: "2026-11-02",
        volumeLiters: 10,
        totalAmount: 600,
      }),
      transaction({
        id: "tx-2",
        saleDate: "2026-11-10",
        volumeLiters: 10,
        totalAmount: 600,
      }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-30"
  );

  assert.deepEqual(report.buckets[1], {
    label: "2",
    dateKey: "2026-11-02",
    totalAmount: 600,
    volumeLiters: 10,
    transactionCount: 1,
    fuelCost: 500,
    netIncome: 100,
  });
  assert.deepEqual(report.buckets[9], {
    label: "10",
    dateKey: "2026-11-10",
    totalAmount: 600,
    volumeLiters: 10,
    transactionCount: 1,
    fuelCost: 500,
    netIncome: 100,
  });
  assert.equal(report.fuelCost, 1000);
  assert.equal(report.netIncome, 200);
  assert.equal(report.rows[0].fuelCost, 1000);
  assert.equal(report.rows[0].netIncome, 200);
});

test("uses actual batch costs when one sale consumes multiple deliveries", () => {
  const report = salesReports.buildFuelCostReport(
    [
      {
        id: "batch-first",
        fuelGradeId: "diesel",
        liters: 5,
        receivedAt: "2026-11-01",
        costPerLiter: 40,
      },
      {
        id: "batch-second",
        fuelGradeId: "diesel",
        liters: 10,
        receivedAt: "2026-11-03",
        costPerLiter: 55,
      },
    ],
    [
      transaction({
        saleDate: "2026-11-04",
        volumeLiters: 8,
        totalAmount: 480,
      }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-30"
  );

  assert.equal(report.rows[0].fuelCost, 365);
  assert.equal(report.rows[0].netIncome, 115);
  assert.equal(report.buckets[3].fuelCost, 365);
  assert.equal(report.buckets[3].netIncome, 115);
});

test("prior sales consume FIFO layers before the selected report period", () => {
  const report = salesReports.buildFuelCostReport(
    [
      {
        id: "batch-first",
        fuelGradeId: "diesel",
        liters: 10,
        receivedAt: "2026-11-01",
        costPerLiter: 40,
      },
      {
        id: "batch-second",
        fuelGradeId: "diesel",
        liters: 10,
        receivedAt: "2026-11-03",
        costPerLiter: 55,
      },
    ],
    [
      transaction({
        saleDate: "2026-11-02",
        volumeLiters: 10,
        totalAmount: 600,
      }),
      transaction({
        id: "tx-december",
        saleDate: "2026-12-02",
        volumeLiters: 5,
        totalAmount: 300,
      }),
    ],
    "month",
    new Date(2026, 11, 1),
    "2026-12-02"
  );

  assert.equal(report.rows[0].fuelCost, 275);
  assert.equal(report.rows[0].netIncome, 25);
});

test("marks fuel cost incomplete when recorded deliveries cannot cover the sale", () => {
  const report = salesReports.buildFuelCostReport(
    [
      {
        id: "batch-first",
        fuelGradeId: "diesel",
        liters: 5,
        receivedAt: "2026-11-03",
        costPerLiter: 40,
      },
    ],
    [
      transaction({
        saleDate: "2026-11-02",
        volumeLiters: 8,
        totalAmount: 480,
      }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-30"
  );

  assert.equal(report.fuelCost, null);
  assert.equal(report.netIncome, null);
  assert.deepEqual(report.fuelGradesMissingCost, ["Diesel Max"]);
});

test("marks fuel cost incomplete when a consumed batch has no recorded purchase cost", () => {
  const report = salesReports.buildFuelCostReport(
    [
      {
        id: "batch-unknown-cost",
        fuelGradeId: "diesel",
        liters: 5,
        receivedAt: "2026-11-01",
      },
      {
        id: "batch-known-cost",
        fuelGradeId: "diesel",
        liters: 10,
        receivedAt: "2026-11-02",
        costPerLiter: 55,
      },
    ],
    [
      transaction({
        saleDate: "2026-11-03",
        volumeLiters: 8,
        totalAmount: 480,
      }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-30"
  );

  assert.equal(report.fuelCost, null);
  assert.equal(report.netIncome, null);
  assert.deepEqual(report.fuelGradesMissingCost, ["Diesel Max"]);
});

test("marks net income incomplete when a sold grade has no purchase-cost history", () => {
  const buildFuelCostReport = salesReports.buildFuelCostReport;
  assert.equal(typeof buildFuelCostReport, "function");

  const report = buildFuelCostReport(
    [],
    [
      transaction({
        fuelGradeId: "removed-grade",
        fuelGradeName: "Legacy Premium",
      }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-30"
  );

  assert.equal(report.totalAmount, 575.25);
  assert.equal(report.fuelCost, null);
  assert.equal(report.netIncome, null);
  assert.deepEqual(report.fuelGradesMissingCost, ["Legacy Premium"]);
  assert.equal(report.rows[0].fuelCost, null);
  assert.equal(report.rows[0].netIncome, null);
  assert.equal(report.buckets[6].fuelCost, null);
  assert.equal(report.buckets[6].netIncome, null);
});
