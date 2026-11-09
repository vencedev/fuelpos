import type { FuelBatch, FuelGrade } from "../types/pos";

type FuelBatchDetails = Pick<
  FuelBatch,
  "liters" | "receivedAt" | "costPerLiter"
>;

export function validateDeliveryBatch(batch: FuelBatchDetails): string | null {
  if (!Number.isFinite(batch.liters) || batch.liters <= 0) {
    return "Enter a batch quantity greater than 0 liters.";
  }
  const receivedDate =
    typeof batch.receivedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(batch.receivedAt)
      ? new Date(`${batch.receivedAt}T00:00:00.000Z`)
      : null;
  if (
    !receivedDate ||
    Number.isNaN(receivedDate.getTime()) ||
    receivedDate.toISOString().slice(0, 10) !== batch.receivedAt
  ) {
    return "Enter a valid delivery date.";
  }
  if (
    typeof batch.costPerLiter !== "number" ||
    !Number.isFinite(batch.costPerLiter) ||
    batch.costPerLiter <= 0
  ) {
    return "Enter a cost per liter greater than zero.";
  }
  return null;
}

export function getFuelBatchCostPerLiter(
  batch: Pick<FuelBatch, "liters" | "costPerLiter" | "totalPurchaseCost">
): number | undefined {
  if (batch.costPerLiter !== undefined) {
    return Number.isFinite(batch.costPerLiter) && batch.costPerLiter > 0
      ? batch.costPerLiter
      : undefined;
  }

  if (
    !Number.isFinite(batch.liters) ||
    batch.liters <= 0 ||
    typeof batch.totalPurchaseCost !== "number" ||
    !Number.isFinite(batch.totalPurchaseCost) ||
    batch.totalPurchaseCost <= 0
  ) {
    return undefined;
  }

  return batch.totalPurchaseCost / batch.liters;
}

function adjustTankStock(grade: FuelGrade, litersDelta: number): FuelGrade {
  if (
    !Number.isFinite(grade.tankCapacityLiters) ||
    grade.tankCapacityLiters <= 0 ||
    !Number.isFinite(grade.remainingLiters) ||
    !Number.isFinite(litersDelta)
  ) {
    throw new RangeError("Tank stock and capacity must be valid numbers.");
  }

  const remainingLiters = grade.remainingLiters + litersDelta;
  if (remainingLiters < 0) {
    throw new RangeError(
      "Cannot remove this batch because current tank stock is lower than its recorded liters."
    );
  }
  if (remainingLiters > grade.tankCapacityLiters) {
    throw new RangeError("Batch exceeds the remaining tank capacity.");
  }

  return {
    ...grade,
    remainingLiters,
    tankLevelPercent: Math.round(
      (remainingLiters / grade.tankCapacityLiters) * 100
    ),
  };
}

export function editDeliveryBatch(
  grade: FuelGrade,
  batches: FuelBatch[],
  updatedBatch: FuelBatch
): { fuelGrade: FuelGrade; fuelBatches: FuelBatch[] } {
  const currentBatch = batches.find((batch) => batch.id === updatedBatch.id);
  if (!currentBatch || currentBatch.fuelGradeId !== grade.id) {
    throw new RangeError("The selected delivery batch no longer exists.");
  }
  if (updatedBatch.fuelGradeId !== grade.id) {
    throw new RangeError(
      "A delivery batch cannot be moved to another fuel grade."
    );
  }

  const validationError = validateDeliveryBatch(updatedBatch);
  if (validationError) throw new RangeError(validationError);

  const litersDelta = updatedBatch.liters - currentBatch.liters;
  const fuelGrade =
    litersDelta > 0
      ? addDeliveryToFuelGrade(grade, litersDelta)
      : adjustTankStock(grade, litersDelta);
  const savedBatch = { ...updatedBatch };
  delete savedBatch.totalPurchaseCost;

  return {
    fuelGrade,
    fuelBatches: batches.map((batch) =>
      batch.id === currentBatch.id ? savedBatch : batch
    ),
  };
}

export function deleteDeliveryBatch(
  grade: FuelGrade,
  batches: FuelBatch[],
  batchId: string
): { fuelGrade: FuelGrade; fuelBatches: FuelBatch[] } {
  const batch = batches.find((item) => item.id === batchId);
  if (!batch || batch.fuelGradeId !== grade.id) {
    throw new RangeError("The selected delivery batch no longer exists.");
  }

  return {
    fuelGrade: adjustTankStock(grade, -batch.liters),
    fuelBatches: batches.filter((item) => item.id !== batchId),
  };
}

export function createFuelGradeId(code: string, existingIds: string[]): string {
  const slug = code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const baseId = `fuel-${slug || "grade"}`;
  let candidateId = baseId;
  let suffix = 2;

  while (existingIds.includes(candidateId)) {
    candidateId = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return candidateId;
}

export function addDeliveryToFuelGrade(
  grade: FuelGrade,
  deliveredLiters: number
): FuelGrade {
  if (!Number.isFinite(deliveredLiters) || deliveredLiters <= 0) {
    throw new RangeError("Enter a batch quantity greater than 0 liters.");
  }

  if (!Number.isFinite(grade.tankCapacityLiters) || grade.tankCapacityLiters <= 0) {
    throw new RangeError("Tank capacity must be greater than 0 liters.");
  }

  const availableCapacity = grade.tankCapacityLiters - grade.remainingLiters;
  if (deliveredLiters > availableCapacity) {
    throw new RangeError("Batch exceeds the remaining tank capacity.");
  }

  return adjustTankStock(grade, deliveredLiters);
}
