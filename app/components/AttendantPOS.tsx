"use client";

import React, { useState } from "react";
import {
  FuelGrade,
  AttendantAccount,
  AttendantPermissions,
  Transaction,
  ShiftState,
} from "../types/pos";
import {
  GasPumpIcon,
  ReceiptIcon,
  LockIcon,
  ChevronRightIcon,
  LogOutIcon,
} from "./Icons";
import { ReceiptModal } from "./ReceiptModal";
import { SaleWizardModal } from "./SaleWizardModal";
import { getTransactionDateKey } from "../lib/salesReports";

/** Locale-independent currency formatter — avoids SSR/client mismatch */
function formatCurrency(value: number): string {
  const [intPart, decPart] = value.toFixed(2).split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intFormatted}.${decPart}`;
}

interface AttendantPOSProps {
  fuelGrades: FuelGrade[];
  currentAttendant: AttendantAccount;
  permissions: AttendantPermissions;
  transactions: Transaction[];
  shiftState: ShiftState;
  stationName: string;
  stationLocation: string;
  onRegisterSale: (newTx: Transaction) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}

export const AttendantPOS: React.FC<AttendantPOSProps> = ({
  fuelGrades,
  currentAttendant,
  permissions,
  transactions,
  shiftState,
  stationName,
  stationLocation,
  onRegisterSale,
  onSignOut,
}) => {
  const [viewReceipt, setViewReceipt] = useState<Transaction | null>(null);
  const [isSaleWizardOpen, setIsSaleWizardOpen] = useState<boolean>(false);
  const [wizardKey, setWizardKey] = useState(0);
  const todayDateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const attendantTransactions = transactions.filter(
    (transaction) =>
      transaction.status === "completed" &&
      transaction.attendantBadge === currentAttendant.badgeId &&
      getTransactionDateKey(transaction, todayDateKey) === todayDateKey
  );
  const attendantShiftState: ShiftState = {
    totalSalesAmount: attendantTransactions.reduce((total, transaction) => total + transaction.totalAmount, 0),
    totalLitersDispensed: attendantTransactions.reduce((total, transaction) => total + transaction.volumeLiters, 0),
    transactionsCount: attendantTransactions.length,
    cashInDrawer: attendantTransactions.reduce(
      (total, transaction) => total + (transaction.paymentMethod === "cash" ? transaction.totalAmount : 0),
      0
    ),
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 select-none overflow-hidden min-h-dvh">
      {/* Header */}
      <header className="h-14 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-xs font-semibold text-zinc-200">
              {stationName}
            </span>
            <div className="text-[11px] text-zinc-400">
              {stationLocation}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-zinc-800">
            <div className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-200">
              {currentAttendant.name.charAt(0)}
            </div>
            <div className="text-xs leading-tight">
              <p className="font-medium text-zinc-200">{currentAttendant.name}</p>
              <p className="text-[10px] text-zinc-400">
                {currentAttendant.badgeId} · {currentAttendant.role}
              </p>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 transition"
          >
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main content: two-column split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left: Dashboard + Create sale */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col p-4 md:p-6 overflow-y-auto space-y-4">
          {/* Shift KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <span className="text-[11px] text-zinc-400 block">Today&apos;s shift sales</span>
              <span className="text-lg font-semibold text-amber-400 tabular-nums mt-1 block">
                ₱{formatCurrency(attendantShiftState.totalSalesAmount)}
              </span>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <span className="text-[11px] text-zinc-400 block">Volume dispensed</span>
              <span className="text-lg font-semibold text-emerald-400 tabular-nums mt-1 block">
                {attendantShiftState.totalLitersDispensed.toFixed(2)} L
              </span>
            </div>
            {permissions.showShiftRevenueToAttendant ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <span className="text-[11px] text-zinc-400 block">Cash in drawer</span>
                <span className="text-lg font-semibold text-zinc-200 tabular-nums mt-1 block">
                  ₱{formatCurrency(attendantShiftState.cashInDrawer)}
                </span>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <span className="text-[11px] text-zinc-400 block">Cash in drawer</span>
                <span className="text-xs text-zinc-500 italic flex items-center gap-1 mt-2">
                  <LockIcon className="w-3 h-3" /> Blind shift
                </span>
              </div>
            )}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <span className="text-[11px] text-zinc-400 block">Transactions</span>
              <span className="text-lg font-semibold text-zinc-200 tabular-nums mt-1 block">
                {attendantShiftState.transactionsCount}
              </span>
            </div>
          </div>

          {/* Fuel grade prices — quick reference */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-xs font-semibold text-zinc-300 mb-3 text-balance">
              Today&apos;s fuel prices
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fuelGrades.map((grade) => (
                <div
                  key={grade.id}
                  className="flex items-center gap-2.5 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5"
                >
                  <div
                    className="w-1.5 h-8 rounded-full shrink-0"
                    style={{ backgroundColor: grade.color }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{grade.name}</p>
                    <p className="text-sm font-semibold text-zinc-100 tabular-nums">
                      ₱{grade.pricePerLiter.toFixed(2)}<span className="text-[10px] text-zinc-400 font-normal">/L</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Create sale button — the main action */}
          <button
            type="button"
            onClick={() => {
              setWizardKey((k) => k + 1);
              setIsSaleWizardOpen(true);
            }}
            disabled={fuelGrades.length === 0}
            className="w-full py-5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-base flex items-center justify-center gap-3 transition active:scale-[0.98]"
          >
            <GasPumpIcon className="w-6 h-6" />
            {fuelGrades.length === 0 ? "No fuel grades configured" : "Create new sale"}
          </button>
          {fuelGrades.length === 0 && (
            <p role="status" className="text-center text-xs text-zinc-400">
              Ask a station manager to add fuel before recording sales.
            </p>
          )}

          {/* Safe cash drop */}
          {permissions.allowCashDrop ? (
            <button
              type="button"
              onClick={() => {
                alert(
                  `Safe drop logged: ₱1,000 deposited to safe. Remaining drawer cash: ₱${(attendantShiftState.cashInDrawer - 1000).toFixed(2)}`
                );
              }}
              className="w-full py-2.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 flex items-center justify-center gap-1.5 text-xs font-medium transition"
            >
              <LogOutIcon className="w-3.5 h-3.5 text-zinc-400" />
              Register safe cash drop
            </button>
          ) : (
            <div className="py-2 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 text-center flex items-center justify-center gap-1">
              <LockIcon className="w-3 h-3 text-zinc-500" />
              Safe drop disabled by policy
            </div>
          )}
        </div>

        {/* Right: Transaction list */}
        <div className="lg:col-span-5 xl:col-span-4 bg-zinc-900 border-t lg:border-t-0 lg:border-l border-zinc-800 flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-xs font-semibold text-zinc-200 flex items-center gap-2 text-balance">
                <ReceiptIcon className="w-4 h-4 text-zinc-400" />
                Today&apos;s shift transactions ({attendantTransactions.length})
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {currentAttendant.name} · Today · Active session
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {attendantTransactions.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-zinc-500">
                <ReceiptIcon className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs text-pretty">No transactions recorded today.</p>
              </div>
            ) : (
              attendantTransactions.map((tx) => (
                <div
                  key={tx.id}
                  onClick={() => setViewReceipt(tx)}
                  className="bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 p-3 rounded-lg cursor-pointer transition flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-zinc-200">
                      {tx.receiptNumber}
                    </span>
                    <span className="text-[11px] text-zinc-400 tabular-nums">{tx.timestamp}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: tx.fuelGradeColor }}
                      />
                      <span className="text-zinc-300">{tx.fuelGradeName}</span>
                      <span className="text-zinc-400 tabular-nums">
                        ({tx.volumeLiters.toFixed(2)} L)
                      </span>
                    </div>
                    <span className="font-semibold text-amber-400 tabular-nums">
                      ₱{tx.totalAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                    <span className="capitalize">{tx.paymentMethod.replace("_", " ")}</span>
                    <span className="text-zinc-300 hover:underline flex items-center gap-1">
                      View slip <ChevronRightIcon className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 bg-zinc-950 border-t border-zinc-800 shrink-0 text-xs">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Today&apos;s shift total:</span>
              <span className="text-white font-medium tabular-nums">
                ₱{formatCurrency(attendantShiftState.totalSalesAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ReceiptModal
        transaction={viewReceipt}
        stationName={stationName}
        stationLocation={stationLocation}
        onClose={() => setViewReceipt(null)}
        canReprint={permissions.allowDuplicateReceiptReprint}
      />

      <SaleWizardModal
        key={wizardKey}
        isOpen={isSaleWizardOpen}
        fuelGrades={fuelGrades}
        currentAttendant={currentAttendant}
        permissions={permissions}
        transactionCount={attendantTransactions.length}
        onCompleteSale={async (newTx) => {
          await onRegisterSale(newTx);
          setIsSaleWizardOpen(false);
        }}
        onClose={() => setIsSaleWizardOpen(false)}
      />
    </div>
  );
};
