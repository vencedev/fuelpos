"use client";

import React, { useState } from "react";
import { ModalDialog } from "./FuelManagementModal";

export function ChangePinModal({ onClose }: { onClose: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const canSubmit =
    /^\d{4,6}$/.test(currentPin) &&
    /^\d{4,6}$/.test(newPin) &&
    newPin !== currentPin &&
    confirmPin === newPin &&
    !isSubmitting;

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin, confirmPin }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(result.error ?? "Unable to update the admin PIN.");
        setCurrentPin("");
        return;
      }

      setIsComplete(true);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to reach the authentication service."
      );
      setCurrentPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalDialog
      title="Change admin PIN"
      description="Verify your current PIN, then choose a new 4–6 digit PIN."
      onClose={handleClose}
      dialogClassName="max-w-md"
    >
      {isComplete ? (
        <div className="space-y-4 p-5 sm:p-6">
          <p role="status" className="text-sm text-emerald-300">
            Your admin PIN has been updated. You can keep using this session.
          </p>
          <button
            type="button"
            onClick={handleClose}
            autoFocus
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            Done
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-busy={isSubmitting}
          className="space-y-4 p-5 sm:p-6"
        >
          <p id="pin-guidance" className="text-xs text-zinc-400">
            Use 4–6 digits. The new PIN must differ from the current PIN and match the confirmation.
          </p>
          <div>
            <label htmlFor="current-admin-pin" className="mb-1.5 block text-xs text-zinc-300">
              Current PIN
            </label>
            <input
              id="current-admin-pin"
              name="currentPin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              pattern="[0-9]{4,6}"
              required
              aria-describedby={errorMessage ? "pin-error pin-guidance" : "pin-guidance"}
              aria-invalid={Boolean(errorMessage)}
              value={currentPin}
              onChange={(event) => {
                setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 6));
                setErrorMessage("");
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm tracking-[0.3em] text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <div>
            <label htmlFor="new-admin-pin" className="mb-1.5 block text-xs text-zinc-300">
              New PIN
            </label>
            <input
              id="new-admin-pin"
              name="newPin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              pattern="[0-9]{4,6}"
              required
              aria-describedby={errorMessage ? "pin-error pin-guidance" : "pin-guidance"}
              aria-invalid={Boolean(errorMessage)}
              value={newPin}
              onChange={(event) => {
                setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6));
                setErrorMessage("");
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm tracking-[0.3em] text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>

          <div>
            <label htmlFor="confirm-admin-pin" className="mb-1.5 block text-xs text-zinc-300">
              Confirm new PIN
            </label>
            <input
              id="confirm-admin-pin"
              name="confirmPin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              pattern="[0-9]{4,6}"
              required
              aria-describedby={errorMessage ? "pin-error pin-guidance" : "pin-guidance"}
              aria-invalid={Boolean(errorMessage)}
              value={confirmPin}
              onChange={(event) => {
                setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6));
                setErrorMessage("");
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm tracking-[0.3em] text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>

          {errorMessage ? (
            <p id="pin-error" role="alert" aria-live="assertive" className="text-xs text-rose-400">
              {errorMessage}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:border disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {isSubmitting ? "Updating PIN..." : "Update PIN"}
          </button>
        </form>
      )}
    </ModalDialog>
  );
}
