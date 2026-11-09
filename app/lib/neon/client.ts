import { cookies } from "next/headers";
import { neonSql } from "./server";
import { deriveAttendantPassword } from "./authPassword";
import { getSession, hashPassword, SESSION_COOKIE, signSession, verifyPassword } from "./auth";

type ClientRow = Record<string, unknown>;

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private operation: "select" | "insert" | "update" = "select";
  private values: Record<string, unknown> = {};
  private filters: Array<[string, unknown]> = [];
  private selected = "*";

  constructor(private table: string) {}
  select(columns = "*") { this.selected = columns; return this; }
  insert(values: Record<string, unknown>) { this.operation = "insert"; this.values = values; return this; }
  update(values: Record<string, unknown>) { this.operation = "update"; this.values = values; return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  delete() { throw new Error("Use Neon's direct data layer for deletes."); }

  async execute(): Promise<{ data: unknown; error: unknown }> {
    try {
      const keys = Object.keys(this.values);
      let text = "";
      const params: unknown[] = [];
      if (this.operation === "insert") {
        params.push(...keys.map((key) => this.values[key]));
        text = `insert into public.${this.table} (${keys.join(", ")}) values (${keys.map((_, index) => `$${index + 1}`).join(", ")}) returning ${this.selected}`;
      } else if (this.operation === "update") {
        params.push(...keys.map((key) => this.values[key]));
        text = `update public.${this.table} set ${keys.map((key, index) => `${key} = $${index + 1}`).join(", ")} where 1=1`;
        this.filters.forEach(([key, value], index) => {
          params.push(value);
          text += ` and ${key} = $${params.length}`;
        });
        text += ` returning ${this.selected}`;
      } else {
        text = `select ${this.selected} from public.${this.table} where 1=1`;
        this.filters.forEach(([key, value]) => {
          params.push(value);
          text += ` and ${key} = $${params.length}`;
        });
      }
      const rows = await neonSql().query(text, params);
      return { data: rows, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
  async maybeSingle() {
    const result = await this.execute();
    const rows = result.data as ClientRow[] | null;
    return { data: rows?.[0] ?? null, error: result.error };
  }
  async single() {
    const result = await this.execute();
    const rows = result.data as ClientRow[] | null;
    return { data: rows?.[0] ?? null, error: rows && rows.length === 1 ? result.error : new Error("Expected one row") };
  }
  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) { return this.execute().then(onfulfilled, onrejected); }
}

export function createNeonAdminClient() {
  return {
    from(table: string) { return new QueryBuilder(table); },
    auth: {
      admin: {
        async createUser(input: { email: string; password: string; email_confirm?: boolean; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }) {
          try {
            const badgeId = input.email.split("@")[0].toUpperCase();
            const metadata = input.app_metadata ?? {};
            const userId = globalThis.crypto.randomUUID();
            await neonSql().query(`insert into public.fuelpos_station_credentials (user_id, station_id, attendant_id, badge_id, password_hash, role) values ($1::uuid, $2::uuid, $3, $4, $5, $6)`, [userId, metadata.station_id, metadata.attendant_id, badgeId, hashPassword(input.password), metadata.role]);
            return { data: { user: { id: userId, email: input.email, app_metadata: metadata, user_metadata: input.user_metadata ?? {}, created_at: new Date().toISOString() } }, error: null };
          } catch (error) { return { data: { user: null }, error }; }
        },
        async updateUserById(userId: string, input: { password?: string }) {
          try {
            await neonSql().query("update public.fuelpos_station_credentials set password_hash = $2 where user_id = $1::uuid", [userId, input.password ? hashPassword(input.password) : ""]);
            return { error: null };
          } catch (error) { return { error }; }
        },
        async deleteUser(userId: string) {
          try { await neonSql().query("delete from public.fuelpos_station_credentials where user_id = $1::uuid", [userId]); return { error: null }; }
          catch (error) { return { error }; }
        },
        async listUsers(_options?: { page?: number; perPage?: number }) {
          const rows = await neonSql().query("select user_id::text as id, station_id::text, attendant_id, badge_id, role from public.fuelpos_station_credentials");
          return { data: { users: rows.map((row) => ({ id: row.id, app_metadata: { station_id: row.station_id, attendant_id: row.attendant_id, role: row.role } })) }, error: null };
        },
      },
    },
  };
}

export async function createNeonServerClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const badgeId = email.split("@")[0].toUpperCase();
        const rows = await neonSql().query("select user_id::text as id, station_id::text, attendant_id, role, password_hash from public.fuelpos_station_credentials where badge_id = $1", [badgeId]);
        const row = rows[0] as (ClientRow & { password_hash: string; id: string; station_id: string; attendant_id: string; role: string }) | undefined;
        if (!row || !verifyPassword(password, row.password_hash)) return { data: { user: null }, error: new Error("Invalid credentials") };
        const identity = { userId: row.id, stationId: row.station_id, attendantId: row.attendant_id, role: row.role };
        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE, signSession(identity), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
        return { data: { user: { id: row.id, email, app_metadata: { station_id: row.station_id, attendant_id: row.attendant_id, role: row.role } } }, error: null };
      },
      async signOut() {
        (await cookies()).delete(SESSION_COOKIE);
        return { error: null };
      },
      async getUser() {
        const identity = await getSession();
        return { data: { user: identity ? { id: identity.userId, app_metadata: identity, user_metadata: {}, created_at: new Date(0).toISOString() } : null }, error: identity ? null : new Error("Unauthenticated") };
      },
      async updateUser() { return { error: null }; },
    },
  };
}

export async function getAuthenticatedNeon() {
  const identity = await getSession();
  if (!identity) return { data: null, error: new Error("Authentication required") };
  return {
    data: {
      user: { id: identity.userId, email: "", app_metadata: identity, user_metadata: {} as Record<string, unknown>, created_at: new Date(0).toISOString() },
      claims: { appMetadata: { station_id: identity.stationId, attendant_id: identity.attendantId, role: identity.role } },
      neon: createNeonAdminClient(),
    },
    error: null,
  };
}
