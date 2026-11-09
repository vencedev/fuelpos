import type { FuelBatch, FuelGrade, Transaction } from "../types/pos";
import { getFuelBatchCostPerLiter } from "./fuelManagement";

export type SalesReportPeriod = "month" | "year";

export interface FuelSalesBreakdownRow {
  fuelGradeId: string;
  fuelGradeName: string;
  totalAmount: number;
  totalVolumeLiters: number;
  transactionCount: number;
}

export interface SalesReportBucket {
  label: string;
  dateKey: string;
  totalAmount: number;
  volumeLiters: number;
  transactionCount: number;
}

export interface SalesReport {
  buckets: SalesReportBucket[];
  totalAmount: number;
  totalVolumeLiters: number;
  transactionCount: number;
  averageSale: number;
  peakBucketAmount: number;
}

export type AttendantRankingPeriod = "today" | "month" | "year";

export interface AttendantSalesRankingRow {
  rank: number;
  attendantId: string;
  attendantName: string;
  attendantBadge: string;
  totalAmount: number;
  totalVolumeLiters: number;
  transactionCount: number;
}

export interface FuelCostSalesRow {
  fuelGradeId: string;
  fuelGradeName: string;
  totalAmount: number;
  totalVolumeLiters: number;
  averageCostPerLiter: number | null;
  fuelCost: number | null;
  netIncome: number | null;
  transactionCount: number;
}

export interface FuelCostSalesBucket extends SalesReportBucket {
  fuelCost: number | null;
  netIncome: number | null;
}

