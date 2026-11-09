import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { neonSql } from "./server";

export const SESSION_COOKIE = "fuelpos_session";

export type FuelPosIdentity = {
  stationId: string;
  attendantId: string;
  role: string;
  userId: string;
};

function secret(): string {
  const value = process.env.FUELPOS_AUTH_PEPPER;
  if (!value || value.length < 32) throw new Error("FUELPOS_AUTH_PEPPER must contain at least 32 characters.");
  return value;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
}

export function signSession(identity: FuelPosIdentity): string {
  const payload = Buffer.from(JSON.stringify(identity)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token: string): FuelPosIdentity | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const identity = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as FuelPosIdentity;
    if (!identity.stationId || !identity.attendantId || !identity.role || !identity.userId) return null;
    return identity;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<FuelPosIdentity | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
}

export async function ensureSchema(): Promise<void> {
  await neonSql().query(`
    create table if not exists public.fuelpos_station_credentials (
      user_id uuid primary key,
      station_id uuid not null references public.fuelpos_station_state(station_id) on delete cascade,
      attendant_id text not null,
      badge_id text not null,
      password_hash text not null,
      role text not null,
      unique (station_id, badge_id)
    );
  `);
}
