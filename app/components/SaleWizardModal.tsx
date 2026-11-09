"use client";

import { useState, useCallback } from "react";
import type {
  FuelGrade,
  AttendantAccount,
  AttendantPermissions,
  Transaction,
} from "../types/pos";
import {
  GasPumpIcon,
  DropletIcon,
  CheckIcon,
  XIcon,
  CashIcon,
  ChevronRightIcon,
} from "./Icons";

// ---------------------------------------------------------------------------
// Pure helpers (module-scope, no side effects)
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  const [intPart, decPart] = value.toFixed(2).split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intFormatted}.${decPart}`;
}

function createTransactionId(index: number): string {
  return `tx-${index + 1009}`;
}

function getShiftReceiptNumber(index: number): string {
  return `FP-2026-${(4129 + index).toString().padStart(6, "0")}`;
}

function getCurrentTimeString(): string {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function getCurrentDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Step indicator (declared outside component to avoid re-creation on render)
// ---------------------------------------------------------------------------

const STEP_LABELS = ["Fuel", "Amount", "Confirm"];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 px-6 pt-5 pb-4">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = currentStep === stepNum;
        const isDone = currentStep > stepNum;
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-px w-10 ${
                  isDone ? "bg-amber-500" : "bg-zinc-700"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition ${
                  isActive
                    ? "bg-amber-500 text-zinc-950"
                    : isDone
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                }`}
              >
                {isDone ? <CheckIcon className="w-3.5 h-3.5" /> : stepNum}
              </div>
              <span
                className={`text-[11px] leading-none ${
                  isActive
                    ? "text-amber-400 font-medium"
                    : isDone
                      ? "text-zinc-400"
                      : "text-zinc-600"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared numpad renderer (used in Step 2 and Step 3)
// ---------------------------------------------------------------------------

function Numpad({
  onKey,
  allowDot,
}: {
  onKey: (key: string) => void;
  allowDot?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          className="rounded-lg bg-zinc-800 border border-zinc-700 py-3 text-lg font-semibold text-zinc-100 tabular-nums transition active:scale-95 hover:bg-zinc-700"
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onKey("clear")}
        className="rounded-lg bg-zinc-800 border border-zinc-700 py-3 text-sm font-semibold text-zinc-400 transition active:scale-95 hover:bg-zinc-700"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={() => onKey("0")}
        className="rounded-lg bg-zinc-800 border border-zinc-700 py-3 text-lg font-semibold text-zinc-100 tabular-nums transition active:scale-95 hover:bg-zinc-700"
      >
        0
      </button>
      {allowDot ? (
        <button
          type="button"
          onClick={() => onKey(".")}
          className="rounded-lg bg-zinc-800 border border-zinc-700 py-3 text-lg font-semibold text-zinc-100 tabular-nums transition active:scale-95 hover:bg-zinc-700"
        >
          .
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onKey("del")}
          className="rounded-lg bg-zinc-800 border border-zinc-700 py-3 text-sm font-semibold text-zinc-400 transition active:scale-95 hover:bg-zinc-700"
        >
          Delete
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SaleWizardModalProps {
  isOpen: boolean;
  fuelGrades: FuelGrade[];
  currentAttendant: AttendantAccount;
  permissions: AttendantPermissions;
  transactionCount: number;
  onCompleteSale: (newTx: Transaction) => void | Promise<void>;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SaleWizardModal({
  isOpen,
  fuelGrades,
  currentAttendant,
  permissions,
  transactionCount,
  onCompleteSale,
  onClose,
}: SaleWizardModalProps) {
  // -- wizard state --
  const [step, setStep] = useState(1);
  const [selectedGrade, setSelectedGrade] = useState<FuelGrade | null>(null);
  const [inputMode, setInputMode] = useState<"amount" | "liters">("amount");
  const [rawInput, setRawInput] = useState("0");
  const [rawTendered, setRawTendered] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // -- derived values --
  const numericValue = parseFloat(rawInput) || 0;
  const pricePerLiter = selectedGrade?.pricePerLiter ?? 1;

  const amount =
    inputMode === "amount" ? numericValue : numericValue * pricePerLiter;
  const liters =
    inputMode === "liters" ? numericValue : numericValue / pricePerLiter;

  const tenderedAmount = parseFloat(rawTendered) || 0;
  const changeAmount = tenderedAmount - amount;

  // -- numpad handler for amount/liters (step 2) --
  const handleNumpad = useCallback(
    (key: string) => {
      if (key === "clear") {
        setRawInput("0");
        return;
      }
      if (key === "del") {
        setRawInput((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
        return;
      }
      if (key === ".") {
        if (inputMode === "amount") return;
        if (rawInput.includes(".")) return;
        setRawInput((prev) => prev + ".");
        return;
      }
      setRawInput((prev) => {
        const next = prev === "0" ? key : prev + key;
        if (next.length > 10) return prev;
        return next;
      });
    },
    [inputMode, rawInput],
  );

  // -- confirm sale --
  const handleConfirm = useCallback(async () => {
    if (!selectedGrade || isSubmitting) return;

    const finalAmount = parseFloat(amount.toFixed(2));
    const finalTendered = tenderedAmount;

    const tx: Transaction = {
      id: createTransactionId(transactionCount),
      receiptNumber: getShiftReceiptNumber(transactionCount),
      timestamp: getCurrentTimeString(),
      saleDate: getCurrentDateString(),
      pumpNumber: 1,
      fuelGradeId: selectedGrade.id,
      fuelGradeName: selectedGrade.name,
      fuelGradeColor: selectedGrade.color,
      pricePerLiter: selectedGrade.pricePerLiter,
      volumeLiters: parseFloat(liters.toFixed(3)),
      totalAmount: finalAmount,
      paymentMethod: "cash",
      attendantName: currentAttendant.name,
      attendantBadge: currentAttendant.badgeId,
      status: "completed",
      tenderedAmount: finalTendered,
      changeAmount: parseFloat((finalTendered - finalAmount).toFixed(2)),
      ...(plateNumber.trim() ? { plateNumber: plateNumber.trim() } : {}),
    };

    setIsSubmitting(true);
    setSubmitError("");
    try {
      await onCompleteSale(tx);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Unable to register sale."
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedGrade,
    transactionCount,
    liters,
    amount,
    tenderedAmount,
    plateNumber,
    currentAttendant,
    onCompleteSale,
    isSubmitting,
  ]);

  if (!isOpen) return null;

  // -----------------------------------------------------------------------
  // Step 1 — Select fuel grade
  // -----------------------------------------------------------------------
  const renderStep1 = () => (
    <div className="px-5 pb-5">
      <h2 className="text-base font-semibold text-zinc-100 mb-4 text-balance">
        Select fuel grade
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {fuelGrades.map((grade) => (
          <button
            key={grade.id}
            type="button"
            onClick={() => {
              setSelectedGrade(grade);
              setStep(2);
            }}
            className="flex items-center gap-4 rounded-lg border border-zinc-700 bg-zinc-800/60 px-4 py-3.5 text-left transition active:scale-95 hover:border-zinc-500"
            style={{ borderLeftWidth: 4, borderLeftColor: grade.color }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-100 text-pretty">
                {grade.name}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400 text-pretty">
                {grade.code} · {grade.octaneOrCetane}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-zinc-100 tabular-nums">
                ₱{formatCurrency(grade.pricePerLiter)}/L
              </p>
            </div>
            <ChevronRightIcon className="w-4 h-4 text-zinc-500 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );

  // -----------------------------------------------------------------------
  // Step 2 — Enter amount (numpad only, no presets)
  // -----------------------------------------------------------------------
  const renderStep2 = () => {
    const displayValue =
      inputMode === "amount" ? amount : numericValue;
    const displayLabel =
      inputMode === "amount"
        ? `${liters > 0 ? liters.toFixed(2) : "0.00"} L`
        : `₱${formatCurrency(amount)}`;

    return (
      <div className="px-5 pb-5">
        {/* Selected grade chip */}
        {selectedGrade && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 border border-zinc-700"
            style={{ borderLeftWidth: 3, borderLeftColor: selectedGrade.color }}
          >
            <DropletIcon className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-200 text-pretty">
              {selectedGrade.name}
            </span>
            <span className="ml-auto text-sm text-zinc-400 tabular-nums">
              ₱{formatCurrency(selectedGrade.pricePerLiter)}/L
            </span>
          </div>
        )}

        {/* Amount display */}
        <div className="text-center mb-4">
          <p className="text-3xl font-bold text-zinc-50 tabular-nums">
            {inputMode === "amount"
              ? `₱${formatCurrency(displayValue)}`
              : `${formatCurrency(displayValue)} L`}
          </p>
          <p className="mt-1 text-sm text-zinc-400 tabular-nums">
            {inputMode === "amount" ? (
              <>
                <DropletIcon className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                {displayLabel}
              </>
            ) : (
              <>₱ {displayLabel}</>
            )}
          </p>
        </div>

        {/* Toggle: by amount / by liters */}
        <div className="flex rounded-lg bg-zinc-800 border border-zinc-700 p-0.5 mb-4">
          <button
            type="button"
            onClick={() => {
              if (inputMode !== "amount") {
                setRawInput("0");
                setInputMode("amount");
              }
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              inputMode === "amount"
                ? "bg-amber-500 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            By amount (₱)
          </button>
          <button
            type="button"
            onClick={() => {
              if (inputMode !== "liters") {
                setRawInput("0");
                setInputMode("liters");
              }
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              inputMode === "liters"
                ? "bg-amber-500 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            By liters (L)
          </button>
        </div>

        {/* Numpad */}
        <Numpad onKey={handleNumpad} allowDot={inputMode === "liters"} />

        {/* Navigation */}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition active:scale-95 hover:bg-zinc-700"
          >
            Back
          </button>
          <button
            type="button"
            disabled={amount <= 0}
            onClick={() => {
              setRawTendered("");
              setStep(3);
            }}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
              amount > 0
                ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Step 3 — Summary & finalize
  // -----------------------------------------------------------------------
  const renderStep3 = () => {
    const hasInsufficientTender = tenderedAmount > 0 && tenderedAmount < amount;
    const canConfirm = tenderedAmount > 0 && tenderedAmount >= amount;

    return (
      <div className="px-5 pb-5">
        <h2 className="text-base font-semibold text-zinc-100 mb-4 text-balance">
          Sale summary
        </h2>

        {/* Summary card */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4 mb-4">
          {selectedGrade && (
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400 text-pretty">Fuel grade</span>
                <span
                  className="font-medium text-zinc-100"
                  style={{ color: selectedGrade.color }}
                >
                  {selectedGrade.name}{" "}
                  <span className="text-zinc-500">({selectedGrade.code})</span>
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400 text-pretty">Unit price</span>
                <span className="text-zinc-200 tabular-nums">
                  ₱{formatCurrency(selectedGrade.pricePerLiter)}/L
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400 text-pretty">Volume</span>
                <span className="text-zinc-200 tabular-nums">
                  {liters.toFixed(2)} L
                </span>
              </div>
              <div className="h-px bg-zinc-700 my-1" />
              <div className="flex justify-between">
                <span className="text-sm font-medium text-zinc-300 text-pretty">
                  Total amount
                </span>
                <span className="text-lg font-bold text-amber-400 tabular-nums">
                  ₱{formatCurrency(amount)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payment method */}
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-300">
          <CashIcon className="h-4 w-4 text-amber-400" />
          <span>Payment method: Cash</span>
        </div>

        {/* Cash tendered input */}
        <div className="mb-4">
          <label
            htmlFor="tendered-amount"
            className="mb-2 block text-sm font-medium text-zinc-300"
          >
            Tendered amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
              ₱
            </span>
            <input
              id="tendered-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              autoFocus
              required
              value={rawTendered}
              onChange={(event) => setRawTendered(event.target.value)}
              aria-describedby={
                hasInsufficientTender
                  ? "tendered-amount-help tendered-amount-error"
                  : "tendered-amount-help"
              }
              aria-invalid={hasInsufficientTender}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-3 pl-8 pr-3 text-right text-xl font-semibold text-zinc-50 tabular-nums transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
          <p id="tendered-amount-help" className="mt-1.5 text-xs text-zinc-400">
            Type cash received. Confirm when it covers the sale total.
          </p>

          {canConfirm && (
            <div className="flex justify-between rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 mt-3">
              <span className="text-sm text-zinc-400 text-pretty">Change</span>
              <span className="text-sm font-semibold text-emerald-400 tabular-nums">
                ₱{formatCurrency(changeAmount)}
              </span>
            </div>
          )}
          {hasInsufficientTender && (
            <p
              id="tendered-amount-error"
              className="text-sm text-red-400 mt-2 text-pretty"
              role="status"
              aria-live="polite"
            >
              Tendered amount is less than the total
            </p>
          )}
        </div>

        {/* Plate number (conditional) */}
        {permissions.requireCustomerPlateNumber && (
          <div className="mb-4">
            <label
              htmlFor="plate-number"
              className="block text-sm font-medium text-zinc-300 mb-1.5 text-pretty"
            >
              Plate number
            </label>
            <input
              id="plate-number"
              type="text"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
              placeholder="e.g. ABC 1234"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition"
            />
          </div>
        )}

        {submitError && (
          <p className="mt-3 text-sm text-rose-300" role="alert">
            {submitError}
          </p>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => setStep(2)}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition active:scale-95 hover:bg-zinc-700"
          >
            Back
          </button>
          <button
            type="button"
            disabled={!canConfirm || isSubmitting}
            onClick={handleConfirm}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
              canConfirm
                ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700"
            }`}
          >
            <GasPumpIcon className="w-4 h-4" />
            {isSubmitting ? "Saving sale..." : "Confirm sale"}
          </button>
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-w-lg w-full rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2">
            <GasPumpIcon className="w-5 h-5 text-amber-400" />
            <h1 className="text-base font-semibold text-zinc-100 text-balance">
              New fuel sale
            </h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition active:scale-95"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={step} />

        {/* Step content */}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
}
