"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FuelGrade,
  AttendantAccount,
  AttendantPermissions,
  Transaction,
  ShiftState,
  FuelBatch,
  NewFuelBatch,
  NewFuelGrade,
} from "./types/pos";
import { AttendantPOS } from "./components/AttendantPOS";
import { AdminPortal } from "./components/AdminPortal";
import { ShiftLoginModal } from "./components/ShiftLoginModal";
import {
  addDeliveryToFuelGrade,
  createFuelGradeId,
  deleteDeliveryBatch,
  editDeliveryBatch,
  validateDeliveryBatch,
} from "./lib/fuelManagement";
import { createUuid } from "./lib/id";
import type { StationState } from "./lib/stationMutations";
import { DEFAULT_STATION_PERMISSIONS } from "./lib/stationState";

interface AuthSession {
  attendantId: string;
  stationId: string;
  role: string;
}

type StationResponse = StationState & { version: number };

async function loadStationSnapshot(role: string): Promise<StationResponse> {
  let response = await fetch("/api/station", { cache: "no-store" });
  if (response.status === 404 && role === "owner") {
    const bootstrapResponse = await fetch("/api/station", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bootstrap" }),
    });
    if (!bootstrapResponse.ok && bootstrapResponse.status !== 409) {
      throw new Error("Unable to initialize station data.");
    }
    response = await fetch("/api/station", { cache: "no-store" });
  }

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "Station setup is unavailable for this account."
        : "Unable to load station data."
    );
  }

  return (await response.json()) as StationResponse;
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<"loading" | "signed-out" | "signed-in" | "error">("loading");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authError, setAuthError] = useState("");
  const [stationVersion, setStationVersion] = useState(0);
  const stationVersionRef = useRef(0);
  const [stationName, setStationName] = useState("LE-AR FUEL STATION");
  const [stationLocation, setStationLocation] = useState("Station location");
  const [saveError, setSaveError] = useState("");

  // Fuel Station Master State
  const [fuelGrades, setFuelGrades] = useState<FuelGrade[]>([]);
  const [fuelBatches, setFuelBatches] = useState<FuelBatch[]>([]);
  const [attendants, setAttendants] = useState<AttendantAccount[]>([]);
  const [permissions, setPermissions] = useState<AttendantPermissions>(DEFAULT_STATION_PERMISSIONS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shiftState, setShiftState] = useState<ShiftState>({
    totalSalesAmount: 0,
    totalLitersDispensed: 0,
    transactionsCount: 0,
    cashInDrawer: 0,
  });
  const [currentAttendant, setCurrentAttendant] = useState<AttendantAccount | null>(null);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth", { cache: "no-store" });
        if (response.status === 401) {
          if (active) setAuthStatus("signed-out");
          return;
        }
        if (!response.ok) throw new Error("Unable to verify the current session.");

        const session = (await response.json()) as AuthSession;
        const station = await loadStationSnapshot(session.role);
        const attendant = station.attendants.find(
          (item) => item.id === session.attendantId
        );
        if (!attendant) throw new Error("This account is not an active station attendant.");

        if (active) {
          setFuelGrades(station.fuelGrades);
          setFuelBatches(station.fuelBatches);
          setAttendants(station.attendants);
          setPermissions(station.permissions);
          setTransactions(station.transactions);
          setShiftState(station.shiftState);
          setStationName(station.stationName);
          setStationLocation(station.stationLocation);
          setStationVersion(station.version);
          setCurrentAttendant(attendant);
          setAuthSession(session);
          setAuthStatus("signed-in");
        }
      } catch (error) {
        if (active) {
          setAuthError(error instanceof Error ? error.message : "Unable to load the station.");
          setAuthStatus("error");
        }
      }
    };

    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  const applyStationResponse = useCallback((station: StationResponse) => {
    setFuelGrades(station.fuelGrades);
    setFuelBatches(station.fuelBatches);
    setAttendants(station.attendants);
    setPermissions(station.permissions);
    setTransactions(station.transactions);
    setShiftState(station.shiftState);
    setStationName(station.stationName);
    setStationLocation(station.stationLocation);
    stationVersionRef.current = station.version;
    setStationVersion(station.version);
  }, []);

  useEffect(() => {
    if (!authSession || !["owner", "manager"].includes(authSession.role)) return;

    let refreshInProgress = false;
    const refreshStation = async () => {
      if (refreshInProgress || document.visibilityState === "hidden") return;
      refreshInProgress = true;
      try {
        const station = await loadStationSnapshot(authSession.role);
        if (station.version !== stationVersionRef.current) {
          applyStationResponse(station);
        }
      } catch {
        // Keep the last usable station snapshot when a refresh is unavailable.
      } finally {
        refreshInProgress = false;
      }
    };

    const intervalId = window.setInterval(refreshStation, 5000);
    window.addEventListener("focus", refreshStation);
    document.addEventListener("visibilitychange", refreshStation);
    void refreshStation();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshStation);
      document.removeEventListener("visibilitychange", refreshStation);
    };
  }, [authSession, applyStationResponse]);

  const handleInitialLogin = async () => {
    const response = await fetch("/api/auth", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to verify the signed-in account.");

    const session = (await response.json()) as AuthSession;
    const station = await loadStationSnapshot(session.role);
    const activeAttendant = station.attendants.find(
      (item) => item.id === session.attendantId
    );
    if (!activeAttendant) throw new Error("This account is not an active station attendant.");

    applyStationResponse(station);
    setCurrentAttendant(activeAttendant);
    setAuthSession(session);
    setAuthStatus("signed-in");
  };

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Unable to sign out.");
      }

      setAuthSession(null);
      setCurrentAttendant(null);
      setSaveError("");
      setAuthStatus("signed-out");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  if (authStatus === "loading") {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        Connecting to station...
      </main>
    );
  }

  if (authStatus === "signed-out") {
    return (
      <ShiftLoginModal
        isOpen
        onLogin={handleInitialLogin}
      />
    );
  }

  if (authStatus === "error") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center text-sm text-zinc-200">
        <p role="alert">{authError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded border border-zinc-700 px-3 py-2 text-zinc-200 hover:bg-zinc-900"
        >
          Retry
        </button>
      </main>
    );
  }

  if (!authSession || !currentAttendant) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-zinc-950 px-4 text-center text-sm text-zinc-200">
        <p role="alert">Unable to load the signed-in station account.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded border border-zinc-700 px-3 py-2 text-zinc-200 hover:bg-zinc-900"
        >
          Retry
        </button>
      </main>
    );
  }

  const persistManagerState = async (state: StationState) => {
    if (!authSession || !["owner", "manager"].includes(authSession.role)) {
      setSaveError("Manager access is required to save station settings.");
      return;
    }

    setSaveError("");
    try {
      const response = await fetch("/api/station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace",
          state,
          expectedVersion: stationVersion,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          const latest = await loadStationSnapshot(authSession.role);
          applyStationResponse(latest);
        }
        throw new Error(result.error ?? "Unable to save station settings.");
      }
      applyStationResponse(result as StationResponse);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save station settings."
      );
    }
  };

  const commitManagerState = (changes: Partial<StationState>) => {
    const nextState: StationState = {
      stationName,
      stationLocation,
      fuelGrades,
      fuelBatches,
      attendants,
      permissions,
      transactions,
      shiftState,
      ...changes,
    };
    applyStationResponse({ ...nextState, version: stationVersion });
    void persistManagerState(nextState);
  };

  // Handler: Register Sale from Attendant Numpad
  const handleRegisterSale = async (newTx: Transaction) => {
    const response = await fetch("/api/station", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sale",
        sale: {
          fuelGradeId: newTx.fuelGradeId,
          volumeLiters: newTx.volumeLiters,
          paymentMethod: newTx.paymentMethod,
          tenderedAmount: newTx.tenderedAmount,
          plateNumber: newTx.plateNumber,
        },
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to register sale.");
    applyStationResponse(result as StationResponse);
  };

  const handleUpdatePermissions = (newPerms: AttendantPermissions) => {
    commitManagerState({ permissions: newPerms });
  };

  const handleUpdateFuelPrice = (gradeId: string, newPrice: number): string | null => {
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      return "Enter a price greater than zero.";
    }

    if (!fuelGrades.some((grade) => grade.id === gradeId)) {
      return "The selected fuel grade no longer exists.";
    }

    commitManagerState({
      fuelGrades: fuelGrades.map((grade) =>
        grade.id === gradeId ? { ...grade, pricePerLiter: newPrice } : grade
      ),
    });
    return null;
  };

  const handleUpdateFuelDetails = (updatedGrade: FuelGrade): string | null => {
    const normalizedName = updatedGrade.name.trim().toLowerCase();
    const normalizedCode = updatedGrade.code.trim().toLowerCase();
    const duplicate = fuelGrades.find(
      (grade) =>
        grade.id !== updatedGrade.id &&
        (grade.name.trim().toLowerCase() === normalizedName ||
          grade.code.trim().toLowerCase() === normalizedCode)
    );
    if (duplicate) return "Fuel name and code must be unique.";

    commitManagerState({
      fuelGrades: fuelGrades.map((grade) =>
        grade.id === updatedGrade.id ? updatedGrade : grade
      ),
    });
    return null;
  };

  const handleAddFuelGrade = (newGrade: NewFuelGrade): string | null => {
    const normalizedName = newGrade.name.trim().toLowerCase();
    const normalizedCode = newGrade.code.trim().toLowerCase();
    const duplicateGrade = fuelGrades.some(
      (grade) =>
        grade.name.trim().toLowerCase() === normalizedName ||
        grade.code.trim().toLowerCase() === normalizedCode
    );
    if (duplicateGrade) {
      return "Fuel name and code must be unique.";
    }

    commitManagerState({
      fuelGrades: [
        ...fuelGrades,
      {
        ...newGrade,
        id: createFuelGradeId(
          newGrade.code,
          fuelGrades.map((grade) => grade.id)
        ),
        tankLevelPercent: 0,
        remainingLiters: 0,
      },
      ],
    });
    return null;
  };

  const handleAddFuelBatch = (newBatch: NewFuelBatch): string | null => {
    const validationError = validateDeliveryBatch(newBatch);
    if (validationError) return validationError;

    const grade = fuelGrades.find((item) => item.id === newBatch.fuelGradeId);
    if (!grade) {
      return "Select an available fuel grade.";
    }

    let updatedGrade: FuelGrade;
    try {
      updatedGrade = addDeliveryToFuelGrade(grade, newBatch.liters);
    } catch (error) {
      if (error instanceof RangeError) {
        return error.message;
      }
      throw error;
    }

    commitManagerState({
      fuelGrades: fuelGrades.map((item) =>
        item.id === updatedGrade.id ? updatedGrade : item
      ),
      fuelBatches: [
        { ...newBatch, id: createUuid() },
        ...fuelBatches,
      ],
    });
    return null;
  };

  const handleUpdateFuelBatch = (updatedBatch: FuelBatch): string | null => {
    const grade = fuelGrades.find(
      (item) => item.id === updatedBatch.fuelGradeId
    );
    if (!grade) return "The selected fuel grade no longer exists.";

    try {
      const result = editDeliveryBatch(grade, fuelBatches, updatedBatch);
      commitManagerState({
        fuelGrades: fuelGrades.map((item) =>
          item.id === result.fuelGrade.id ? result.fuelGrade : item
        ),
        fuelBatches: result.fuelBatches,
      });
    } catch (error) {
      if (error instanceof RangeError) return error.message;
      throw error;
    }

    return null;
  };

  const handleDeleteFuelBatch = (batchId: string): string | null => {
    const batch = fuelBatches.find((item) => item.id === batchId);
    if (!batch) return "The selected delivery batch no longer exists.";

    const grade = fuelGrades.find((item) => item.id === batch.fuelGradeId);
    if (!grade) return "The selected fuel grade no longer exists.";

    try {
      const result = deleteDeliveryBatch(grade, fuelBatches, batchId);
      commitManagerState({
        fuelGrades: fuelGrades.map((item) =>
          item.id === result.fuelGrade.id ? result.fuelGrade : item
        ),
        fuelBatches: result.fuelBatches,
      });
    } catch (error) {
      if (error instanceof RangeError) return error.message;
      throw error;
    }

    return null;
  };

  const handleDeleteFuelGrade = (gradeId: string): string | null => {
    if (!fuelGrades.some((grade) => grade.id === gradeId)) {
      return "The selected fuel grade no longer exists.";
    }

    commitManagerState({
      fuelGrades: fuelGrades.filter((grade) => grade.id !== gradeId),
      fuelBatches: fuelBatches.filter((batch) => batch.fuelGradeId !== gradeId),
    });
    return null;
  };

  const handleAddAttendant = async (newAtt: AttendantAccount, pin: string) => {
    try {
      const response = await fetch("/api/attendants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendant: newAtt, pin }),
      });
      const result = await response.json();
      if (!response.ok) {
        setSaveError(result.error ?? "Unable to create attendant account.");
        return;
      }
      applyStationResponse(result as StationResponse);
    } catch {
      setSaveError("Unable to reach the attendant service.");
    }
  };

  const handleUpdateAttendant = async (
    updatedAttendant: AttendantAccount,
    pin?: string
  ) => {
    if (updatedAttendant.role === "owner") return;
    if (pin) {
      const response = await fetch("/api/attendants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendantId: updatedAttendant.id, pin }),
      });
      const result = await response.json();
      if (!response.ok) {
        setSaveError(result.error ?? "Unable to reset attendant PIN.");
        return;
      }
    }
    if (currentAttendant.id === updatedAttendant.id) {
      setCurrentAttendant(updatedAttendant);
    }
    commitManagerState({
      attendants: attendants.map((att) =>
        att.id === updatedAttendant.id && att.role !== "owner"
          ? updatedAttendant
          : att
      ),
    });
  };

  const handleDeleteAttendant = async (attendantId: string) => {
    try {
      const response = await fetch(
        `/api/attendants?id=${encodeURIComponent(attendantId)}`,
        { method: "DELETE" }
      );
      const result = await response.json();
      if (!response.ok) {
        setSaveError(result.error ?? "Unable to delete attendant account.");
        return;
      }
      applyStationResponse(result as StationResponse);
    } catch {
      setSaveError("Unable to reach the attendant service.");
    }
  };

  const handleResetStation = async () => {
    const response = await fetch("/api/station", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reset",
        expectedVersion: stationVersion,
      }),
    });
    const result = (await response.json()) as StationResponse & { error?: string };
    if (!response.ok) {
      throw new Error(result.error ?? "Unable to reset station data.");
    }
    applyStationResponse(result);
  };

  const handleToggleAttendantStatus = (attId: string) => {
    commitManagerState({
      attendants: attendants.map((att) =>
        att.id === attId && att.role !== "owner"
          ? { ...att, active: !att.active }
          : att
      ),
    });
  };

  const canManage = ["owner", "manager"].includes(authSession.role);

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 font-sans">
      {saveError && (
        <p className="border-b border-rose-900 bg-rose-950/60 px-4 py-2 text-xs text-rose-200" role="alert">
          {saveError}
        </p>
      )}

      {canManage ? (
        <AdminPortal
          canChangePin={authSession.role === "owner"}
          isOwner={authSession.role === "owner"}
          stationName={stationName}
          stationLocation={stationLocation}
          onUpdateStation={(name, location) => commitManagerState({ stationName: name, stationLocation: location })}
          fuelGrades={fuelGrades}
          fuelBatches={fuelBatches}
          attendants={attendants}
          permissions={permissions}
          transactions={transactions}
          onUpdatePermissions={handleUpdatePermissions}
          onUpdateFuelPrice={handleUpdateFuelPrice}
          onUpdateFuelDetails={handleUpdateFuelDetails}
          onAddFuelGrade={handleAddFuelGrade}
          onAddFuelBatch={handleAddFuelBatch}
          onUpdateFuelBatch={handleUpdateFuelBatch}
          onDeleteFuelBatch={handleDeleteFuelBatch}
          onDeleteFuelGrade={handleDeleteFuelGrade}
          onAddAttendant={handleAddAttendant}
          onUpdateAttendant={handleUpdateAttendant}
          onDeleteAttendant={handleDeleteAttendant}
          onToggleAttendantStatus={handleToggleAttendantStatus}
          onSignOut={handleSignOut}
          onResetStation={handleResetStation}
        />
      ) : (
        <AttendantPOS
          fuelGrades={fuelGrades}
          currentAttendant={currentAttendant}
          permissions={permissions}
          transactions={transactions}
          shiftState={shiftState}
          stationName={stationName}
          stationLocation={stationLocation}
          onRegisterSale={handleRegisterSale}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}
