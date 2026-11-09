import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { FuelBatch, FuelGrade, Transaction } from "../types/pos";
import { getTransactionDateKey } from "./salesReports";

export type InventoryReportPeriod = "week" | "month" | "year";

interface InventoryReportPdfOptions {
  grades: FuelGrade[];
  batches: FuelBatch[];
  transactions: Transaction[];
  period: InventoryReportPeriod;
  generatedDateKey: string;
  stationName?: string;
}

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PAGE_MARGIN = 40;
const TEXT_COLOR = rgb(0.13, 0.15, 0.17);
const MUTED_COLOR = rgb(0.38, 0.41, 0.44);
const RULE_COLOR = rgb(0.78, 0.8, 0.81);
const TINT_COLOR = rgb(0.96, 0.96, 0.95);

function printableText(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
}

function formatNumber(value: number, decimals = 2): string {
  const formatted = value.toFixed(decimals);
  const [whole, fraction] = formatted.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals === 0 ? grouped : `${grouped}.${fraction}`;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = TEXT_COLOR
): void {
  page.drawText(printableText(text), { x, y, size, font, color });
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(date: Date): string {
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function periodBounds(period: InventoryReportPeriod, date: Date) {
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === "month") {
    start.setDate(1);
  } else {
    start.setMonth(0, 1);
  }
  return { start, end };
}

function getDateKeys(start: Date, end: Date): string[] {
  const dateKeys: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (current <= last) {
    dateKeys.push(dateToKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dateKeys;
}

export function getInventoryPeriodLabel(period: InventoryReportPeriod, date = new Date()) {
  if (period === "week") return "This week";
  if (period === "month") return `${date.toLocaleString("en-US", { month: "long" })} ${date.getFullYear()}`;
  return `Year ${date.getFullYear()}`;
}

export function getInventoryDateRangeLabel(period: InventoryReportPeriod, date = new Date()) {
  const { start, end } = periodBounds(period, date);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

interface InventoryDailyStock {
  fuelGradeId: string;
  fuelGradeName: string;
  openingStockLiters: number;
  deliveredLiters: number;
  soldLiters: number;
  closingStockLiters: number;
}

export interface InventoryDailyStockRow {
  dateKey: string;
  stocks: InventoryDailyStock[];
}

export function getInventoryDailyStockTotals(row: InventoryDailyStockRow) {
  return row.stocks.reduce(
    (totals, stock) => ({
      openingStockLiters: totals.openingStockLiters + stock.openingStockLiters,
      deliveredLiters: totals.deliveredLiters + stock.deliveredLiters,
      soldLiters: totals.soldLiters + stock.soldLiters,
      closingStockLiters: totals.closingStockLiters + stock.closingStockLiters,
    }),
    {
      openingStockLiters: 0,
      deliveredLiters: 0,
      soldLiters: 0,
      closingStockLiters: 0,
    }
  );
}

export function buildInventoryDailyStockRows(
  grades: FuelGrade[],
  batches: FuelBatch[],
  transactions: Pick<Transaction, "fuelGradeId" | "saleDate" | "status" | "volumeLiters">[],
  dateKeys: string[],
  reportDateKey: string
): InventoryDailyStockRow[] {
  const dateKeySet = new Set(dateKeys);
  const movementsByGrade = new Map<string, Map<string, { delivered: number; sold: number }>>();
  for (const grade of grades) movementsByGrade.set(grade.id, new Map());

  const addMovement = (
    fuelGradeId: string,
    dateKey: string,
    liters: number,
    kind: "delivered" | "sold"
  ) => {
    if (!dateKeySet.has(dateKey)) return;
    const gradeMovements = movementsByGrade.get(fuelGradeId);
    if (!gradeMovements) return;
    const movement = gradeMovements.get(dateKey) ?? { delivered: 0, sold: 0 };
    movement[kind] += liters;
    gradeMovements.set(dateKey, movement);
  };

  for (const batch of batches) {
    addMovement(batch.fuelGradeId, batch.receivedAt, batch.liters, "delivered");
  }
  for (const transaction of transactions) {
    if (transaction.status !== "completed") continue;
    const dateKey = getTransactionDateKey(transaction, reportDateKey);
    if (dateKey) addMovement(transaction.fuelGradeId, dateKey, transaction.volumeLiters, "sold");
  }

  const remainingStock = new Map(grades.map((grade) => [grade.id, grade.remainingLiters]));
  const stocksByDate = new Map<string, InventoryDailyStock[]>();
  for (let index = dateKeys.length - 1; index >= 0; index -= 1) {
    const dateKey = dateKeys[index];
    const stocks = grades.map((grade): InventoryDailyStock => {
      const movement = movementsByGrade.get(grade.id)?.get(dateKey) ?? { delivered: 0, sold: 0 };
      const closingStockLiters = remainingStock.get(grade.id) ?? 0;
      return {
        fuelGradeId: grade.id,
        fuelGradeName: grade.name,
        openingStockLiters: closingStockLiters - movement.delivered + movement.sold,
        deliveredLiters: movement.delivered,
        soldLiters: movement.sold,
        closingStockLiters,
      };
    });
    stocksByDate.set(dateKey, stocks);

    for (const grade of grades) {
      const movement = movementsByGrade.get(grade.id)?.get(dateKey) ?? { delivered: 0, sold: 0 };
      remainingStock.set(
        grade.id,
        (remainingStock.get(grade.id) ?? 0) - movement.delivered + movement.sold
      );
    }
  }

  return dateKeys.map((dateKey) => ({ dateKey, stocks: stocksByDate.get(dateKey) ?? [] }));
}

function isDateInPeriod(receivedAt: string, period: InventoryReportPeriod, reportDate: Date) {
  const receivedDate = new Date(`${receivedAt}T00:00:00`);
  if (Number.isNaN(receivedDate.getTime())) return false;
  const { start, end } = periodBounds(period, reportDate);
  return receivedDate >= start && receivedDate <= end;
}

function drawSummaryPage(
  pdf: PDFDocument,
  grades: FuelGrade[],
  batches: FuelBatch[],
  period: InventoryReportPeriod,
  reportDate: Date,
  generatedDateKey: string,
  brand: string,
  latestDailyStock: InventoryDailyStockRow | undefined,
  regularFont: PDFFont,
  boldFont: PDFFont
): void {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const periodLabel = getInventoryPeriodLabel(period, reportDate);
  const dateRangeLabel = getInventoryDateRangeLabel(period, reportDate);
  let y = PAGE_HEIGHT - 42;

  drawText(page, brand, PAGE_MARGIN, y, 17, boldFont);
  y -= 19;
  drawText(page, "Fuel inventory report", PAGE_MARGIN, y, 13, boldFont);
  y -= 18;
  drawText(page, `${periodLabel}: ${dateRangeLabel} | Generated ${generatedDateKey}`, PAGE_MARGIN, y, 9, regularFont, MUTED_COLOR);
  y -= 30;

  const columns = [PAGE_MARGIN + 4, 220, 350, 470, 590, 798];
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: y - 7,
    width: PAGE_WIDTH - PAGE_MARGIN * 2,
    height: 22,
    color: TINT_COLOR,
  });
  ["Fuel grade", "Price / L", "Current stock", "Tank capacity", "Delivered"].forEach((label, index) => {
    drawText(page, label, columns[index], y, 8, boldFont, TEXT_COLOR);
  });
  y -= 29;

  if (grades.length === 0) {
    drawText(page, "No fuel grades have been added.", PAGE_MARGIN + 4, y, 10, regularFont, MUTED_COLOR);
  } else {
    for (const grade of grades) {
      const delivered = batches
        .filter((batch) => batch.fuelGradeId === grade.id && isDateInPeriod(batch.receivedAt, period, reportDate))
        .reduce((total, batch) => total + batch.liters, 0);
      const values = [
        grade.name,
        `PHP ${formatNumber(grade.pricePerLiter)}`,
        `${formatNumber(grade.remainingLiters)} L`,
        `${formatNumber(grade.tankCapacityLiters)} L`,
        `${formatNumber(delivered)} L`,
      ];
      values.forEach((value, index) => {
        drawText(page, value, columns[index], y, 9, index === 0 ? boldFont : regularFont);
      });
      page.drawLine({
        start: { x: PAGE_MARGIN, y: y - 6 },
        end: { x: PAGE_WIDTH - PAGE_MARGIN, y: y - 6 },
        thickness: 0.6,
        color: RULE_COLOR,
      });
      y -= 25;
    }
  }

  const totalStock = grades.reduce((total, grade) => total + grade.remainingLiters, 0);
  const totalCapacity = grades.reduce((total, grade) => total + grade.tankCapacityLiters, 0);
  const totalDelivered = batches
    .filter((batch) => isDateInPeriod(batch.receivedAt, period, reportDate))
    .reduce((total, batch) => total + batch.liters, 0);
  y -= 18;
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: y - 30,
    width: PAGE_WIDTH - PAGE_MARGIN * 2,
    height: 46,
    color: TINT_COLOR,
  });
  drawText(page, "Total current stock", PAGE_MARGIN + 4, y - 1, 8, regularFont, MUTED_COLOR);
  drawText(page, `${formatNumber(totalStock)} L`, PAGE_MARGIN + 4, y - 18, 12, boldFont);
  drawText(page, "Total capacity", 220, y - 1, 8, regularFont, MUTED_COLOR);
  drawText(page, `${formatNumber(totalCapacity)} L`, 220, y - 18, 12, boldFont);
  drawText(page, `Delivered for ${periodLabel}`, 470, y - 1, 8, regularFont, MUTED_COLOR);
  drawText(page, `${formatNumber(totalDelivered)} L`, 470, y - 18, 12, boldFont);

  if (latestDailyStock) {
    const dailyTotals = getInventoryDailyStockTotals(latestDailyStock);
    const dailyLabel = `Stock update for ${formatDate(parseDateKey(latestDailyStock.dateKey))} (reconstructed)`;
    drawText(page, dailyLabel, PAGE_MARGIN + 4, y - 52, 8, boldFont);
    drawText(
      page,
      `${formatNumber(dailyTotals.openingStockLiters)} L opening + ${formatNumber(dailyTotals.deliveredLiters)} L delivered - ${formatNumber(dailyTotals.soldLiters)} L sold = ${formatNumber(dailyTotals.closingStockLiters)} L closing`,
      PAGE_MARGIN + 4,
      y - 67,
      8,
      regularFont,
      MUTED_COLOR
    );
  }
}

