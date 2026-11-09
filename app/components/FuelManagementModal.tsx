"use client";

import React, { FormEvent, useEffect, useRef, useState, useId } from "react";
import {
  FuelBatch,
  FuelGrade,
  NewFuelBatch,
  NewFuelGrade,
} from "../types/pos";
import {
  getFuelBatchCostPerLiter,
  validateDeliveryBatch,
} from "../lib/fuelManagement";
import { isTopmostDialog } from "../lib/modalStack";
import { XIcon } from "./Icons";

const fuelColors = [
  {
    name: "Amber",
    color: "#f59e0b",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    badgeBorder: "border-amber-500",
  },
  {
    name: "Emerald",
    color: "#10b981",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    badgeBorder: "border-emerald-500",
  },
  {
    name: "Red",
    color: "#ef4444",
    badgeBg: "bg-red-500/10 text-red-400 border-red-500/30",
    badgeBorder: "border-red-500",
  },
  {
    name: "Cyan",
    color: "#06b6d4",
    badgeBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    badgeBorder: "border-cyan-500",
  },
  {
    name: "Blue",
    color: "#3b82f6",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500",
    badgeBorder: "border-blue-500",
  },
];

type FuelAction = "details" | "stock" | "delivery" | "price" | "delete";

interface AddFuelGradeModalProps {
  fuelGrades: FuelGrade[];
  onAddFuelGrade: (grade: NewFuelGrade) => string | null;
  onClose: () => void;
}

interface FuelManagementModalProps {
  fuelGrade: FuelGrade;
  fuelBatches: FuelBatch[];
  onAddFuelBatch: (batch: NewFuelBatch) => string | null;
  onUpdateFuelBatch: (batch: FuelBatch) => string | null;
  onDeleteFuelBatch: (batchId: string) => string | null;
  onUpdateFuelPrice: (gradeId: string, price: number) => string | null;
  onUpdateFuelDetails: (grade: FuelGrade) => string | null;
  onDeleteFuelGrade: (gradeId: string) => string | null;
  onClose: () => void;
}

