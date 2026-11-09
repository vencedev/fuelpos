import { createHmac } from "node:crypto";

export function deriveAttendantPassword(badgeId: string, pin: string): string {
  const pepper = process.env.FUELPOS_AUTH_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("FUELPOS_AUTH_PEPPER must contain at least 32 characters.");
  }

  return createHmac("sha256", pepper)
    .update(`${badgeId.trim().toUpperCase()}:${pin}`)
    .digest("hex");
}