function drawDailyStockPages(
  pdf: PDFDocument,
  rows: InventoryDailyStockRow[],
  periodLabel: string,
  dateRangeLabel: string,
  generatedDateKey: string,
  regularFont: PDFFont,
  boldFont: PDFFont
): void {
  if (rows.length === 0 || rows[0].stocks.length === 0) return;

  const dateRowsPerPage = 21;
  const gradesPerPage = 4;
  const dateWidth = 78;
  const gradeColumnWidth = (PAGE_WIDTH - PAGE_MARGIN * 2 - dateWidth) / gradesPerPage;
  const grades = rows[0].stocks;

  for (let gradeOffset = 0; gradeOffset < grades.length; gradeOffset += gradesPerPage) {
    const gradeColumns = grades.slice(gradeOffset, gradeOffset + gradesPerPage);
    for (let dateOffset = 0; dateOffset < rows.length; dateOffset += dateRowsPerPage) {
      const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const pageRows = rows.slice(dateOffset, dateOffset + dateRowsPerPage);
      let y = PAGE_HEIGHT - 42;
      drawText(page, "Daily stock updates", PAGE_MARGIN, y, 15, boldFont);
      y -= 18;
      drawText(page, `${periodLabel}: ${dateRangeLabel} | Generated ${generatedDateKey}`, PAGE_MARGIN, y, 8, regularFont, MUTED_COLOR);
      y -= 14;
      drawText(page, "Daily balances reconstructed from current stock and recorded deliveries/completed sales.", PAGE_MARGIN, y, 7, regularFont, MUTED_COLOR);
      y -= 24;

      page.drawRectangle({
        x: PAGE_MARGIN,
        y: y - 6,
        width: PAGE_WIDTH - PAGE_MARGIN * 2,
        height: 20,
        color: TINT_COLOR,
      });
      drawText(page, "Date", PAGE_MARGIN + 3, y, 8, boldFont);
      gradeColumns.forEach((grade, index) => {
        const x = PAGE_MARGIN + dateWidth + gradeColumnWidth * index + 4;
        drawText(page, grade.fuelGradeName, x, y, 7, boldFont);
      });
      y -= 24;

      for (const row of pageRows) {
        drawText(page, formatDate(parseDateKey(row.dateKey)), PAGE_MARGIN + 3, y, 7, regularFont);
        gradeColumns.forEach((grade, index) => {
          const stock = row.stocks.find((item) => item.fuelGradeId === grade.fuelGradeId);
          if (!stock) return;
          const x = PAGE_MARGIN + dateWidth + gradeColumnWidth * index + 4;
          drawText(
            page,
            `Open ${formatNumber(stock.openingStockLiters, 1)} | +${formatNumber(stock.deliveredLiters, 1)} in | -${formatNumber(stock.soldLiters, 1)} out`,
            x,
            y,
            6,
            regularFont
          );
          drawText(
            page,
            `Close ${formatNumber(stock.closingStockLiters, 1)} L`,
            x,
            y - 9,
            6,
            boldFont
          );
        });
        page.drawLine({
          start: { x: PAGE_MARGIN, y: y - 13 },
          end: { x: PAGE_WIDTH - PAGE_MARGIN, y: y - 13 },
          thickness: 0.5,
          color: RULE_COLOR,
        });
        y -= 20;
      }
    }
  }
}

