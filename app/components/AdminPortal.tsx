"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  FuelGrade,
  AttendantAccount,
  AttendantPermissions,
  Transaction,
  UserRole,
  FuelBatch,
  NewFuelBatch,
  NewFuelGrade,
} from "../types/pos";
import {
  buildFuelCostReport,
  buildFuelSalesBreakdown,
  buildSalesReport,
  buildAttendantSalesRanking,
  getLocalDateKey,
  getTransactionDateKey,
} from "../lib/salesReports";
import { createAttendantRankingPdf, createSalesReportPdf } from "../lib/salesReportPdf";
import { createInventoryReportPdf, type InventoryReportPeriod } from "../lib/inventoryReportPdf";
import type { AttendantRankingPeriod, SalesReportPeriod } from "../lib/salesReports";
import {
  AddFuelGradeModal,
  FuelManagementModal,
  ModalDialog,
} from "./FuelManagementModal";
import { ChangePinModal } from "./ChangePinModal";
import {
  ShieldLockIcon,
  UsersIcon,
  SlidersIcon,
  LogOutIcon,
  DropletIcon,
  BarChartIcon,
  ChevronRightIcon,
  CheckIcon,
  XIcon,
} from "./Icons";

type AdminTab = "permissions" | "accounts" | "pricing" | "sales";
type AttendantFormField = "name" | "badge" | "pin";

/** Locale-independent currency formatter — avoids SSR/client mismatch from toLocaleString() */
function formatCurrency(value: number): string {
  const [intPart, decPart] = value.toFixed(2).split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intFormatted}.${decPart}`;
}

/** Locale-independent number formatter */
function formatNumber(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getSalesReportDateLabel(period: SalesReportPeriod, date: Date): string {
  return period === "month"
    ? `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
    : date.getFullYear().toString();
}

function getSalesChartScaleMaximum(maximum: number): number {
  if (maximum <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(maximum));
  const step = magnitude / 2;
  return (Math.floor(maximum / step) + 1) * step;
}

function isSalesReportTick(index: number, period: SalesReportPeriod, count: number): boolean {
  return period === "year"
    ? index === 0 || index === 3 || index === 6 || index === 9 || index === 11
    : index === 0 || index % 7 === 0 || index === count - 1;
}

