<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## FuelPOS vault workflow

The project knowledge vault is `C:\VENCEDEV\vencedev`. Use the `fuelpos-vault` filesystem MCP server in the project-root `.mcp.json`; it is intentionally restricted to that vault.

For every FuelPOS task:

1. Before changing project files, read the vault's `AGENTS.md`, `20 Projects/fuelpos/fuelpos.md`, today's daily note, and the two preceding daily notes. Follow the vault's skill and access rules.
2. After making any project code, configuration, design, or agent-instruction change, update `20 Projects/fuelpos/fuelpos.md` with the resulting project state and append a timestamped entry to today's daily note under `## Agent log`, following the vault's format.
3. If the vault MCP server or required notes are unavailable, do not silently skip this workflow; tell the user and pause project changes until vault access is restored.
4. Never access or modify the vault's `Private/` folder. Keep `wikilinks.md` in sync when adding, moving, or archiving notes.