export async function createInventoryReportPdf({
  grades,
  batches,
  transactions,
  period,
  generatedDateKey,
  stationName = "LE-AR FUEL STATION",
}: InventoryReportPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reportDate = parseDateKey(generatedDateKey);
  const brand = stationName.trim() || "LE-AR FUEL STATION";
  const { start, end } = periodBounds(period, reportDate);
  const dateKeys = getDateKeys(start, end);
  const periodLabel = getInventoryPeriodLabel(period, reportDate);
  const dateRangeLabel = getInventoryDateRangeLabel(period, reportDate);

  const dailyRows = buildInventoryDailyStockRows(
    grades,
    batches,
    transactions,
    dateKeys,
    generatedDateKey
  );
  drawSummaryPage(
    pdf,
    grades,
    batches,
    period,
    reportDate,
    generatedDateKey,
    brand,
    dailyRows[dailyRows.length - 1],
    regularFont,
    boldFont
  );
  drawDailyStockPages(
    pdf,
    dailyRows,
    periodLabel,
    dateRangeLabel,
    generatedDateKey,
    regularFont,
    boldFont
  );

  pdf.setTitle(`${brand} - Fuel inventory report - ${periodLabel}`);
  pdf.setAuthor(brand);
  pdf.setSubject("Fuel inventory and daily stock updates");
  return pdf.save();
}