export interface FuelCostSalesReport {
  rows: FuelCostSalesRow[];
  buckets: FuelCostSalesBucket[];
  totalAmount: number;
  fuelCost: number | null;
  netIncome: number | null;
  totalVolumeLiters: number;
  transactionCount: number;
  fuelGradesMissingCost: string[];
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function buildFuelSalesBreakdown(
  fuelGrades: readonly Pick<FuelGrade, "id" | "name">[],
  transactions: readonly Transaction[]
): FuelSalesBreakdownRow[] {
  const rows = new Map<
    string,
    FuelSalesBreakdownRow & {
      totalAmountCents: number;
      totalVolumeMilliliters: number;
    }
  >();

  for (const fuelGrade of fuelGrades) {
    rows.set(fuelGrade.id, {
      fuelGradeId: fuelGrade.id,
      fuelGradeName: fuelGrade.name,
      totalAmount: 0,
      totalVolumeLiters: 0,
      transactionCount: 0,
      totalAmountCents: 0,
      totalVolumeMilliliters: 0,
    });
  }

  for (const transaction of transactions) {
    if (transaction.status !== "completed") continue;

    let row = rows.get(transaction.fuelGradeId);
    if (!row) {
      row = {
        fuelGradeId: transaction.fuelGradeId,
        fuelGradeName: transaction.fuelGradeName,
        totalAmount: 0,
        totalVolumeLiters: 0,
        transactionCount: 0,
        totalAmountCents: 0,
        totalVolumeMilliliters: 0,
      };
      rows.set(transaction.fuelGradeId, row);
    } else if (row.transactionCount === 0) {
      row.fuelGradeName = transaction.fuelGradeName;
    }

    row.totalAmountCents += Math.round(transaction.totalAmount * 100);
    row.totalVolumeMilliliters += Math.round(
      transaction.volumeLiters * 1000
    );
    row.transactionCount += 1;
  }

  return Array.from(rows.values(), (row) => ({
    fuelGradeId: row.fuelGradeId,
    fuelGradeName: row.fuelGradeName,
    totalAmount: row.totalAmountCents / 100,
    totalVolumeLiters: row.totalVolumeMilliliters / 1000,
    transactionCount: row.transactionCount,
  }));
}

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTransactionDateKey(
  transaction: Pick<Transaction, "saleDate">,
  fallbackDateKey: string
): string | null {
  const dateKey = transaction.saleDate ?? fallbackDateKey;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(year, month - 1, day);

  return parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
    ? dateKey
    : null;
}

export function buildFuelCostReport(
  fuelBatches: readonly FuelBatch[],
  transactions: readonly Transaction[],
  period: SalesReportPeriod,
  reportDate: Date,
  fallbackDateKey: string
): FuelCostSalesReport {
  const salesReport = buildSalesReport(
    transactions,
    period,
    reportDate,
    fallbackDateKey
  );
  type CostLayer = {
    remainingMilliliters: number;
    costPerLiterCents: number | null;
  };
  type CostEvent =
    | {
        type: "delivery";
        dateKey: string;
        fuelGradeId: string;
        batchId: string;
        litersMilliliters: number;
        costPerLiterCents: number | null;
      }
    | { type: "sale"; dateKey: string; transaction: Transaction };

  const costEvents: CostEvent[] = [];
  for (const batch of fuelBatches) {
    const dateKey =
      typeof batch.receivedAt === "string"
        ? getTransactionDateKey(
            { saleDate: batch.receivedAt },
            fallbackDateKey
          )
        : null;
    const litersMilliliters = Math.round(batch.liters * 1000);
    if (
      !dateKey ||
      !Number.isFinite(litersMilliliters) ||
      litersMilliliters <= 0
    ) {
      continue;
    }

    const costPerLiter = getFuelBatchCostPerLiter(batch);
    costEvents.push({
      type: "delivery",
      dateKey,
      fuelGradeId: batch.fuelGradeId,
      batchId: batch.id,
      litersMilliliters,
      costPerLiterCents:
        costPerLiter === undefined ? null : Math.round(costPerLiter * 100),
    });
  }
  for (const transaction of transactions) {
    if (transaction.status !== "completed") continue;
    const dateKey = getTransactionDateKey(transaction, fallbackDateKey);
    if (dateKey) costEvents.push({ type: "sale", dateKey, transaction });
  }
  costEvents.sort((left, right) => {
    const dateOrder = left.dateKey.localeCompare(right.dateKey);
    if (dateOrder !== 0) return dateOrder;
    if (left.type !== right.type) return left.type === "delivery" ? -1 : 1;
    if (left.type === "delivery" && right.type === "delivery") {
      return left.batchId.localeCompare(right.batchId);
    }
    if (left.type === "sale" && right.type === "sale") {
      const timeOrder = (left.transaction.timestamp ?? "").localeCompare(
        right.transaction.timestamp ?? ""
      );
      return timeOrder || left.transaction.id.localeCompare(right.transaction.id);
    }
    return 0;
  });

  const inventory = new Map<string, CostLayer[]>();
  const costByTransaction = new Map<Transaction, number | null>();
  for (const event of costEvents) {
    if (event.type === "delivery") {
      const layers = inventory.get(event.fuelGradeId) ?? [];
      layers.push({
        remainingMilliliters: event.litersMilliliters,
        costPerLiterCents: event.costPerLiterCents,
      });
      inventory.set(event.fuelGradeId, layers);
      continue;
    }

    const volumeMilliliters = Math.round(event.transaction.volumeLiters * 1000);
    if (!Number.isFinite(volumeMilliliters) || volumeMilliliters <= 0) {
      costByTransaction.set(event.transaction, null);
      continue;
    }
    const layers = inventory.get(event.transaction.fuelGradeId) ?? [];
    let remainingMilliliters = volumeMilliliters;
    let costCentsTimesMilliliters = 0;
    let hasMissingCost = false;

    for (const layer of layers) {
      if (remainingMilliliters <= 0) break;
      const usedMilliliters = Math.min(
        layer.remainingMilliliters,
        remainingMilliliters
      );
      if (layer.costPerLiterCents === null) {
        hasMissingCost = true;
      } else {
        costCentsTimesMilliliters +=
          usedMilliliters * layer.costPerLiterCents;
      }
      layer.remainingMilliliters -= usedMilliliters;
      remainingMilliliters -= usedMilliliters;
    }

    if (remainingMilliliters > 0) hasMissingCost = true;
    costByTransaction.set(
      event.transaction,
      hasMissingCost ? null : Math.round(costCentsTimesMilliliters / 1000)
    );
  }

  const rowTotals = new Map<
    string,
    {
      fuelGradeId: string;
      fuelGradeName: string;
      totalAmountCents: number;
      totalVolumeMilliliters: number;
      fuelCostCents: number;
      hasMissingCost: boolean;
      transactionCount: number;
    }
  >();
  const bucketCosts = new Map<
    string,
    { fuelCostCents: number; hasMissingCost: boolean }
  >();
  for (const bucket of salesReport.buckets) {
    bucketCosts.set(bucket.dateKey, { fuelCostCents: 0, hasMissingCost: false });
  }

  for (const transaction of transactions) {
    if (transaction.status !== "completed") continue;
    const dateKey = getTransactionDateKey(transaction, fallbackDateKey);
    if (!dateKey) continue;
    const bucket =
      period === "month"
        ? bucketCosts.get(dateKey)
        : bucketCosts.get(`${dateKey.slice(0, 7)}-01`);
    if (!bucket) continue;

    const totalAmountCents = Math.round(transaction.totalAmount * 100);
    const totalVolumeMilliliters = Math.round(transaction.volumeLiters * 1000);
    const row = rowTotals.get(transaction.fuelGradeId) ?? {
      fuelGradeId: transaction.fuelGradeId,
      fuelGradeName: transaction.fuelGradeName,
      totalAmountCents: 0,
      totalVolumeMilliliters: 0,
      fuelCostCents: 0,
      hasMissingCost: false,
      transactionCount: 0,
    };
    row.totalAmountCents += totalAmountCents;
    row.totalVolumeMilliliters += totalVolumeMilliliters;
    row.transactionCount += 1;

    const costCents = costByTransaction.get(transaction);
    if (costCents === null || costCents === undefined) {
      row.hasMissingCost = true;
      bucket.hasMissingCost = true;
    } else {
      row.fuelCostCents += costCents;
      bucket.fuelCostCents += costCents;
    }
    rowTotals.set(transaction.fuelGradeId, row);
  }

  const reportBuckets = salesReport.buckets.map((salesBucket) => {
    const bucket = bucketCosts.get(salesBucket.dateKey)!;
    const fuelCost = bucket.hasMissingCost
      ? null
      : bucket.fuelCostCents / 100;
    return {
      ...salesBucket,
      fuelCost,
      netIncome:
        fuelCost === null
          ? null
          : (Math.round(salesBucket.totalAmount * 100) -
              bucket.fuelCostCents) /
            100,
    };
  });
  const reportRows = Array.from(rowTotals.values(), (row) => {
    const fuelCostCents = row.hasMissingCost ? null : row.fuelCostCents;
    return {
      fuelGradeId: row.fuelGradeId,
      fuelGradeName: row.fuelGradeName,
      totalAmount: row.totalAmountCents / 100,
      totalVolumeLiters: row.totalVolumeMilliliters / 1000,
      averageCostPerLiter:
        fuelCostCents === null || row.totalVolumeMilliliters <= 0
          ? null
          : Math.round((fuelCostCents / row.totalVolumeMilliliters) * 1000) /
            100,
      fuelCost: fuelCostCents === null ? null : fuelCostCents / 100,
      netIncome:
        fuelCostCents === null
          ? null
          : (row.totalAmountCents - fuelCostCents) / 100,
      transactionCount: row.transactionCount,
    };
  });
  const fuelGradesMissingCost = reportRows
    .filter((row) => row.fuelCost === null)
    .map((row) => row.fuelGradeName);
  const totalAmountCents = Math.round(salesReport.totalAmount * 100);
  const totalVolumeMilliliters = Math.round(
    salesReport.totalVolumeLiters * 1000
  );
  const hasMissingPeriodCost = reportBuckets.some(
    (bucket) => bucket.fuelCost === null
  );
  const fuelCostCents = hasMissingPeriodCost
    ? null
    : reportBuckets.reduce(
        (total, bucket) =>
          total + Math.round((bucket.fuelCost ?? 0) * 100),
        0
      );

  return {
    rows: reportRows,
    buckets: reportBuckets,
    totalAmount: totalAmountCents / 100,
    fuelCost: fuelCostCents === null ? null : fuelCostCents / 100,
    netIncome:
      fuelCostCents === null
        ? null
        : (totalAmountCents - fuelCostCents) / 100,
    totalVolumeLiters: totalVolumeMilliliters / 1000,
    transactionCount: salesReport.transactionCount,
    fuelGradesMissingCost,
  };
}

export function buildAttendantSalesRanking(
  attendants: readonly { id: string; name: string; badgeId: string }[],
  transactions: readonly Transaction[],
  period: AttendantRankingPeriod,
  reportDate: Date,
  fallbackDateKey: string
): AttendantSalesRankingRow[] {
  const rows = new Map<string, Omit<AttendantSalesRankingRow, "rank"> & {
    totalAmountCents: number;
    volumeMilliliters: number;
  }>();
  const nameByBadge = new Map(
    attendants.map((attendant) => [attendant.badgeId.toUpperCase(), attendant])
  );

  for (const transaction of transactions) {
    if (transaction.status !== "completed") continue;
    const dateKey = getTransactionDateKey(transaction, fallbackDateKey);
    if (!dateKey) continue;

    const [year, month, day] = dateKey.split("-").map(Number);
    const matchesPeriod =
      period === "year"
        ? year === reportDate.getFullYear()
        : period === "month"
          ? year === reportDate.getFullYear() && month === reportDate.getMonth() + 1
          : dateKey === fallbackDateKey;
    if (!matchesPeriod) continue;

    const badge = transaction.attendantBadge.toUpperCase();
    const attendant = nameByBadge.get(badge);
    const current = rows.get(badge) ?? {
      attendantId: attendant?.id ?? badge,
      attendantName: attendant?.name ?? transaction.attendantName,
      attendantBadge: transaction.attendantBadge,
      totalAmount: 0,
      totalAmountCents: 0,
      totalVolumeLiters: 0,
      volumeMilliliters: 0,
      transactionCount: 0,
    };
    current.totalAmountCents += Math.round(transaction.totalAmount * 100);
    current.volumeMilliliters += Math.round(transaction.volumeLiters * 1000);
    current.transactionCount += 1;
    rows.set(badge, current);
  }

  return Array.from(rows.values(), (row) => ({
    ...row,
    rank: 0,
    totalAmount: row.totalAmountCents / 100,
    totalVolumeLiters: row.volumeMilliliters / 1000,
  }))
    .sort((left, right) =>
      right.totalAmount - left.totalAmount ||
      right.transactionCount - left.transactionCount ||
      left.attendantName.localeCompare(right.attendantName)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function buildSalesReport(
  transactions: readonly Transaction[],
  period: SalesReportPeriod,
  reportDate: Date,
  fallbackDateKey: string
): SalesReport {
  const year = reportDate.getFullYear();
  const month = reportDate.getMonth();
  const bucketCount =
    period === "month" ? new Date(year, month + 1, 0).getDate() : 12;

  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketMonth = period === "month" ? month : index;
    const bucketDay = period === "month" ? index + 1 : 1;
    const dateKey = [
      year.toString().padStart(4, "0"),
      (bucketMonth + 1).toString().padStart(2, "0"),
      bucketDay.toString().padStart(2, "0"),
    ].join("-");

    return {
      label:
        period === "month"
          ? bucketDay.toString()
          : MONTH_LABELS[bucketMonth],
      dateKey,
      totalAmountCents: 0,
      volumeMilliliters: 0,
      transactionCount: 0,
    };
  });

  for (const transaction of transactions) {
    if (transaction.status !== "completed") continue;

    const transactionDateKey = getTransactionDateKey(
      transaction,
      fallbackDateKey
    );
    if (!transactionDateKey) continue;

    const [transactionYear, transactionMonth, transactionDay] =
      transactionDateKey.split("-").map(Number);
    if (
      transactionYear !== year ||
      (period === "month" && transactionMonth !== month + 1)
    ) {
      continue;
    }

    const bucketIndex = period === "month" ? transactionDay - 1 : transactionMonth - 1;
    const bucket = buckets[bucketIndex];
    if (!bucket) continue;

    bucket.totalAmountCents += Math.round(transaction.totalAmount * 100);
    bucket.volumeMilliliters += Math.round(transaction.volumeLiters * 1000);
    bucket.transactionCount += 1;
  }

  const reportBuckets = buckets.map(
    ({ totalAmountCents, volumeMilliliters, ...bucket }) => ({
      ...bucket,
      totalAmount: totalAmountCents / 100,
      volumeLiters: volumeMilliliters / 1000,
    })
  );
  const totalAmountCents = buckets.reduce(
    (total, bucket) => total + bucket.totalAmountCents,
    0
  );
  const totalVolumeMilliliters = buckets.reduce(
    (total, bucket) => total + bucket.volumeMilliliters,
    0
  );
  const transactionCount = buckets.reduce(
    (total, bucket) => total + bucket.transactionCount,
    0
  );

  return {
    buckets: reportBuckets,
    totalAmount: totalAmountCents / 100,
    totalVolumeLiters: totalVolumeMilliliters / 1000,
    transactionCount,
    averageSale: transactionCount
      ? totalAmountCents / 100 / transactionCount
      : 0,
    peakBucketAmount: Math.max(
      ...reportBuckets.map((bucket) => bucket.totalAmount),
      0
    ),
  };
}
