# MG GA Operations: General Assembly Andon and digital twin (prototype)

An Andon system and 3D digital twin for the MG Motors Pakistan (MG JW Automobile) General Assembly shop. It covers the HS and ZS lineup across the Trim, Chassis and Final lines. It is built to the plant's URD *"Andon System – General Assembly Shop"* (draft 2, Nov 2026) and shows every one of its 36 requirements working in simulation.

Designed and built by **Bolt & Volt (Pvt) Ltd**.

> **Status: simulation only.** No PLC, scanner or sensor is connected. Every value on screen comes from a deterministic simulator and is labelled `SIMULATION`. Accounts, settings and the audit log are stored in the browser.

## Run

Needs Node 22 and pnpm 10 (`corepack enable` sets up the pinned pnpm).

```sh
pnpm install
pnpm dev          # http://localhost:5173 with hot reload
```

| Command | What it does |
|---|---|
| `pnpm build` | Production build in `apps/web/dist/` (what Vercel serves) |
| `pnpm build:demo` | One self-contained `apps/web/dist-demo/index.html` for quotations; opens straight from disk, Excel export included |
| `pnpm preview` | Serves the production build locally |
| `pnpm test` | Engine checks (Vitest) |
| `pnpm lint` / `pnpm typecheck` | ESLint and TypeScript |

React 18.3.1, htm 3.1.1, three.js r128 (0.128.0) and SheetJS 0.18.5 are npm dependencies; SheetJS is a separate chunk loaded only on export. Only the Barlow and JetBrains Mono fonts come from Google Fonts. CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and both builds on every push and uploads the demo file.

Sign in with one of the demo accounts listed on the sign-in screen (fictional people):

| Role | ID | Password |
|---|---|---|
| Administrator | MG-1001 | Admin@2026 |
| Authorised person | MG-2040 | Plan@2026 |
| Line supervisor | MG-3112 | Line@2026 |
| Maintenance | MG-4207 | Fix@2026 |
| View only (management) | MG-9001 | View@2026 |

Line displays need no sign-in: open `#/display/trim`, `#/display/chassis` or `#/display/final`.

## Screens

| Screen | Route | Who | What |
|---|---|---|---|
| Dashboard | `#/dash` | everyone | All lines: completed / target / remaining, downtime, takt, work in line, station states, active calls, downtime by cause, offlined units; drill-down to the floor |
| Floor | `#/floor` | everyone | 3D twin with stack lights and buzzer rings, line strip, station panels with Supervisor / Maintenance call buttons, offline and return, VIN record |
| Line displays | `#/display/<line>` | kiosk | TV page for each line, readable from the line |
| Reports | `#/reports` | everyone signed in | By day, shift and line: production, cycle times, downtime, offlined vehicles, call response; Excel and PDF |
| Settings | `#/admin/<tab>` | admin, authorised | Takt, targets and 14-day plan, shifts and breaks, buzzers, position correction, users (admin), audit log |
| How it works | `#/how` | everyone | Architecture, answers to the URD's §6 points, and the coverage of all 36 requirements with "Show me" links |

## Source layout

A pnpm workspace:

