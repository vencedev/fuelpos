import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";
import type {
  FuelCostSalesReport,
  AttendantRankingPeriod,
  AttendantSalesRankingRow,
  SalesReportPeriod,
} from "./salesReports";

interface SalesReportPdfOptions {
  report: FuelCostSalesReport;
  period: SalesReportPeriod;
  periodLabel: string;
  generatedDateKey: string;
  attendantRanking: AttendantSalesRankingRow[];
  attendantRankingPeriod: AttendantRankingPeriod;
}

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PAGE_MARGIN = 40;
const TEXT_COLOR = rgb(0.13, 0.15, 0.17);
const MUTED_COLOR = rgb(0.38, 0.41, 0.44);
const ACCENT_COLOR = rgb(0.55, 0.34, 0.04);
const RULE_COLOR = rgb(0.78, 0.8, 0.81);
const TINT_COLOR = rgb(0.96, 0.96, 0.95);

function printableText(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
}

function formatCurrency(value: number): string {
  const [whole, fraction] = value.toFixed(2).split(".");
  return `PHP ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function formatNumber(value: number, decimals = 0): string {
  const formatted = value.toFixed(decimals);
  const [whole, fraction] = formatted.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
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

function drawRule(page: PDFPage, y: number, width: number): void {
  page.drawLine({
    start: { x: PAGE_MARGIN, y },
    end: { x: width - PAGE_MARGIN, y },
    thickness: 0.7,
    color: RULE_COLOR,
  });
}

function addPage(
  pdf: PDFDocument,
  title: string,
  periodLabel: string,
  boldFont: PDFFont,
  regularFont: PDFFont,
  firstPage = false
): { page: PDFPage; y: number } {
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const { width, height } = page.getSize();
  drawText(page, title, PAGE_MARGIN, height - 42, 17, boldFont);
  drawText(page, periodLabel, PAGE_MARGIN, height - 61, 10, regularFont, MUTED_COLOR);
  if (!firstPage) drawRule(page, height - 70, width);
  return { page, y: firstPage ? height - 82 : height - 88 };
}

function drawTableHeader(
  page: PDFPage,
  labels: string[],
  xPositions: number[],
  y: number,
  boldFont: PDFFont,
  alignments: ("left" | "right")[] = []
): number {
  page.drawRectangle({
    x: PAGE_MARGIN,
    y: y - 7,
    width: PAGE_WIDTH - PAGE_MARGIN * 2,
    height: 22,
    color: TINT_COLOR,
  });

  labels.forEach((label, index) => {
    const text = printableText(label);
    const x = xPositions[index];
    if (alignments[index] === "right") {
      const textWidth = boldFont.widthOfTextAtSize(text, 8);
      drawText(page, text, x - textWidth, y, 8, boldFont);
    } else {
      drawText(page, text, x, y, 8, boldFont);
    }
  });

  return y - 23;
}

function drawTableCell(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  align: "left" | "right" = "left",
  size = 8
): void {
  const safeText = printableText(text);
  const textWidth = font.widthOfTextAtSize(safeText, size);
  drawText(
    page,
    safeText,
    align === "right" ? x - textWidth : x,
    y,
    size,
    font
  );
}

export async function createSalesReportPdf({
  report,
  period,
  periodLabel,
  generatedDateKey,
  attendantRanking,
  attendantRankingPeriod,
}: SalesReportPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = "LE-AR FUEL STATION sales report";
  const { page: firstPage, y: firstPageY } = addPage(
    pdf,
    title,
    periodLabel,
    boldFont,
    regularFont,
    true
  );
  let page = firstPage;
  let y = firstPageY;
  const contentWidth = PAGE_WIDTH - PAGE_MARGIN * 2;

  drawText(
    page,
    `Generated ${generatedDateKey}. Net income is gross income less actual fuel cost and excludes operating expenses.`,
    PAGE_MARGIN,
    y,
    8,
    regularFont,
    MUTED_COLOR
  );
  y -= 28;

  const metricWidth = contentWidth / 3;
  const metrics = [
    ["Gross income", formatCurrency(report.totalAmount)],
    [
      "Fuel cost",
      report.fuelCost === null
        ? "Incomplete"
        : formatCurrency(report.fuelCost),
    ],
    [
      "Net income",
      report.netIncome === null
        ? "Incomplete"
        : formatCurrency(report.netIncome),
    ],
  ];

  metrics.forEach(([label, amount], index) => {
    const x = PAGE_MARGIN + index * metricWidth;
    page.drawRectangle({
      x,
      y: y - 21,
      width: metricWidth - 8,
      height: 42,
      color: TINT_COLOR,
    });
    drawText(page, label, x + 8, y + 8, 8, regularFont, MUTED_COLOR);
    drawText(page, amount, x + 8, y - 7, 11, boldFont, ACCENT_COLOR);
  });
  y -= 48;

  drawText(
    page,
    `${formatNumber(report.totalVolumeLiters, 3)} L sold  |  ${formatNumber(report.transactionCount)} transactions`,
    PAGE_MARGIN,
    y,
    8,
    regularFont,
    MUTED_COLOR
  );
  y -= 25;

  if (report.fuelGradesMissingCost.length > 0) {
    drawText(
      page,
      `Incomplete recorded fuel cost for: ${report.fuelGradesMissingCost.join(", ")}`,
      PAGE_MARGIN,
      y,
      8,
      boldFont,
      ACCENT_COLOR
    );
    y -= 18;
  }

  const addSection = (sectionTitle: string) => {
    if (y < 95) {
      ({ page, y } = addPage(
        pdf,
        title,
        periodLabel,
        boldFont,
        regularFont
      ));
    }
    drawText(page, sectionTitle, PAGE_MARGIN, y, 10, boldFont);
    y -= 18;
  };

  addSection("Sales by fuel grade");
  const fuelColumns = [PAGE_MARGIN + 4, 288, 393, 497, 604, 710, 798];
  y = drawTableHeader(
    page,
    ["Fuel grade", "Volume", "Gross income", "Avg cost/L", "Fuel cost", "Net income"],
    fuelColumns.slice(0, 6),
    y,
    boldFont,
    ["left", "right", "right", "right", "right", "right"]
  );

  const ensureRowSpace = () => {
    if (y > 52) return;
    ({ page, y } = addPage(pdf, title, periodLabel, boldFont, regularFont));
  };

  if (report.rows.length === 0) {
    drawTableCell(page, "No completed sales in this period.", PAGE_MARGIN + 4, y, regularFont);
    y -= 18;
  }

  for (const row of report.rows) {
    ensureRowSpace();
    const values = [
      row.fuelGradeName,
      `${formatNumber(row.totalVolumeLiters, 3)} L`,
      formatCurrency(row.totalAmount),
      row.averageCostPerLiter === null
        ? "Unavailable"
        : formatCurrency(row.averageCostPerLiter),
      row.fuelCost === null
        ? "Incomplete"
        : formatCurrency(row.fuelCost),
      row.netIncome === null
        ? "Incomplete"
        : formatCurrency(row.netIncome),
    ];
    values.forEach((value, index) =>
      drawTableCell(
        page,
        value,
        fuelColumns[index],
        y,
        index === 0 ? boldFont : regularFont,
        index === 0 ? "left" : "right"
      )
    );
    drawRule(page, y - 5, PAGE_WIDTH);
    y -= 19;
  }

  y -= 11;
  addSection(period === "month" ? "Daily totals" : "Monthly totals");
  const periodColumns = [PAGE_MARGIN + 4, 242, 356, 470, 584, 698, 798];
  y = drawTableHeader(
    page,
    ["Period", "Gross income", "Fuel cost", "Net income", "Volume", "Transactions"],
    periodColumns.slice(0, 6),
    y,
    boldFont,
    ["left", "right", "right", "right", "right", "right"]
  );

  for (const bucket of report.buckets) {
    ensureRowSpace();
    const bucketLabel =
      period === "month"
        ? `${periodLabel.split(" ")[0]} ${bucket.label}`
        : bucket.label;
    const values = [
      bucketLabel,
      formatCurrency(bucket.totalAmount),
      bucket.fuelCost === null
        ? "Incomplete"
        : formatCurrency(bucket.fuelCost),
      bucket.netIncome === null
        ? "Incomplete"
        : formatCurrency(bucket.netIncome),
      `${formatNumber(bucket.volumeLiters, 3)} L`,
      formatNumber(bucket.transactionCount),
    ];
    values.forEach((value, index) =>
      drawTableCell(
        page,
        value,
        periodColumns[index],
        y,
        index === 0 ? boldFont : regularFont,
        index === 0 ? "left" : "right"
      )
    );
    drawRule(page, y - 5, PAGE_WIDTH);
    y -= 18;
  }

  drawRule(page, y - 2, PAGE_WIDTH);
  y -= 17;
  const totals = [
    "Total",
    formatCurrency(report.totalAmount),
    report.fuelCost === null
      ? "Incomplete"
      : formatCurrency(report.fuelCost),
    report.netIncome === null
      ? "Incomplete"
      : formatCurrency(report.netIncome),
    `${formatNumber(report.totalVolumeLiters, 3)} L`,
    formatNumber(report.transactionCount),
  ];
  totals.forEach((value, index) =>
    drawTableCell(
      page,
      value,
      periodColumns[index],
      y,
      boldFont,
      index === 0 ? "left" : "right"
    )
  );

  pdf.setTitle(`${title} - ${periodLabel}`);
  pdf.setAuthor("LE-AR FUEL STATION");
  pdf.setSubject("Sales, actual fuel cost, and net income");
  return pdf.save();
}

interface AttendantRankingPdfOptions {
  ranking: AttendantSalesRankingRow[];
  period: AttendantRankingPeriod;
  generatedDateKey: string;
}

export async function createAttendantRankingPdf({
  ranking,
  period,
  generatedDateKey,
}: AttendantRankingPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const periodLabel = period === "today" ? "Today" : period === "month" ? "This month" : "This year";
  const { page, y: startY } = addPage(pdf, "Attendant sales ranking", periodLabel, boldFont, regularFont, true);
  let y = startY;

  drawText(page, `Generated ${generatedDateKey}. Completed sales only.`, PAGE_MARGIN, y, 8, regularFont, MUTED_COLOR);
  y -= 28;
  const columns = [PAGE_MARGIN + 4, 70, 410, 520, 630, 798];
  y = drawTableHeader(page, ["Rank", "Attendant", "Sales", "Volume", "Gross income"], columns.slice(0, 5), y, boldFont, ["right", "left", "right", "right", "right"]);

  if (ranking.length === 0) {
    drawTableCell(page, "No completed attendant sales for this period.", PAGE_MARGIN + 4, y, regularFont);
  } else {
    for (const row of ranking) {
      const values = [`#${row.rank}`, `${row.attendantName} (${row.attendantBadge})`, formatNumber(row.transactionCount), `${formatNumber(row.totalVolumeLiters, 3)} L`, formatCurrency(row.totalAmount)];
      values.forEach((value, index) => drawTableCell(page, value, columns[index], y, index === 1 ? boldFont : regularFont, index === 0 ? "right" : index === 1 ? "left" : "right"));
      drawRule(page, y - 5, PAGE_WIDTH);
      y -= 18;
    }
  }

  pdf.setTitle(`Attendant sales ranking - ${periodLabel}`);
  pdf.setAuthor("LE-AR FUEL STATION");
  pdf.setSubject("Attendant sales ranking");
  return pdf.save();
}
