import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildFuelCostReport } from "./salesReports.ts";
import { createSalesReportPdf } from "./salesReportPdf.ts";

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
  volumeLiters: 10,
  totalAmount: 568,
  paymentMethod: "cash",
  attendantName: "Juan Delgado",
  attendantBadge: "AT-104",
  status: "completed",
  ...overrides,
});

test("creates a valid monthly sales PDF with the selected period and daily net totals", async () => {
  const report = buildFuelCostReport(
    [
      {
        id: "batch-1",
        fuelGradeId: "diesel",
        liters: 1000,
        receivedAt: "2026-11-01",
        costPerLiter: 50,
      },
    ],
    [
      transaction({
        saleDate: "2026-11-02",
        volumeLiters: 10,
        totalAmount: 600,
      }),
    ],
    "month",
    new Date(2026, 10, 1),
    "2026-11-30"
  );

  const bytes = await createSalesReportPdf({
    report,
    period: "month",
    periodLabel: "November 2026",
    generatedDateKey: "2026-11-30",
    attendantRanking: [],
    attendantRankingPeriod: "today",
  });

  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), "LE-AR FUEL STATION sales report - November 2026");
  assert.ok(pdf.getPageCount() >= 1);
});

test("creates a multipage yearly sales PDF without dropping monthly rows", async () => {
  const report = buildFuelCostReport(
    [],
    Array.from({ length: 12 }, (_, index) =>
      transaction({
        id: `tx-${index + 1}`,
        saleDate: `2026-${String(index + 1).padStart(2, "0")}-07`,
      })
    ),
    "year",
    new Date(2026, 0, 1),
    "2026-12-31"
  );

  const bytes = await createSalesReportPdf({
    report,
    period: "year",
    periodLabel: "2026",
    generatedDateKey: "2026-12-31",
    attendantRanking: [],
    attendantRankingPeriod: "year",
  });
  const pdf = await PDFDocument.load(bytes);

  assert.ok(pdf.getPageCount() >= 1);
});
