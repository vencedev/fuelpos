# LE-AR FUEL STATION

FuelPOS is a Next.js point-of-sale and station-management app backed by Neon Postgres. The app includes its own badge/PIN authentication; Neon Auth is not used.

## Requirements

- Node.js supported by the installed Next.js version.
- A Neon Postgres database.

## Local setup

1. Install the locked dependencies with `npm ci`.
2. Create `.env.local` with:

   | Variable | Required | Purpose |
   | --- | --- | --- |
   | `NEON_DATABASE_URL` | Yes | Neon Postgres connection string. Use the pooled connection string for app traffic. |
   | `FUELPOS_AUTH_PEPPER` | Yes | Stable server-only secret, at least 32 characters. Keep it unchanged after provisioning or existing PIN credentials will stop working. |

   Generate a pepper with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Never commit `.env.local` or expose either value to client-side code.
3. Apply the SQL files in `neon/migrations/` to the target database in filename order.
4. Provision the initial owner once from a trusted machine. Add `FUELPOS_OWNER_PIN` (4–6 digits) to `.env.local`, then run `npm run provision:owner`. Optionally set `FUELPOS_OWNER_BADGE_ID` (defaults to `ADMIN`) and `FUELPOS_STATION_ID` (otherwise a new ID is generated and printed). The script creates the initial station and owner account; do not run it again against an existing station.
5. Start the development server with `npm run dev`, then sign in with the configured owner badge and PIN.

## Production deployment

Deploy this as a Node.js Next.js application with server-side route-handler support; it is not a static export. Configure `NEON_DATABASE_URL` and `FUELPOS_AUTH_PEPPER` as server-only production environment variables, apply the migrations to the production database, and provision the owner exactly once before opening the app to users. Do not configure `FUELPOS_OWNER_PIN` as a persistent runtime secret.

Build with `npm ci` and `npm run build`; use the hosting provider's Next.js deployment support or start the built server with `npm run start`. Verify the deployed sign-in, a normal authorized station operation, and sign-out before opening the station. Back up the database before production data resets; **Reset all data** is destructive and should only be used by the owner after confirming the intended station.

## Files to keep or exclude

- Keep `app/`, `neon/migrations/`, `scripts/provision-owner.ts`, `package.json`, `package-lock.json`, and the Next.js/TypeScript/PostCSS configuration needed to build and run the app.
- Keep `.gitignore`; it excludes local environment files, dependencies, and generated build output from Git.
- Do not deploy `.env*`, `node_modules/`, `.next/`, `out/`, `build/`, or `.vercel/`.
- `.archive/` contains legacy Supabase code; `.agents/`, `.vscode/`, and `.mcp.json` are development/agent tooling. They are not needed by the running app, but preserve them in the source workspace unless intentionally retiring that history and tooling. Exclude them from a platform's uploaded build context only if that platform's ignore configuration is explicitly set up.

## Commands

- `npm run dev` starts the development server.
- `npm run lint` runs ESLint.
- `npm test` runs the test suite.
- `npm run build` creates a production build.
- `npm run start` starts the built Next.js server.