interface AdminPortalProps {
  canChangePin: boolean;
  isOwner: boolean;
  stationName: string;
  stationLocation: string;
  onUpdateStation: (name: string, location: string) => void;
  fuelGrades: FuelGrade[];
  fuelBatches: FuelBatch[];
  attendants: AttendantAccount[];
  permissions: AttendantPermissions;
  transactions: Transaction[];
  onUpdatePermissions: (newPerms: AttendantPermissions) => void;
  onUpdateFuelPrice: (gradeId: string, newPrice: number) => string | null;
  onUpdateFuelDetails: (grade: FuelGrade) => string | null;
  onAddFuelGrade: (grade: NewFuelGrade) => string | null;
  onAddFuelBatch: (batch: NewFuelBatch) => string | null;
  onUpdateFuelBatch: (batch: FuelBatch) => string | null;
  onDeleteFuelBatch: (batchId: string) => string | null;
  onDeleteFuelGrade: (gradeId: string) => string | null;
  onAddAttendant: (newAttendant: AttendantAccount, pin: string) => void;
  onUpdateAttendant: (attendant: AttendantAccount, pin?: string) => void;
  onDeleteAttendant: (attendantId: string) => void;
  onToggleAttendantStatus: (attendantId: string) => void;
  onSignOut: () => void | Promise<void>;
  onResetStation: () => Promise<void>;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  canChangePin,
  isOwner,
  stationName,
  stationLocation,
  onUpdateStation,
  fuelGrades,
  fuelBatches,
  attendants,
  permissions,
  transactions,
  onUpdatePermissions,
  onUpdateFuelPrice,
  onUpdateFuelDetails,
  onAddFuelGrade,
  onAddFuelBatch,
  onUpdateFuelBatch,
  onDeleteFuelBatch,
  onDeleteFuelGrade,
  onAddAttendant,
  onUpdateAttendant,
  onDeleteAttendant,
  onToggleAttendantStatus,
  onSignOut,
  onResetStation,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>("sales");
  const [salesReportPeriod, setSalesReportPeriod] =
    useState<SalesReportPeriod>("month");
  const [inventoryReportPeriod, setInventoryReportPeriod] =
    useState<InventoryReportPeriod>("month");
  const [isGeneratingInventoryPdf, setIsGeneratingInventoryPdf] = useState(false);
  const [inventoryPdfError, setInventoryPdfError] = useState<string | null>(null);
  const [attendantRankingPeriod, setAttendantRankingPeriod] =
    useState<AttendantRankingPeriod>("today");
  const [salesReportDate, setSalesReportDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [showAddFuelModal, setShowAddFuelModal] = useState(false);
  const [showTodayFuelReport, setShowTodayFuelReport] = useState(false);
  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [showResetStationModal, setShowResetStationModal] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [isResettingStation, setIsResettingStation] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const [isGeneratingSalesPdf, setIsGeneratingSalesPdf] = useState(false);
  const [isGeneratingRankingPdf, setIsGeneratingRankingPdf] = useState(false);
  const [salesPdfError, setSalesPdfError] = useState<string | null>(null);
  const [rankingPdfError, setRankingPdfError] = useState<string | null>(null);
  const [selectedFuelGradeId, setSelectedFuelGradeId] = useState<string | null>(
    null
  );
  const [openAttendantActions, setOpenAttendantActions] = useState<string | null>(null);
  const attendantActionsRef = useRef<HTMLDivElement | null>(null);
  const attendantActionsTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [localPermissions, setLocalPermissions] = useState<AttendantPermissions>({
    ...permissions,
  });
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string>("");
  const [localStationName, setLocalStationName] = useState(stationName);
  const [localStationLocation, setLocalStationLocation] = useState(stationLocation);
  const selectedFuelGrade = fuelGrades.find(
    (grade) => grade.id === selectedFuelGradeId
  );
  const todayDateKey = getLocalDateKey(new Date());
  const completedSales = transactions.filter(
    (transaction) => transaction.status === "completed"
  );
  const completedSalesToday = completedSales.filter(
    (transaction) =>
      getTransactionDateKey(transaction, todayDateKey) === todayDateKey
  );
  const totalSalesToday = completedSalesToday.reduce(
    (total, transaction) => total + transaction.totalAmount,
    0
  );
  const totalVolumeToday = completedSalesToday.reduce(
    (total, transaction) => total + transaction.volumeLiters,
    0
  );
  const todayFuelSales = buildFuelSalesBreakdown(
    fuelGrades,
    completedSalesToday
  );
  const totalFuelVolumeInReport = todayFuelSales.reduce(
    (total, fuelSale) => total + fuelSale.totalVolumeLiters,
    0
  );
  const salesReport = buildSalesReport(
    transactions,
    salesReportPeriod,
    salesReportDate,
    todayDateKey
  );
  const attendantRanking = buildAttendantSalesRanking(
    attendants,
    transactions,
    attendantRankingPeriod,
    salesReportDate,
    todayDateKey
  );
  const fuelCostReport = buildFuelCostReport(
    fuelBatches,
    transactions,
    salesReportPeriod,
    salesReportDate,
    todayDateKey
  );
  const salesChartScaleMaximum = getSalesChartScaleMaximum(
    salesReport.peakBucketAmount
  );
  const currentDate = new Date();
  const canAdvanceSalesReport =
    salesReportPeriod === "month"
      ? salesReportDate.getFullYear() < currentDate.getFullYear() ||
        salesReportDate.getMonth() < currentDate.getMonth() &&
          salesReportDate.getFullYear() === currentDate.getFullYear()
      : salesReportDate.getFullYear() < currentDate.getFullYear();

  const closeResetStationModal = () => {
    if (isResettingStation) return;
    setShowResetStationModal(false);
    setResetConfirmation("");
    setResetError("");
  };

  const handleResetStation = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (resetConfirmation !== "RESET" || isResettingStation) return;

    setIsResettingStation(true);
    setResetError("");
    try {
      await onResetStation();
      setShowResetStationModal(false);
      setResetConfirmation("");
      setResetSuccess("Station data was reset. Owner access and settings were kept.");
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : "Unable to reset station data."
      );
    } finally {
      setIsResettingStation(false);
    }
  };

  const handleDownloadSalesReportPdf = async () => {
    setIsGeneratingSalesPdf(true);
    setSalesPdfError(null);
    try {
      const periodLabel = getSalesReportDateLabel(
        salesReportPeriod,
        salesReportDate
      );
      const pdfBytes = await createSalesReportPdf({
        report: fuelCostReport,
        period: salesReportPeriod,
        periodLabel,
        generatedDateKey: todayDateKey,
        attendantRanking: [],
        attendantRankingPeriod,
      });
      const pdfBlob = new Blob([pdfBytes.slice().buffer as ArrayBuffer], {
        type: "application/pdf",
      });
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `LE-AR-FUEL-STATION-Sales-Report-${salesReportPeriod === "month" ? getLocalDateKey(salesReportDate).slice(0, 7) : salesReportDate.getFullYear()}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      console.error("Could not generate the sales report PDF.", error);
      setSalesPdfError("The PDF could not be generated. Please try again.");
    } finally {
      setIsGeneratingSalesPdf(false);
    }
  };

  const handleDownloadInventoryPdf = async () => {
    setIsGeneratingInventoryPdf(true);
    setInventoryPdfError(null);
    try {
      const pdfBytes = await createInventoryReportPdf({
        grades: fuelGrades,
        batches: fuelBatches,
        transactions,
        period: inventoryReportPeriod,
        generatedDateKey: todayDateKey,
        stationName,
      });
      const pdfBlob = new Blob([pdfBytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `LE-AR-FUEL-STATION-Inventory-${inventoryReportPeriod}-${todayDateKey}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      console.error("Could not generate the inventory report PDF.", error);
      setInventoryPdfError("The inventory report could not be generated. Please try again.");
    } finally {
      setIsGeneratingInventoryPdf(false);
    }
  };

  const handleDownloadRankingPdf = async () => {
    setIsGeneratingRankingPdf(true);
    setRankingPdfError(null);
    try {
      const pdfBytes = await createAttendantRankingPdf({
        ranking: attendantRanking,
        period: attendantRankingPeriod,
        generatedDateKey: todayDateKey,
      });
      const pdfBlob = new Blob([pdfBytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `LE-AR-FUEL-STATION-Attendant-Ranking-${attendantRankingPeriod}-${todayDateKey}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      console.error("Could not generate the attendant ranking PDF.", error);
      setRankingPdfError("The ranking PDF could not be generated. Please try again.");
    } finally {
      setIsGeneratingRankingPdf(false);
    }
  };

  const [showAttendantModal, setShowAttendantModal] = useState(false);
  const [editingAttendant, setEditingAttendant] = useState<AttendantAccount | null>(null);
  const [newAttName, setNewAttName] = useState("");
  const [newAttBadge, setNewAttBadge] = useState("");
  const [newAttPin, setNewAttPin] = useState("");
  const [newAttIsland, setNewAttIsland] = useState<number>(1);
  const [newAttRole, setNewAttRole] = useState<UserRole>("attendant");
  const [attendantFormError, setAttendantFormError] = useState<{
    field: AttendantFormField;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!openAttendantActions) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !attendantActionsRef.current?.contains(event.target)
      ) {
        setOpenAttendantActions(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenAttendantActions(null);
        attendantActionsTriggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openAttendantActions]);

  const handleTogglePermission = (key: keyof AttendantPermissions) => {
    setLocalPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSavePermissions = () => {
    onUpdatePermissions(localPermissions);
    setSavedSuccessMsg("Permissions saved and broadcasted to terminals.");
    setTimeout(() => setSavedSuccessMsg(""), 3000);
  };

  const openAttendantForm = (attendant?: AttendantAccount) => {
    setEditingAttendant(attendant ?? null);
    setNewAttName(attendant?.name ?? "");
    setNewAttBadge(attendant?.badgeId ?? "");
    setNewAttPin("");
    setNewAttIsland(attendant?.assignedIsland ?? 1);
    setNewAttRole(attendant && attendant.role !== "owner" ? attendant.role : "attendant");
    setAttendantFormError(null);
    setShowAttendantModal(true);
  };

  const closeAttendantForm = () => {
    setShowAttendantModal(false);
    setEditingAttendant(null);
    setAttendantFormError(null);
  };

  const handleSaveAttendant = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAttName.trim();
    const badgeId = newAttBadge.trim().toUpperCase();
    const pin = newAttPin.trim();

    if (!name) {
      setAttendantFormError({ field: "name", message: "Enter a full name." });
      return;
    }

    if (!badgeId) {
      setAttendantFormError({ field: "badge", message: "Enter a badge ID." });
      return;
    }

    if ((!editingAttendant || pin) && !/^\d{4}$/.test(pin)) {
      setAttendantFormError({
        field: "pin",
        message: "PIN must contain exactly four digits.",
      });
      return;
    }

    const duplicateBadge = attendants.some(
      (attendant) =>
        attendant.id !== editingAttendant?.id &&
        attendant.badgeId.toUpperCase() === badgeId
    );
    if (duplicateBadge) {
      setAttendantFormError({
        field: "badge",
        message: "That badge ID is already assigned to another staff member.",
      });
      return;
    }

    if (editingAttendant) {
      if (editingAttendant.role === "owner") return;
      onUpdateAttendant({
        ...editingAttendant,
        name,
        badgeId,
        role: newAttRole,
        assignedIsland: newAttIsland,
      }, pin || undefined);
    } else {
      const nextId =
        attendants.reduce((maxId, attendant) => {
          const match = /^att-(\d+)$/.exec(attendant.id);
          return match ? Math.max(maxId, Number(match[1])) : maxId;
        }, 0) + 1;
      const hiredAt = new Date();
      const dateHired = `${hiredAt.getFullYear()}-${String(
        hiredAt.getMonth() + 1
      ).padStart(2, "0")}-${String(hiredAt.getDate()).padStart(2, "0")}`;

      onAddAttendant({
        id: `att-${nextId}`,
        name,
        badgeId,
        role: newAttRole,
        assignedIsland: newAttIsland,
        active: true,
        avatarColor: "bg-zinc-800",
        phone: "0917-000-0000",
        dateHired,
      }, pin);
    }

    closeAttendantForm();
  };

  const handleDeleteAttendant = (attendant: AttendantAccount) => {
    if (attendant.role === "owner") return;
    const confirmed = window.confirm(
      `Permanently delete ${attendant.name}? Past transactions will be kept.`
    );
    if (confirmed) onDeleteAttendant(attendant.id);
  };

  const tabs: Array<{ id: AdminTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: "pricing", label: "Fuel prices & tanks", icon: DropletIcon },
    { id: "accounts", label: "Staff accounts", icon: UsersIcon },
    { id: "sales", label: "Sales report", icon: BarChartIcon },
    { id: "permissions", label: "Attendant permissions", icon: SlidersIcon },
  ];

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 min-h-dvh">
      {/* Header */}
      <header className="min-h-16 bg-zinc-900 border-b border-zinc-800 px-4 py-2 md:px-8 flex flex-wrap items-center justify-between gap-y-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <ShieldLockIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white text-balance">
                Station owner & manager console
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-medium">
                Admin
              </span>
            </div>
            <p className="text-xs text-zinc-400 text-pretty">
              Review sales, manage staff and permissions, and update fuel prices and tanks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canChangePin && (
            <button
              type="button"
              onClick={() => setShowChangePinModal(true)}
              className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Change PIN
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
          >
            <LogOutIcon className="h-4 w-4 text-zinc-400" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="bg-zinc-900 border-b border-zinc-800 px-4 md:px-8 flex items-center gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-3.5 border-b-2 text-xs transition ${
                isActive
                  ? "border-amber-400 text-amber-300 font-medium"
                  : "border-transparent text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main Container */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
        {/* Tab 1: Permissions */}
        {activeTab === "permissions" && (
          <div className="space-y-6">
            {isOwner && (
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-white">Station details</h2>
                  <p className="text-xs text-zinc-400 mt-1">Station name and location shown on terminals and receipts.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-zinc-400">
                    Station name
                    <input value={localStationName} onChange={(event) => setLocalStationName(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Location
                    <input value={localStationLocation} onChange={(event) => setLocalStationLocation(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateStation(localStationName.trim(), localStationLocation.trim())}
                  disabled={!localStationName.trim() || !localStationLocation.trim()}
                  className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                >
                  Save station details
                </button>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 text-balance">
                  <SlidersIcon className="w-4 h-4 text-zinc-400" />
                  Attendant feature permissions
                </h2>
                <p className="text-xs text-zinc-400 mt-1 max-w-2xl text-pretty">
                  Control what actions attendants and cashiers can execute on their terminal.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {savedSuccessMsg && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4" />
                    {savedSuccessMsg}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs active:scale-95 transition flex items-center gap-1.5"
                >
                  <CheckIcon className="w-4 h-4" />
                  Save permissions
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  key: "showShiftRevenueToAttendant" as const,
                  title: "Show shift revenue & cash in drawer",
                  desc: "When enabled, attendants see total sales amount and expected drawer cash.",
                  badge: "Safe",
                },
                {
                  key: "allowCashDrop" as const,
                  title: "Allow safe cash drops",
                  desc: "Enables attendant to log periodic cash drops to the station safe.",
                  badge: "Safe",
                },
                {
                  key: "allowDuplicateReceiptReprint" as const,
                  title: "Allow duplicate receipt reprints",
                  desc: "Attendants can re-print copies of past completed transactions.",
                  badge: "Standard",
                },
                {
                  key: "allowCustomPresetAmount" as const,
                  title: "Allow arbitrary numpad amounts",
                  desc: "Allows the attendant to enter any custom numeric amount on the keypad.",
                  badge: "Standard",
                },
                {
                  key: "requireCustomerPlateNumber" as const,
                  title: "Enforce vehicle plate number",
                  desc: "Requires vehicle plate number before dispensing fuel.",
                  badge: "Compliance",
                },
                {
                  key: "allowOfflinePumpManualEntry" as const,
                  title: "Allow manual offline pump entry",
                  desc: "Permits attendants to record sales when dispenser link is offline.",
                  badge: "Elevated",
                },
                {
                  key: "allowManualDiscount" as const,
                  title: "Allow manual cashier discounts",
                  desc: "Permits attendants to apply senior/PWD discounts directly at the pump.",
                  badge: "Elevated",
                },
                {
                  key: "requireSupervisorPinForVoid" as const,
                  title: "Require supervisor PIN for voids",
                  desc: "Transaction void requires manager or owner PIN authorization.",
                  badge: "Security",
                },
                {
                  key: "allowVoid" as const,
                  title: "Allow direct attendant voids",
                  desc: "Allows the attendant to void mistaken sales without manager intervention.",
                  badge: "Restricted",
                },
                {
                  key: "allowPriceOverride" as const,
                  title: "Allow attendant price override",
                  desc: "Permits pump attendant to manually change fuel price per liter.",
                  badge: "Owner only",
                },
                {
                  key: "allowTestDispensationCalibration" as const,
                  title: "Allow calibration test dispensations",
                  desc: "Enables 10L calibration testing bucket dispensations without billing cashier drawer.",
                  badge: "Owner only",
                },
              ].map((item) => {
                const isEnabled = localPermissions[item.key];
                return (
                  <div
                    key={item.key}
                    onClick={() => handleTogglePermission(item.key)}
                    className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start justify-between gap-4 ${
                      isEnabled
                        ? "bg-zinc-900 border-zinc-700 hover:border-zinc-600"
                        : "bg-zinc-950 border-zinc-800 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-white">{item.title}</h3>
                        <span className="text-[10px] px-1.5 py-0.2 rounded border border-zinc-700 bg-zinc-800 text-zinc-300">
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed text-pretty">{item.desc}</p>
                    </div>

                    <div
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-150 ${
                        isEnabled ? "bg-amber-500" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-zinc-950 shadow transition duration-150 ${
                          isEnabled ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {isOwner && (
              <section className="rounded-xl border border-rose-900/70 bg-zinc-900 p-5">
                <h2 className="text-sm font-semibold text-rose-200">Danger zone</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  Clear fuel setup, deliveries, sales, shift totals, and all other staff accounts.
                  Your owner login, station identity, and permissions will stay.
                </p>
                {resetSuccess && (
                  <p className="mt-3 text-xs text-emerald-300" role="status" aria-live="polite">
                    {resetSuccess}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResetConfirmation("");
                    setResetError("");
                    setShowResetStationModal(true);
                  }}
                  className="mt-4 min-h-11 rounded-lg border border-rose-800 px-3.5 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-950/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                >
                  Reset all data
                </button>
              </section>
            )}
          </div>
        )}

        {/* Tab 2: Accounts */}
        {activeTab === "accounts" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 text-balance">
                  <UsersIcon className="w-4 h-4 text-zinc-400" />
                  Staff accounts
                </h2>
                <p className="text-xs text-zinc-400 mt-1 text-pretty">
                  Select a staff member to manage their account and access.
                </p>
              </div>

              <button
                type="button"
                onClick={() => openAttendantForm()}
                className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs transition flex items-center gap-1.5"
              >
                <span>Add attendant</span>
              </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
                    <th className="py-2.5 px-4 font-normal">Staff member</th>
                    <th className="py-2.5 px-4 font-normal">Role</th>
                    <th className="py-2.5 px-4 font-normal">Island</th>
                    <th className="py-2.5 px-4 font-normal">Login</th>
                    <th className="py-2.5 px-4 font-normal">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {attendants.map((att) => (
                    <tr key={att.id} className="hover:bg-zinc-800/40 transition">
                      <td className="py-3 px-4">
                        <div
                          className="relative inline-flex"
                          ref={
                            openAttendantActions === att.id
                              ? attendantActionsRef
                              : null
                          }
                        >
                          <button
                            type="button"
                            ref={
                              openAttendantActions === att.id
                                ? attendantActionsTriggerRef
                                : null
                            }
                            onClick={() =>
                              setOpenAttendantActions((current) =>
                                current === att.id ? null : att.id
                              )
                            }
                            aria-label={`Options for ${att.name}`}
                            aria-haspopup="true"
                            aria-expanded={openAttendantActions === att.id}
                            aria-controls={
                              openAttendantActions === att.id
                                ? `attendant-actions-${att.id}`
                                : undefined
                            }
                            className="rounded px-1 -mx-1 py-1 text-left transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                          >
                            <span className="block font-medium text-white">{att.name}</span>
                            <span className="block text-[11px] text-zinc-400">{att.badgeId}</span>
                          </button>
                          {openAttendantActions === att.id && (
                            <div
                              id={`attendant-actions-${att.id}`}
                              role="group"
                              aria-label={`Options for ${att.name}`}
                              className="absolute left-0 top-full z-20 mt-1 flex min-w-40 flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl"
                            >
                              {att.role === "owner" ? (
                                <p className="px-3 py-2 text-left text-xs text-zinc-400">
                                  Owner account is protected.
                                </p>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenAttendantActions(null);
                                      openAttendantForm(att);
                                    }}
                                    className="rounded px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenAttendantActions(null);
                                      onToggleAttendantStatus(att.id);
                                    }}
                                    className="rounded px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                                  >
                                    {att.active ? "Suspend" : "Activate"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenAttendantActions(null);
                                      handleDeleteAttendant(att);
                                    }}
                                    className="rounded px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-950/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 capitalize text-zinc-300">
                        {att.role}
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {att.assignedIsland === 0 ? "All" : `Island ${att.assignedIsland}`}
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-300">
                        Neon Auth
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-zinc-300 capitalize">
                          {att.active ? "Active" : "Suspended"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showAttendantModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
                <form
                  onSubmit={handleSaveAttendant}
                  className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4 text-xs"
                >
                  <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
                    <h3 className="font-semibold text-sm text-white">
                      {editingAttendant ? "Edit staff account" : "Register staff account"}
                    </h3>
                    <button
                      type="button"
                      aria-label="Close modal"
                      onClick={closeAttendantForm}
                      className="rounded p-1 text-zinc-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label htmlFor="attendant-name" className="block text-zinc-400 text-xs mb-1">
                      Full name
                    </label>
                    <input
                      id="attendant-name"
                      type="text"
                      required
                      placeholder="e.g. Christian Paul"
                      value={newAttName}
                      onChange={(e) => {
                        setNewAttName(e.target.value);
                        setAttendantFormError(null);
                      }}
                      aria-invalid={attendantFormError?.field === "name"}
                      aria-describedby={
                        attendantFormError?.field === "name"
                          ? "attendant-form-error"
                          : undefined
                      }
                      className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 rounded text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="attendant-badge" className="block text-zinc-400 text-xs mb-1">
                        Badge ID
                      </label>
                      <input
                        id="attendant-badge"
                        type="text"
                        required
                        disabled={Boolean(editingAttendant)}
                        placeholder="AT-115"
                        value={newAttBadge}
                        onChange={(e) => {
                          setNewAttBadge(e.target.value);
                          setAttendantFormError(null);
                        }}
                        aria-invalid={attendantFormError?.field === "badge"}
                        aria-describedby={
                          attendantFormError?.field === "badge"
                            ? "attendant-form-error"
                            : undefined
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 rounded text-white uppercase focus:outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label htmlFor="attendant-pin" className="block text-zinc-400 text-xs mb-1">
                        {editingAttendant ? "Reset 4-Digit PIN" : "Initial 4-Digit PIN"}
                      </label>
                      <input
                        id="attendant-pin"
                        type="password"
                        maxLength={4}
                        required={!editingAttendant}
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        autoComplete="new-password"
                        placeholder={editingAttendant ? "Leave blank to keep" : "4 digits"}
                        value={newAttPin}
                        onChange={(e) => {
                          setNewAttPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                          setAttendantFormError(null);
                        }}
                        aria-invalid={attendantFormError?.field === "pin"}
                        aria-describedby={
                          attendantFormError?.field === "pin"
                            ? "attendant-form-error"
                            : undefined
                        }
                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 rounded text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="attendant-island" className="block text-zinc-400 text-xs mb-1">
                        Island
                      </label>
                      <select
                        id="attendant-island"
                        value={newAttIsland}
                        onChange={(e) => setNewAttIsland(Number(e.target.value))}
                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 rounded text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value={1}>Island 1</option>
                        <option value={2}>Island 2</option>
                        <option value={3}>Island 3</option>
                        <option value={0}>All Islands</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="attendant-role" className="block text-zinc-400 text-xs mb-1">
                        Role
                      </label>
                      <select
                        id="attendant-role"
                        value={newAttRole}
                        onChange={(e) => setNewAttRole(e.target.value as UserRole)}
                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 rounded text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="attendant">Pump Attendant</option>
                        <option value="cashier">Cashier</option>
                        <option value="manager">Shift Supervisor</option>
                      </select>
                    </div>
                  </div>

                  {attendantFormError && (
                    <p id="attendant-form-error" className="text-rose-400" role="alert">
                      {attendantFormError.message}
                    </p>
                  )}

                  <div className="flex gap-2 pt-3 border-t border-zinc-800">
                    <button
                      type="submit"
                      className="flex-1 py-2 rounded-lg bg-amber-500 text-zinc-950 font-semibold hover:bg-amber-400 transition"
                    >
                      {editingAttendant ? "Save changes" : "Register"}
                    </button>
                    <button
                      type="button"
                      onClick={closeAttendantForm}
                      className="py-2 px-4 rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Fuel Pricing */}
        {activeTab === "pricing" && (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white text-balance">
                  <DropletIcon className="h-4 w-4 text-zinc-400" />
                  Price per liter & tank levels
                </h2>
                <p className="mt-1 text-xs text-zinc-400 text-pretty">
                  Add a grade here, or select a fuel to update its stock and price.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-zinc-700 bg-zinc-950 p-1" aria-label="Inventory report period">
                  {(["week", "month", "year"] as InventoryReportPeriod[]).map((period) => (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setInventoryReportPeriod(period)}
                      className={`rounded-md px-2.5 py-1.5 text-[11px] capitalize transition ${
                        inventoryReportPeriod === period
                          ? "bg-zinc-700 text-white"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownloadInventoryPdf()}
                  disabled={isGeneratingInventoryPdf}
                  className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isGeneratingInventoryPdf ? "Generating..." : "Print inventory PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddFuelModal(true)}
                  className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                >
                  Add fuel
                </button>
              </div>
              {inventoryPdfError && (
                <p className="mt-3 text-xs text-red-400 sm:col-span-2" role="alert">
                  {inventoryPdfError}
                </p>
              )}
            </div>

            {fuelGrades.length === 0 ? (
              <p className="rounded-xl border border-zinc-800 px-5 py-8 text-center text-sm text-zinc-400">
                No fuel grades have been added.
              </p>
            ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {fuelGrades.map((grade) => (
                <button
                  key={grade.id}
                  type="button"
                  onClick={() => setSelectedFuelGradeId(grade.id)}
                  aria-label={`Manage ${grade.name} fuel`}
                  className="flex flex-col justify-between space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: grade.color }}
                      />
                      <h3 className="text-xs font-semibold text-white">{grade.name}</h3>
                    </div>
                    <span className="text-[10px] text-zinc-400">
                      {grade.octaneOrCetane}
                    </span>
                  </div>

                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <span className="block text-xs text-zinc-400">Price per liter</span>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-400">
                      ₱{formatCurrency(grade.pricePerLiter)}
                    </p>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Tank level ({grade.tankLevelPercent}%):</span>
                      <span className="text-zinc-200 tabular-nums">
                        {formatNumber(grade.remainingLiters)} / {formatNumber(grade.tankCapacityLiters)} L
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${grade.tankLevelPercent}%`,
                          backgroundColor: grade.color,
                        }}
                      />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            )}

            {showAddFuelModal && (
              <AddFuelGradeModal
                fuelGrades={fuelGrades}
                onAddFuelGrade={onAddFuelGrade}
                onClose={() => setShowAddFuelModal(false)}
              />
            )}

            {selectedFuelGrade && (
              <FuelManagementModal
                fuelGrade={selectedFuelGrade}
                fuelBatches={fuelBatches}
                onAddFuelBatch={onAddFuelBatch}
                onUpdateFuelBatch={onUpdateFuelBatch}
                onDeleteFuelBatch={onDeleteFuelBatch}
                onUpdateFuelPrice={onUpdateFuelPrice}
                onUpdateFuelDetails={onUpdateFuelDetails}
                onDeleteFuelGrade={onDeleteFuelGrade}
                onClose={() => setSelectedFuelGradeId(null)}
              />
            )}
          </div>
        )}

        {/* Tab 4: Sales report */}
        {activeTab === "sales" && (
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
                <p className="text-sm font-medium text-zinc-400">Today&apos;s sales</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight text-emerald-400 tabular-nums md:text-5xl">
                  ₱{formatCurrency(totalSalesToday)}
                </h2>
                <p className="mt-3 text-sm text-zinc-400">
                  From {completedSalesToday.length} completed{" "}
                  {completedSalesToday.length === 1 ? "sale" : "sales"} recorded today.
                </p>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setShowTodayFuelReport(true)}
                  className="mt-5 rounded-lg border border-amber-400/50 px-3 py-2 text-sm font-medium text-amber-300 transition hover:border-amber-300 hover:bg-amber-400/10 hover:text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 active:scale-[0.98]"
                >
                  Detailed report
                </button>
                <p className="mt-8 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
                  Report totals update as sales are recorded. Session data resets when the app reloads.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <span className="text-xs text-zinc-400">Fuel sold</span>
                  <span className="mt-5 text-2xl font-semibold text-amber-300 tabular-nums">
                    {totalVolumeToday.toFixed(2)} L
                  </span>
                </div>
                <div className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <span className="text-xs text-zinc-400">Average sale</span>
                  <span className="mt-5 text-2xl font-semibold text-white tabular-nums">
                    ₱{formatCurrency(
                      completedSalesToday.length
                        ? totalSalesToday / completedSalesToday.length
                        : 0
                    )}
                  </span>
                </div>
              </div>
            </section>

            {showTodayFuelReport && (
              <ModalDialog
                title="Today's fuel sales"
                description="Completed sales grouped by fuel grade."
                onClose={() => setShowTodayFuelReport(false)}
              >
                {todayFuelSales.length > 0 ? (
                  <div className="max-h-[65dvh] overflow-y-auto px-5 py-4 sm:px-6">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[34rem] text-left text-sm">
                        <caption className="sr-only">
                          Today&apos;s sales total, volume, and transaction
                          count for each fuel grade
                        </caption>
                        <thead className="text-xs text-zinc-400">
                          <tr className="border-b border-zinc-700">
                            <th scope="col" className="px-3 py-3 font-medium">
                              Fuel
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-3 text-right font-medium"
                            >
                              Sales
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-3 text-right font-medium"
                            >
                              Volume
                            </th>
                            <th
                              scope="col"
                              className="px-3 py-3 text-right font-medium"
                            >
                              Transactions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {todayFuelSales.map((fuelSale) => (
                            <tr key={fuelSale.fuelGradeId}>
                              <th
                                scope="row"
                                className="px-3 py-3 font-medium text-zinc-100"
                              >
                                {fuelSale.fuelGradeName}
                              </th>
                              <td className="px-3 py-3 text-right tabular-nums text-emerald-300">
                                ₱{formatCurrency(fuelSale.totalAmount)}
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-zinc-200">
                                {fuelSale.totalVolumeLiters.toFixed(3)} L
                              </td>
                              <td className="px-3 py-3 text-right tabular-nums text-zinc-200">
                                {formatNumber(fuelSale.transactionCount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-zinc-700 text-sm font-semibold">
                          <tr>
                            <th scope="row" className="px-3 py-3 text-zinc-100">
                              Total
                            </th>
                            <td className="px-3 py-3 text-right tabular-nums text-emerald-300">
                              ₱{formatCurrency(totalSalesToday)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-zinc-100">
                              {totalFuelVolumeInReport.toFixed(3)} L
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-zinc-100">
                              {formatNumber(completedSalesToday.length)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="px-5 py-8 text-sm text-zinc-400 sm:px-6">
                    No fuel grades are configured yet.
                  </p>
                )}
              </ModalDialog>
            )}

            <section>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-white">Sales report</h3>
                    <p className="mt-1 text-xs text-zinc-400">
                      Fuel cost uses the actual purchase price entered for each
                      delivery, applied to sales in FIFO order.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className="flex rounded-lg border border-zinc-700 p-0.5"
                      role="group"
                      aria-label="Sales report period"
                    >
                      {(["month", "year"] as const).map((period) => (
                        <button
                          key={period}
                          type="button"
                          aria-pressed={salesReportPeriod === period}
                          onClick={() => setSalesReportPeriod(period)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
                            salesReportPeriod === period
                              ? "bg-zinc-700 text-white"
                              : "text-zinc-400 hover:text-white"
                          }`}
                        >
                          {period === "month" ? "Monthly" : "Yearly"}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadSalesReportPdf}
                      disabled={isGeneratingSalesPdf}
                      aria-busy={isGeneratingSalesPdf}
                      className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                    >
                      {isGeneratingSalesPdf ? "Generating PDF..." : "Download PDF"}
                    </button>
                  </div>
                </div>
                {salesPdfError && (
                  <p className="mt-3 text-xs text-red-300" role="alert">
                    {salesPdfError}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label={`${salesReportPeriod === "month" ? "Month" : "Year"} navigation`}
                  >
                    <button
                      type="button"
                      aria-label={`Previous ${salesReportPeriod}`}
                      onClick={() =>
                        setSalesReportDate(
                          (date) =>
                            new Date(
                              date.getFullYear(),
                              date.getMonth() -
                                (salesReportPeriod === "month" ? 1 : 12),
                              1
                            )
                        )
                      }
                      className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                    >
                      <span aria-hidden="true">
                        <ChevronRightIcon className="h-4 w-4 rotate-180" />
                      </span>
                    </button>
                    <span
                      className="min-w-28 text-center text-sm font-medium text-zinc-100 tabular-nums"
                      aria-live="polite"
                    >
                      {getSalesReportDateLabel(salesReportPeriod, salesReportDate)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Next ${salesReportPeriod}`}
                      disabled={!canAdvanceSalesReport}
                      onClick={() =>
                        setSalesReportDate(
                          (date) =>
                            new Date(
                              date.getFullYear(),
                              date.getMonth() +
                                (salesReportPeriod === "month" ? 1 : 12),
                              1
                            )
                        )
                      }
                      className="rounded-md p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
                    >
                      <span aria-hidden="true">
                        <ChevronRightIcon className="h-4 w-4" />
                      </span>
                    </button>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {salesReportPeriod === "month" ? "By day" : "By month"}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 border-y border-zinc-800 py-3 sm:grid-cols-5">
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-xs text-zinc-400">Gross income</p>
                    <p className="mt-1 text-xl font-semibold text-amber-300 tabular-nums">
                      ₱{formatCurrency(fuelCostReport.totalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">Fuel cost</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100 tabular-nums">
                      {fuelCostReport.fuelCost === null
                        ? "Incomplete"
                        : `₱${formatCurrency(fuelCostReport.fuelCost)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">Net income</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100 tabular-nums">
                      {fuelCostReport.netIncome === null
                        ? "Incomplete"
                        : `₱${formatCurrency(fuelCostReport.netIncome)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">Fuel sold</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100 tabular-nums">
                      {salesReport.totalVolumeLiters.toFixed(2)} L
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-400">Transactions</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100 tabular-nums">
                      {formatNumber(salesReport.transactionCount)}
                    </p>
                  </div>
                </div>

                {fuelCostReport.fuelGradesMissingCost.length > 0 && (
                  <p className="mt-3 text-xs text-amber-200" role="note">
                    Fuel cost and net income are incomplete because recorded
                    delivery quantities or purchase costs are missing for:{" "}
                    {fuelCostReport.fuelGradesMissingCost.join(", ")}.
                  </p>
                )}

                <div className="mt-4">
                  <h4 className="text-sm font-medium text-zinc-200">
                    {salesReportPeriod === "month"
                      ? "Daily sales"
                      : "Monthly sales"}
                  </h4>
                  <div
                    className="relative mt-3 h-36"
                    role="img"
                    aria-label={`${salesReportPeriod === "month" ? "Daily" : "Monthly"} sales for ${getSalesReportDateLabel(salesReportPeriod, salesReportDate)}. Total ₱${formatCurrency(salesReport.totalAmount)} from ${salesReport.transactionCount} completed transactions.`}
                  >
                    <div className="absolute inset-0 grid grid-rows-3" aria-hidden="true">
                      <div className="border-t border-zinc-800" />
                      <div className="border-t border-zinc-800" />
                      <div className="border-t border-zinc-700" />
                    </div>
                    <div className="absolute inset-0 grid grid-cols-[3.5rem_minmax(0,1fr)]" aria-hidden="true">
                      <div className="flex h-full flex-col justify-between text-[11px] text-zinc-500 tabular-nums">
                        <span>₱{formatCurrency(salesChartScaleMaximum)}</span>
                        <span>₱{formatCurrency(salesChartScaleMaximum / 2)}</span>
                        <span>₱0.00</span>
                      </div>
                      <div className="flex h-full items-end gap-px sm:gap-1">
                        {salesReport.buckets.map((bucket) => (
                          <div
                            key={bucket.dateKey}
                            className="flex h-full min-w-0 flex-1 items-end"
                            title={`${bucket.label}: ₱${formatCurrency(bucket.totalAmount)}, ${bucket.transactionCount} transactions`}
                          >
                            <div
                              className={`w-full rounded-t-sm ${
                                bucket.totalAmount > 0
                                  ? "bg-amber-400"
                                  : "bg-zinc-800/70"
                              }`}
                              style={{
                                height: salesChartScaleMaximum
                                  ? `${(bucket.totalAmount / salesChartScaleMaximum) * 100}%`
                                  : "0%",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-[3.5rem_minmax(0,1fr)] text-[11px] text-zinc-500 tabular-nums">
                    <span aria-hidden="true" />
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `repeat(${salesReport.buckets.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {salesReport.buckets.map((bucket, index) => (
                        <span
                          key={bucket.dateKey}
                          className="text-center"
                        >
                          {isSalesReportTick(
                            index,
                            salesReportPeriod,
                            salesReport.buckets.length
                          )
                            ? bucket.label
                            : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                  {salesReport.transactionCount === 0 && (
                    <p className="mt-3 text-xs text-zinc-500">
                      No completed sales in this period.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div className="p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Attendant sales ranking</h3>
                    <p className="mt-1 text-xs text-zinc-400">Completed sales ranked by gross income.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-zinc-700 p-0.5" role="group" aria-label="Attendant ranking period">
                      {(["today", "month", "year"] as const).map((period) => (
                        <button key={period} type="button" aria-pressed={attendantRankingPeriod === period} onClick={() => setAttendantRankingPeriod(period)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${attendantRankingPeriod === period ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                          {period === "today" ? "Today" : period === "month" ? "This month" : "This year"}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={handleDownloadRankingPdf} disabled={isGeneratingRankingPdf} className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-60">
                      {isGeneratingRankingPdf ? "Generating ranking PDF..." : "Download ranking PDF"}
                    </button>
                  </div>
                </div>
                {rankingPdfError && <p className="mt-3 text-xs text-red-300" role="alert">{rankingPdfError}</p>}
                {attendantRanking.length === 0 ? (
                  <p className="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-500">No completed attendant sales for this period.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-zinc-500"><tr><th className="pb-2">Rank</th><th className="pb-2">Attendant</th><th className="pb-2 text-right">Sales</th><th className="pb-2 text-right">Volume</th><th className="pb-2 text-right">Gross</th></tr></thead>
                      <tbody className="divide-y divide-zinc-800 text-zinc-300">
                        {attendantRanking.map((row) => (
                          <tr key={row.attendantBadge}><td className="py-2 font-semibold text-amber-400">#{row.rank}</td><td className="py-2"><span className="font-medium text-white">{row.attendantName}</span><span className="ml-2 text-zinc-500">{row.attendantBadge}</span></td><td className="py-2 text-right tabular-nums">{formatNumber(row.transactionCount)}</td><td className="py-2 text-right tabular-nums">{row.totalVolumeLiters.toFixed(2)} L</td><td className="py-2 text-right font-semibold text-white tabular-nums">₱{formatCurrency(row.totalAmount)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
      {showChangePinModal && canChangePin ? (
        <ChangePinModal onClose={() => setShowChangePinModal(false)} />
      ) : null}
      {showResetStationModal && isOwner ? (
        <ModalDialog
          title="Reset all station data?"
          description="This action cannot be undone. Confirm what will be removed before continuing."
          onClose={closeResetStationModal}
          dialogClassName="max-w-xl"
        >
          <form onSubmit={handleResetStation} className="space-y-5 overflow-y-auto p-5 sm:p-6">
            <div className="space-y-2 text-sm text-zinc-300">
              <p>
                This permanently removes fuel grades, delivery batches, sales history, shift totals,
                and all attendant accounts and PINs other than your owner account.
              </p>
              <p className="text-xs text-zinc-400">
                Your owner login, station name and location, and attendant permissions will be kept.
              </p>
            </div>
            <div>
              <label
                htmlFor="reset-station-confirmation"
                className="mb-2 block text-sm font-medium text-zinc-200"
              >
                Type RESET to confirm
              </label>
              <input
                id="reset-station-confirmation"
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
                aria-describedby="reset-station-confirmation-help"
                disabled={isResettingStation}
                required
                autoComplete="off"
                className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-70"
              />
              <p
                id="reset-station-confirmation-help"
                className="mt-2 text-xs text-zinc-400"
              >
                Enter RESET exactly to enable the permanent reset.
              </p>
            </div>
            {resetError && (
              <p id="reset-station-error" className="text-sm text-rose-300" role="alert" aria-live="assertive">
                {resetError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeResetStationModal}
                disabled={isResettingStation}
                className="min-h-11 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetConfirmation !== "RESET" || isResettingStation}
                className="min-h-11 rounded-lg border border-rose-700 bg-rose-950/60 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResettingStation ? "Resetting..." : "Reset all data"}
              </button>
            </div>
          </form>
        </ModalDialog>
      ) : null}
    </div>
  );
};