function localDateValue(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatCurrency(value: number): string {
  const [whole, fraction] = value.toFixed(2).split(".");
  return `₱${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
}

function formatBatchCostPerLiter(batch: FuelBatch): string {
  const costPerLiter = getFuelBatchCostPerLiter(batch);
  return costPerLiter === undefined
    ? "Not recorded"
    : `${formatCurrency(costPerLiter)} / L`;
}

function formatNumber(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function ModalDialog({
  title,
  description,
  onClose,
  children,
  dialogClassName = "max-w-3xl",
  dialogId,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  dialogClassName?: string;
  dialogId?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !isTopmostDialog(
          dialog,
          document.querySelectorAll<HTMLElement>('[role="dialog"]')
        )
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 shadow-2xl ${dialogClassName}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-white">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs text-zinc-400">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            data-dialog-initial-focus
            className="rounded p-1 text-zinc-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function AddFuelGradeModal({
  fuelGrades,
  onAddFuelGrade,
  onClose,
}: AddFuelGradeModalProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [fuelName, setFuelName] = useState("");
  const [fuelCode, setFuelCode] = useState("");
  const [fuelRating, setFuelRating] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");
  const [tankCapacity, setTankCapacity] = useState("");
  const [fuelColor, setFuelColor] = useState(fuelColors[0].name);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const name = fuelName.trim();
    const code = fuelCode.trim().toUpperCase();
    const price = Number(fuelPrice);
    const capacity = Number(tankCapacity);

    if (!name || !code) {
      setErrorMessage("Enter a fuel name and code.");
      return;
    }
    if (!/^[A-Z0-9-]+$/.test(code)) {
      setErrorMessage("Use only letters, numbers, and hyphens in the fuel code.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setErrorMessage("Enter a starting price greater than zero.");
      return;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setErrorMessage("Enter a tank capacity greater than zero liters.");
      return;
    }

    const duplicateFuel = fuelGrades.some(
      (grade) =>
        grade.name.trim().toLowerCase() === name.toLowerCase() ||
        grade.code.trim().toLowerCase() === code.toLowerCase()
    );
    if (duplicateFuel) {
      setErrorMessage("Fuel name and code must be unique.");
      return;
    }

    const selectedColor =
      fuelColors.find((color) => color.name === fuelColor) ?? fuelColors[0];
    const error = onAddFuelGrade({
      name,
      code,
      octaneOrCetane: fuelRating.trim() || "Not specified",
      pricePerLiter: price,
      tankCapacityLiters: capacity,
      color: selectedColor.color,
      badgeBg: selectedColor.badgeBg,
      badgeBorder: selectedColor.badgeBorder,
    });

    if (error) {
      setErrorMessage(error);
      return;
    }
    onClose();
  };

  return (
    <ModalDialog
      title="Add fuel"
      description="Create a fuel grade with its price and tank capacity."
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="overflow-y-auto px-5 py-5 sm:px-6"
      >
        {errorMessage && (
          <p className="mb-4 text-sm text-rose-300" role="alert">
            {errorMessage}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fuel-name" className="mb-1 block text-xs text-zinc-300">
              Fuel name
            </label>
            <input
              id="fuel-name"
              required
              value={fuelName}
              onChange={(event) => setFuelName(event.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="fuel-code" className="mb-1 block text-xs text-zinc-300">
              Fuel code
            </label>
            <input
              id="fuel-code"
              required
              value={fuelCode}
              onChange={(event) => setFuelCode(event.target.value.toUpperCase())}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm uppercase text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="fuel-rating" className="mb-1 block text-xs text-zinc-300">
              Octane / cetane
            </label>
            <input
              id="fuel-rating"
              value={fuelRating}
              onChange={(event) => setFuelRating(event.target.value)}
              placeholder="Optional"
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="fuel-start-price"
              className="mb-1 block text-xs text-zinc-300"
            >
              Starting price per liter
            </label>
            <input
              id="fuel-start-price"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={fuelPrice}
              onChange={(event) => setFuelPrice(event.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="fuel-capacity"
              className="mb-1 block text-xs text-zinc-300"
            >
              Tank capacity (liters)
            </label>
            <input
              id="fuel-capacity"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={tankCapacity}
              onChange={(event) => setTankCapacity(event.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="fuel-color" className="mb-1 block text-xs text-zinc-300">
              Display color
            </label>
            <select
              id="fuel-color"
              value={fuelColor}
              onChange={(event) => setFuelColor(event.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
            >
              {fuelColors.map((color) => (
                <option key={color.name} value={color.name}>
                  {color.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          The new grade starts with 0 liters in its tank.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
          >
            Add fuel
          </button>
        </div>
      </form>
      </ModalDialog>
  );
}

const actions: Array<{ id: FuelAction; label: string }> = [
  { id: "details", label: "Edit details" },
  { id: "price", label: "Edit price" },
  { id: "stock", label: "Stock & batches" },
  { id: "delivery", label: "Record delivery" },
  { id: "delete", label: "Delete fuel" },
];

export function FuelManagementModal({
  fuelGrade,
  fuelBatches,
  onAddFuelBatch,
  onUpdateFuelBatch,
  onDeleteFuelBatch,
  onUpdateFuelPrice,
  onUpdateFuelDetails,
  onDeleteFuelGrade,
  onClose,
}: FuelManagementModalProps) {
  const [activeAction, setActiveAction] = useState<FuelAction>("price");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [batchLiters, setBatchLiters] = useState("");
  const [batchDate, setBatchDate] = useState(localDateValue);
  const [batchSupplier, setBatchSupplier] = useState("");
  const [batchCostPerLiter, setBatchCostPerLiter] = useState("");
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editBatchLiters, setEditBatchLiters] = useState("");
  const [editBatchDate, setEditBatchDate] = useState("");
  const [editBatchSupplier, setEditBatchSupplier] = useState("");
  const [editBatchCostPerLiter, setEditBatchCostPerLiter] = useState("");
  const [confirmBatchDeleteId, setConfirmBatchDeleteId] = useState<
    string | null
  >(null);
  const [priceDraft, setPriceDraft] = useState(
    fuelGrade.pricePerLiter.toFixed(2)
  );
  const [detailsName, setDetailsName] = useState(fuelGrade.name);
  const [detailsCode, setDetailsCode] = useState(fuelGrade.code);
  const [detailsRating, setDetailsRating] = useState(fuelGrade.octaneOrCetane);
  const [detailsCapacity, setDetailsCapacity] = useState(fuelGrade.tankCapacityLiters.toString());
  const [detailsColor, setDetailsColor] = useState(fuelGrade.color);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const gradeBatches = [...fuelBatches]
    .filter((batch) => batch.fuelGradeId === fuelGrade.id)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const editingBatch = gradeBatches.find(
    (batch) => batch.id === editingBatchId
  );

  const changeAction = (action: FuelAction) => {
    setActiveAction(action);
    setErrorMessage("");
    setSuccessMessage("");
    setConfirmDelete(false);
    setEditingBatchId(null);
    setConfirmBatchDeleteId(null);
  };

  const startEditingBatch = (batch: FuelBatch) => {
    setErrorMessage("");
    setSuccessMessage("");
    setConfirmBatchDeleteId(null);
    setEditingBatchId(batch.id);
    setEditBatchLiters(batch.liters.toString());
    setEditBatchDate(batch.receivedAt);
    setEditBatchSupplier(batch.supplier ?? "");
    setEditBatchCostPerLiter(
      getFuelBatchCostPerLiter(batch)?.toString() ?? ""
    );
  };

  const handleUpdateBatch = (
    event: FormEvent<HTMLFormElement>,
    batch: FuelBatch
  ) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const updatedBatch = {
      ...batch,
      liters: Number(editBatchLiters),
      receivedAt: editBatchDate,
      supplier: editBatchSupplier.trim() || undefined,
      costPerLiter:
        editBatchCostPerLiter.trim() === ""
          ? undefined
          : Number(editBatchCostPerLiter),
      totalPurchaseCost: undefined,
    };
    const validationError = validateDeliveryBatch(updatedBatch);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const error = onUpdateFuelBatch(updatedBatch);
    if (error) {
      setErrorMessage(error);
      return;
    }

    setEditingBatchId(null);
    setSuccessMessage("Delivery batch updated.");
  };

  const handleDeleteBatch = (batchId: string) => {
    setErrorMessage("");
    setSuccessMessage("");
    const error = onDeleteFuelBatch(batchId);
    if (error) {
      setErrorMessage(error);
      return;
    }

    setConfirmBatchDeleteId(null);
    setSuccessMessage("Delivery batch deleted and tank stock adjusted.");
  };

  const handleAddBatch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const liters = Number(batchLiters);
    if (!Number.isFinite(liters) || liters <= 0) {
      setErrorMessage("Enter a delivery quantity greater than zero liters.");
      return;
    }
    if (liters > fuelGrade.tankCapacityLiters - fuelGrade.remainingLiters) {
      setErrorMessage(
        `This delivery exceeds the ${formatNumber(
          fuelGrade.tankCapacityLiters - fuelGrade.remainingLiters
        )} L of remaining tank capacity.`
      );
      return;
    }
    if (!batchDate) {
      setErrorMessage("Enter the delivery date.");
      return;
    }

    const costPerLiter = Number(batchCostPerLiter);
    const validationError = validateDeliveryBatch({
      liters,
      receivedAt: batchDate,
      costPerLiter,
    });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    const error = onAddFuelBatch({
      fuelGradeId: fuelGrade.id,
      liters,
      receivedAt: batchDate,
      supplier: batchSupplier.trim() || undefined,
      costPerLiter,
    });
    if (error) {
      setErrorMessage(error);
      return;
    }

    setBatchLiters("");
    setBatchSupplier("");
    setBatchCostPerLiter("");
    setSuccessMessage(
      `${formatNumber(liters)} L was added to ${fuelGrade.name} tank stock.`
    );
    setActiveAction("stock");
  };

  const handleSavePrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const price = Number(priceDraft);
    if (!Number.isFinite(price) || price <= 0) {
      setErrorMessage("Enter a price greater than zero.");
      return;
    }

    const error = onUpdateFuelPrice(fuelGrade.id, price);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setSuccessMessage("Fuel price saved.");
  };

  const handleSaveDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const name = detailsName.trim();
    const code = detailsCode.trim().toUpperCase();
    const rating = detailsRating.trim();
    const capacity = Number(detailsCapacity);
    if (!name || !code || !rating) {
      setErrorMessage("Enter a fuel name, code, and rating.");
      return;
    }
    if (!/^[A-Z0-9-]+$/.test(code)) {
      setErrorMessage("Use letters, numbers, and hyphens in the fuel code.");
      return;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setErrorMessage("Enter a tank capacity greater than zero.");
      return;
    }
    if (capacity < fuelGrade.remainingLiters) {
      setErrorMessage("Tank capacity cannot be lower than the current stock.");
      return;
    }

    const color = fuelColors.find((item) => item.color === detailsColor) ?? fuelColors[0];
    const updatedGrade: FuelGrade = {
      ...fuelGrade,
      name,
      code,
      octaneOrCetane: rating,
      tankCapacityLiters: capacity,
      tankLevelPercent: Math.round((fuelGrade.remainingLiters / capacity) * 100),
      color: color.color,
      badgeBg: color.badgeBg,
      badgeBorder: color.badgeBorder,
    };
    const error = onUpdateFuelDetails(updatedGrade);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setSuccessMessage("Fuel details saved.");
  };

  const handleDelete = () => {
    const error = onDeleteFuelGrade(fuelGrade.id);
    if (error) {
      setErrorMessage(error);
      return;
    }
    onClose();
  };

  return (
    <>
      <ModalDialog
        title={`Manage ${fuelGrade.name}`}
        description="Update tank stock and price, or remove this fuel grade."
        onClose={onClose}
      >
      <nav
        aria-label={`${fuelGrade.name} actions`}
        className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-4 py-2 sm:px-6"
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            aria-current={activeAction === action.id ? "page" : undefined}
            onClick={() => changeAction(action.id)}
            className={`shrink-0 rounded px-3 py-2 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
              activeAction === action.id
                ? action.id === "delete"
                  ? "bg-rose-950 text-rose-200"
                  : "bg-zinc-800 text-white"
                : action.id === "delete"
                  ? "text-rose-300 hover:bg-rose-950/50"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
            }`}
          >
            {action.label}
          </button>
        ))}
      </nav>

      <div className="overflow-y-auto px-5 py-5 sm:px-6">
        {errorMessage && (
          <p className="mb-4 text-sm text-rose-300" role="alert">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p className="mb-4 text-sm text-emerald-300" role="status">
            {successMessage}
          </p>
        )}

        {activeAction === "stock" && (
          <section aria-labelledby="fuel-stock-heading" className="space-y-5">
            <div>
              <h3 id="fuel-stock-heading" className="text-sm font-semibold text-white">
                Current tank stock
              </h3>
              <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-zinc-400">Tank level</span>
                  <span className="tabular-nums text-zinc-200">
                    {formatNumber(fuelGrade.remainingLiters)} /{" "}
                    {formatNumber(fuelGrade.tankCapacityLiters)} L (
                    {fuelGrade.tankLevelPercent}%)
                  </span>
                </div>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800"
                  role="progressbar"
                  aria-label={`${fuelGrade.name} tank level`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fuelGrade.tankLevelPercent}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${fuelGrade.tankLevelPercent}%`,
                      backgroundColor: fuelGrade.color,
                    }}
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">Delivery batches</h3>
              {gradeBatches.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-400">
                  No deliveries recorded for {fuelGrade.name}.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[42rem] text-left text-xs">
                    <thead>
                      <tr className="border-b border-zinc-700 text-zinc-400">
                        <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Liters</th>
                        <th scope="col" className="px-3 py-2 font-medium">Supplier</th>
                        <th scope="col" className="py-2 pl-3 text-right font-medium">Cost / L</th>
                        <th scope="col" className="py-2 pl-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {gradeBatches.map((batch) => (
                        <React.Fragment key={batch.id}>
                          <tr>
                            <td className="py-3 pr-3 tabular-nums text-zinc-300">
                              {batch.receivedAt}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-zinc-200">
                              {formatNumber(batch.liters)} L
                            </td>
                            <td className="px-3 py-3 text-zinc-400">
                              {batch.supplier || "Not recorded"}
                            </td>
                            <td className="py-3 pl-3 text-right tabular-nums text-zinc-300">
                              {formatBatchCostPerLiter(batch)}
                            </td>
                            <td className="py-3 pl-3 text-right">
                              <div className="flex justify-end gap-3">
                                <button
                                  type="button"
                                  aria-label={`Edit delivery batch of ${formatNumber(batch.liters)} liters received on ${batch.receivedAt}`}
                                  aria-haspopup="dialog"
                                  aria-expanded={editingBatchId === batch.id}
                                  aria-controls={`edit-delivery-batch-dialog-${batch.id}`}
                                  onClick={() => startEditingBatch(batch)}
                                  className="text-amber-300 hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete delivery batch of ${formatNumber(batch.liters)} liters received on ${batch.receivedAt}`}
                                  aria-expanded={
                                    confirmBatchDeleteId === batch.id
                                  }
                                  aria-controls={`confirm-delete-batch-${batch.id}`}
                                  onClick={() => {
                                    setErrorMessage("");
                                    setSuccessMessage("");
                                    setEditingBatchId(null);
                                    setConfirmBatchDeleteId(batch.id);
                                  }}
                                  className="text-rose-300 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                          {confirmBatchDeleteId === batch.id && (
                            <tr>
                              <td colSpan={5} className="pb-4">
                                <div
                                  id={`confirm-delete-batch-${batch.id}`}
                                  role="group"
                                  aria-label={`Confirm deleting delivery batch received on ${batch.receivedAt}`}
                                  className="rounded-lg border border-rose-800 bg-rose-950/40 p-4"
                                >
                                  <p className="text-sm text-rose-100">
                                    Delete this {formatNumber(batch.liters)} L
                                    delivery batch? Its liters will be subtracted
                                    from current tank stock. The batch cannot be
                                    deleted if that would make stock negative.
                                  </p>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmBatchDeleteId(null)
                                      }
                                      className="rounded border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
                                    >
                                      Keep batch
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteBatch(batch.id)
                                      }
                                      className="rounded bg-rose-700 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                                    >
                                      Confirm delete
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {activeAction === "delivery" && (
          <form onSubmit={handleAddBatch} className="max-w-2xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Record delivery</h3>
              <p className="mt-1 text-xs text-zinc-400">
                Available tank capacity:{" "}
                {formatNumber(
                  fuelGrade.tankCapacityLiters - fuelGrade.remainingLiters
                )}{" "}
                L for {fuelGrade.name}.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="batch-liters" className="mb-1 block text-xs text-zinc-300">
                  Delivered liters
                </label>
                <input
                  id="batch-liters"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={batchLiters}
                  onChange={(event) => setBatchLiters(event.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="batch-date" className="mb-1 block text-xs text-zinc-300">
                  Delivery date
                </label>
                <input
                  id="batch-date"
                  type="date"
                  required
                  value={batchDate}
                  onChange={(event) => setBatchDate(event.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="batch-supplier" className="mb-1 block text-xs text-zinc-300">
                  Supplier
                </label>
                <input
                  id="batch-supplier"
                  value={batchSupplier}
                  onChange={(event) => setBatchSupplier(event.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="batch-cost" className="mb-1 block text-xs text-zinc-300">
                  Cost per liter (₱/L, required)
                </label>
                <input
                  id="batch-cost"
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={batchCostPerLiter}
                  onChange={(event) =>
                    setBatchCostPerLiter(event.target.value)
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Add to tank stock
            </button>
          </form>
        )}

        {activeAction === "details" && (
          <form onSubmit={handleSaveDetails} className="max-w-xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Edit fuel details</h3>
              <p className="mt-1 text-xs text-zinc-400">Update the fuel identity, rating, tank capacity, and display color.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-300">Fuel name<input required value={detailsName} onChange={(event) => setDetailsName(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-zinc-300">Fuel code<input required value={detailsCode} onChange={(event) => setDetailsCode(event.target.value.toUpperCase())} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm uppercase text-white" /></label>
              <label className="text-xs text-zinc-300">Octane / cetane<input required value={detailsRating} onChange={(event) => setDetailsRating(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label>
              <label className="text-xs text-zinc-300">Tank capacity (L)<input required type="number" min="0.01" step="0.01" value={detailsCapacity} onChange={(event) => setDetailsCapacity(event.target.value)} className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tabular-nums text-white" /></label>
            </div>
            <fieldset>
              <legend className="mb-2 text-xs text-zinc-300">Display color</legend>
              <div className="flex flex-wrap gap-2">
                {fuelColors.map((color) => (
                  <button key={color.color} type="button" aria-label={color.name} aria-pressed={detailsColor === color.color} onClick={() => setDetailsColor(color.color)} className="h-9 w-9 rounded border-2" style={{ backgroundColor: color.color, borderColor: detailsColor === color.color ? "white" : "transparent" }} />
                ))}
              </div>
            </fieldset>
            <button type="submit" className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400">Save fuel details</button>
          </form>
        )}

        {activeAction === "price" && (
          <form onSubmit={handleSavePrice} className="max-w-xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Edit fuel price</h3>
              <p className="mt-1 text-xs text-zinc-400">
                Saved prices update the attendant terminal and pump displays.
              </p>
            </div>
            <div>
              <label
                htmlFor="fuel-price"
                className="mb-1 block text-xs font-medium text-zinc-300"
              >
                {fuelGrade.name}, current {formatCurrency(fuelGrade.pricePerLiter)} / L
              </label>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="text-zinc-400">₱</span>
                <input
                  id="fuel-price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={priceDraft}
                  onChange={(event) => setPriceDraft(event.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tabular-nums text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Save price
            </button>
          </form>
        )}

        {activeAction === "delete" && (
          <section className="max-w-xl space-y-4" aria-labelledby="delete-fuel-heading">
            <div>
              <h3 id="delete-fuel-heading" className="text-sm font-semibold text-white">
                Delete {fuelGrade.name}
              </h3>
              <p className="mt-1 text-sm text-zinc-300">
                This removes the fuel from the price list and deletes its delivery
                history. Completed sales remain in the transaction history.
              </p>
            </div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded border border-rose-700 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
              >
                Delete fuel
              </button>
            ) : (
              <div
                role="group"
                aria-label={`Confirm deleting ${fuelGrade.name}`}
                className="rounded-lg border border-rose-800 bg-rose-950/40 p-4"
              >
                <p className="text-sm text-rose-100">
                  Delete {fuelGrade.name} and its delivery history?
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
                  >
                    Keep fuel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="rounded bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                  >
                    Confirm delete
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
      </ModalDialog>
      {editingBatch && (
        <ModalDialog
          title={`Edit ${fuelGrade.name} delivery`}
          description={`Update the delivery received on ${editingBatch.receivedAt}. Changing liters adjusts current tank stock.`}
          onClose={() => {
            setEditingBatchId(null);
            setErrorMessage("");
          }}
          dialogClassName="max-w-2xl"
          dialogId={`edit-delivery-batch-dialog-${editingBatch.id}`}
        >
          <form
            id={`edit-delivery-batch-${editingBatch.id}`}
            onSubmit={(event) => handleUpdateBatch(event, editingBatch)}
            className="space-y-5 overflow-y-auto px-5 py-5 sm:px-6"
            aria-label={`Edit delivery batch received on ${editingBatch.receivedAt}`}
          >
            {errorMessage && (
              <p className="text-sm text-rose-300" role="alert">
                {errorMessage}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`edit-batch-liters-${editingBatch.id}`}
                  className="mb-1 block text-xs text-zinc-300"
                >
                  Delivered liters
                </label>
                <input
                  id={`edit-batch-liters-${editingBatch.id}`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={editBatchLiters}
                  onChange={(event) => setEditBatchLiters(event.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-batch-date-${editingBatch.id}`}
                  className="mb-1 block text-xs text-zinc-300"
                >
                  Delivery date
                </label>
                <input
                  id={`edit-batch-date-${editingBatch.id}`}
                  type="date"
                  required
                  value={editBatchDate}
                  onChange={(event) => setEditBatchDate(event.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-batch-supplier-${editingBatch.id}`}
                  className="mb-1 block text-xs text-zinc-300"
                >
                  Supplier
                </label>
                <input
                  id={`edit-batch-supplier-${editingBatch.id}`}
                  value={editBatchSupplier}
                  onChange={(event) =>
                    setEditBatchSupplier(event.target.value)
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor={`edit-batch-cost-${editingBatch.id}`}
                  className="mb-1 block text-xs text-zinc-300"
                >
                  Cost per liter (₱/L, required)
                </label>
                <input
                  id={`edit-batch-cost-${editingBatch.id}`}
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={editBatchCostPerLiter}
                  onChange={(event) =>
                    setEditBatchCostPerLiter(event.target.value)
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
              <button
                type="button"
                onClick={() => {
                  setEditingBatchId(null);
                  setErrorMessage("");
                }}
                className="rounded border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                Save batch
              </button>
            </div>
          </form>
        </ModalDialog>
      )}
    </>
  );
}