| Path | Contents |
|---|---|
| `packages/contracts` | Shared TypeScript types: plant events (what devices report), operator commands, engine state and snapshot |
| `packages/core` | The Andon rules, with no simulator and no browser code: plant model, tracking, scans, takt, cycle time, downtime, three-state Andon, buzzers, calls, shift calendar and targets, offline and return, corrections, alarms, root-cause analysis, audit. Plant events enter through `apply()` |
| `packages/sim` | The line simulator: carrier movement, transfers, paint-shop feed, simulated teams and responders. It reports to the rules only through plant events |
| `packages/engine` | Facade: the `MGE` object the screens and scene use, assembled from `core` and `sim`. Its tests are the 42 URD checks |
| `packages/scene` | three.js digital twin (`Scene3D`): floor, conveyors, hanger loop, cars, stack lights, buzzer rings, scanners and photo-eye; `brand.js` holds the Bolt & Volt marks |
| `apps/web/index.html` | Page shell and fonts |
| `apps/web/src/main.js` | Entry: styles, then `boot()` |
| `apps/web/src/styles/app.css` | All CSS: themes, design system, Andon, sign-in, dashboard, line display, reports, print |
| `apps/web/src/lib/` | `runtime.js` (engine handle, UI state, theme), `router.js` (hash routes), `ui-kit.js` (icons, chips, tones, sound), `misc.js` |
| `apps/web/src/floor/` | Floor HMI: top-bar islands and line strip, station and vehicle inspectors, dialogs (scan, offline, return, correction, VIN search), alarm drawer, simulator console, 2D plan, scenarios |
| `apps/web/src/app.js` | App shell: navigation, root component, `boot()` |
| `apps/web/src/auth.js` | Sign-in, roles and permissions, user menu, idle lock |
| `apps/web/src/admin.js` | Settings screens and on-device persistence |
| `apps/web/src/screens.js` | Dashboard, line displays, link-loss and power-cut demos |
| `apps/web/src/reports.js` | Reports and Excel/PDF export |
| `apps/web/src/how.js` | How it works / URD coverage |
| `docs/` | Plant GA layout drawing the floor plan was traced from; URD clarification questions |

Each simulated second runs: `beginTick` (rules: clock, shift, planned stops) → `settleMovements` (plant: arrivals and transfers) → `accountTime` (rules: cycle-time accounting) → `advance` (plant: simulated work, feeds, new movements) → `endTick` (rules: analysis, alarms, downtime, buzzers). In deployment the plant halves are replaced by events from the PLC, scanners and the FL7 photo-eye; ESLint stops `core` from importing the simulator or the UI.

UI files are plain ES modules using htm templates; new code can be TypeScript. In the browser console, `MGE` (engine) and `__mg` (`RT`, `go`, `setUI`) are available for debugging.

## Line model

- **Flow:** Trim TL1–TL6 → Chassis CL1–CL4 (4 hangers, buffer before CL4) → Final FL1–FL7.
- **Scans (URD req 1–4):** only where the URD puts them.
  - Scanner 1 at TL1 records line-in.
  - An offline scan is taken at TL6 (end of Trim), and two handhelds cover FL1–FL7.
  - FL7 completion is detected by a photo-eye.
  - Between these points the VIN follows its carrier. There are no hanger-load or exit scans, and the CL2 engine/gearbox pairing scan is an option that is off by default.
- **Takt and cycle time:** takt is set per line (default 10:00) and teams finish in 9:00. Cycle time is the time at the station, with breaks excluded.
- **States:** a station is normal below the close-to-limit threshold (95 % of takt), close to limit from there, and over at takt.
- **Downtime:**
  - **Station:** the time its unit is over takt.
  - **Line:** the time during which any station on that line is over takt.
  - **Exclusions:** breaks and time between shifts don't count.
  - **Cause:** each second is put down to the station that caused it.
- **Buzzers:** one per Chassis and Final station. It rings over takt, stops when the unit leaves, and can be switched off per station.
- **Calls:** Supervisor (violet) and Maintenance (blue). A call is raised, then responded to, then cleared, and the response and clear times are recorded.
- **Targets and shifts:** each line has a target per shift. Shift A runs 06:00–14:30 and Shift B 14:30–23:00, each with breaks. Plans can be scheduled 14 days ahead, and counts reset at each shift start.
- **Offline and return:** a unit taken offline leaves the counts and the target. It can return and rejoin at the station it left, and counts only when it completes.
- **Trim Andon:** full Trim tracking is shown as an expansion preview (req 34). Trim buzzers are off by default.

## Assumptions to confirm with the plant

1. Shift times, breaks, default targets (30 per shift) and takt.
2. Downtime based on cycle time, so it includes waiting when blocked downstream, with the cause attributed to the root station.
3. Carrier RFID tags, an FL7 photo-eye, and the scanner placement: fixed at TL1 and TL6, handhelds at FL2 and FL5.
4. The HS/ZS mix, the ZS paint list and the model codes used in simulated VINs.
5. Protocols for real PLC, scanner and MES integration, and how long data must be kept.
