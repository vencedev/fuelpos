"use client";

import React, { useState } from "react";
import { CheckIcon, LockIcon } from "./Icons";

interface ShiftLoginModalProps {
  isOpen: boolean;
  onLogin: () => void | Promise<void>;
}

export const ShiftLoginModal: React.FC<ShiftLoginModalProps> = ({
  isOpen,
  onLogin,
}) => {
  const [badgeId, setBadgeId] = useState("");
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const canSubmit =
    /^[a-z0-9-]{2,32}$/i.test(badgeId.trim()) &&
    /^\d{4,6}$/.test(pin) &&
    !isSubmitting;

  const handleAuthenticate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ badgeId: badgeId.trim(), pin }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrorMsg(result.error ?? "Unable to sign in.");
        setPin("");
        return;
      }

      await onLogin();
      setPin("");
      setErrorMsg("");
    } catch (error) {
      setErrorMsg(
        error instanceof Error
          ? error.message
          : "Authentication service is unavailable."
      );
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <form
        onSubmit={handleAuthenticate}
        aria-busy={isSubmitting}
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-zinc-100 shadow-2xl"
      >
        <div className="mb-5 flex items-center gap-3 border-b border-zinc-800 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300">
            <LockIcon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Sign in to LE-AR FUEL STATION</h1>
            <p className="text-xs text-zinc-400">Enter your station badge and PIN.</p>
          </div>
        </div>

        <label htmlFor="badge-id" className="mb-1.5 block text-xs text-zinc-300">
          Badge ID
        </label>
        <input
          id="badge-id"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="characters"
          autoFocus
          maxLength={32}
          required
          value={badgeId}
          aria-describedby={errorMsg ? "login-error" : undefined}
          aria-invalid={Boolean(errorMsg)}
          onChange={(event) => {
            setBadgeId(event.target.value);
            setErrorMsg("");
          }}
          className="mb-4 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        />

        <label htmlFor="pin" className="mb-1.5 block text-xs text-zinc-300">
          PIN
        </label>
        <input
          id="pin"
          name="password"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={6}
          pattern="[0-9]{4,6}"
          required
          value={pin}
          aria-describedby={errorMsg ? "login-error" : undefined}
          aria-invalid={Boolean(errorMsg)}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, "").slice(0, 6));
            setErrorMsg("");
          }}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm tracking-[0.3em] text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
        />
        {errorMsg ? (
          <p id="login-error" role="alert" className="mt-2 text-xs text-rose-400">
            {errorMsg}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:border disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          <CheckIcon className="h-4 w-4" />
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
};
