"use client";

import React from "react";
import { Transaction } from "../types/pos";
import { PrinterIcon, XIcon } from "./Icons";

interface ReceiptModalProps {
  transaction: Transaction | null;
  stationName: string;
  stationLocation: string;
  onClose: () => void;
  canReprint: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  transaction,
  stationName,
  stationLocation,
  onClose,
  canReprint,
}) => {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-sm rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6 flex flex-col text-zinc-100 text-xs">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          aria-label="Close"
        >
          <XIcon className="w-4 h-4" />
        </button>

        {/* Paper Receipt Simulation */}
        <div className="bg-amber-50/95 text-zinc-900 p-5 rounded-lg border border-amber-200/60 font-mono text-[11px] leading-relaxed">
          <div className="text-center pb-3 border-b border-dashed border-zinc-400 mb-3">
            <h3 className="font-bold text-sm tracking-wider uppercase text-zinc-950">
              {stationName}
            </h3>
            <p className="text-[10px] text-zinc-600">
              {stationLocation}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">ELECTRONIC FUEL RECEIPT</p>
          </div>

          <div className="space-y-1 mb-3 pb-3 border-b border-dashed border-zinc-300">
            <div className="flex justify-between">
              <span className="text-zinc-600">Receipt No:</span>
              <span className="font-semibold">{transaction.receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Date/Time:</span>
              <span>{transaction.timestamp}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Pump / Island:</span>
              <span className="font-bold">PUMP {transaction.pumpNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Attendant:</span>
              <span>{transaction.attendantName} ({transaction.attendantBadge})</span>
            </div>
            {transaction.plateNumber && (
              <div className="flex justify-between">
                <span className="text-zinc-600">Plate Number:</span>
                <span className="font-bold">{transaction.plateNumber}</span>
              </div>
            )}
          </div>

          <div className="space-y-1 mb-3 pb-3 border-b border-dashed border-zinc-400">
            <div className="flex justify-between font-bold text-zinc-950 text-xs">
              <span>{transaction.fuelGradeName.toUpperCase()}</span>
              <span className="tabular-nums">₱{transaction.totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-zinc-700">
              <span>Volume (Liters):</span>
              <span className="font-semibold tabular-nums">{transaction.volumeLiters.toFixed(3)} L</span>
            </div>
            <div className="flex justify-between text-zinc-700">
              <span>Price / Liter:</span>
              <span className="tabular-nums">₱{transaction.pricePerLiter.toFixed(2)}</span>
            </div>
            {transaction.meterStart !== undefined && transaction.meterEnd !== undefined && (
              <div className="flex justify-between text-[10px] text-zinc-500 pt-1">
                <span>Totalizer:</span>
                <span className="tabular-nums">{transaction.meterStart.toFixed(2)} → {transaction.meterEnd.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="space-y-1 mb-3 pb-3 border-b border-dashed border-zinc-300 text-[10px]">
            <div className="flex justify-between">
              <span className="text-zinc-600">Payment Mode:</span>
              <span className="uppercase font-semibold">{transaction.paymentMethod.replace("_", " ")}</span>
            </div>
            {transaction.tenderedAmount !== undefined && (
              <div className="flex justify-between">
                <span className="text-zinc-600">Tendered:</span>
                <span className="tabular-nums">₱{transaction.tenderedAmount.toFixed(2)}</span>
              </div>
            )}
            {transaction.changeAmount !== undefined && (
              <div className="flex justify-between">
                <span className="text-zinc-600">Change:</span>
                <span className="font-semibold tabular-nums">₱{transaction.changeAmount.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="text-center pt-1">
            <div className="h-8 w-full bg-zinc-900/10 flex items-center justify-center tracking-widest text-[10px] text-zinc-700 font-mono">
              ||| |||| | ||||| || |||| ||| ||||
            </div>
            <p className="text-[9px] text-zinc-500 mt-1">THANK YOU FOR FUELING WITH US!</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {canReprint ? (
            <button
              onClick={() => {
                alert(`Printing duplicate receipt ${transaction.receiptNumber}...`);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-500 text-zinc-950 font-semibold text-xs hover:bg-amber-400 active:scale-95 transition"
            >
              <PrinterIcon className="w-3.5 h-3.5" />
              Reprint slip
            </button>
          ) : (
            <div className="flex-1 py-2 text-center text-xs text-zinc-400 bg-zinc-800 rounded-lg border border-zinc-700">
              Reprint restricted by policy
            </div>
          )}
          <button
            onClick={onClose}
            className="py-2 px-3.5 rounded-lg bg-zinc-800 text-zinc-300 font-medium text-xs hover:bg-zinc-700 hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
