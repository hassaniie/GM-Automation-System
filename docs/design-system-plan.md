# MG GA Andon: design system plan

*Bolt & Volt · for the GA Andon web app (`apps/web`) and the 3D floor (`packages/scene`)*

**Goal.** Keep the visual language we have settled on: dark industrial, square-cornered, Barlow with JetBrains Mono, MG red, glass panels over the 3D floor. Put a real design system under it, so every screen is built from the same tokens, layout rules and components. Fix the breakages that come from not having one.

---

## 1. Where we are (audit)

### Measured in the code today

| Area | Today | What it causes |
|---|---|---|
| Tokens | 52 custom properties: colours, two fonts, one radius (`--r: 14px`), blur | No spacing, type, z-index, motion or size tokens, so every value is typed by hand |
| Colours outside tokens | 154 raw hex values in `app.css` | Light and dark themes drift; the 3D scene has its own separate palette |
| Font sizes | 20 different `font-size` values, plus 26 `font:` shorthands | No type scale; the same kind of text is sized differently from screen to screen |
| Spacing | 65 different padding, gap and margin combinations | Uneven rhythm; panels never quite line up |
| Corner radius | 10 values (2, 4, 6, 7, 8, 9, 10, 11, 12, 50%) plus `--r: 14px` | Contradicts the square-cornered language: some boxes are sharp, others rounded 8–14 px |
| Inline styles in JS | 223 `style=${{…}}` | Layout lives inside components and can't be themed or reviewed |
| Stacking | 18 different `z-index` values (1 to 95) | Overlaps between the top bar, inspector, drawer, toasts and 3D tags |
| Breakpoints | 12 different media queries (560–2200 px) | Every screen breaks at a different width; there are no named sizes |
| Components | `ui-kit.js` exports only `Icon`, `StatusChip`, `LevelChip`, `VinText`, `MgMark`, `Horn`; 237 CSS classes | No Button, Field, Table, Panel, Stat, Dialog or Tabs component; the same thing is built differently each time |
| Button variants | `btn` combined freely with `sm / ghost / icon / primary / warn / danger / ok / sim / si-alt` (12 combinations in use) | No defined variants or sizes, so a combination like `sm ghost icon` is a new design every time |

### What your screenshots show

1. **The top bar runs out of room and nothing gives way.**
   - It holds about 13 groups: brand, clock, mode chip, page navigation, line state, completed/target, remaining, downtime, last hour, in process, tools, calls, alarms, user and partner logo.
   - At 2000 px, the floor page pushes Calls, Alarms and the user menu off the right edge.
   - Nothing decides what to drop first; the content just overflows.
2. **The station strip scrolls vertically.**
   - **The cause:** `.lanes { overflow-x: auto }`. In CSS, setting one direction of overflow to scroll silently makes the other direction scroll as well. Once cell content is a few pixels taller than the strip, a vertical scrollbar appears.
   - **The deeper problem:** the strip has no defined height and no rule for how 21 cells share the width.
3. **No clear order of importance on the floor page.**
   - The six KPIs in the top bar all look equally important. "CONSTRAINED · FL1", the most important message, is the same size as "Last hour".
   - On the 3D floor, the delay tag ("TL5 WAITING · HELD BY FL1") floats in mid-air, and the same red appears on the TL5 strip cell, the downtime figure and the car. Nothing ties them together.
4. **Colour is used for both decoration and alarms.**
   - Red appears on the brand, the downtime numbers, the dashboard's downtime figures (always red, even when small), the 3D MG logo and the critical state.
   - The dashboard shows four headline downtime numbers in red at once, so red stops meaning "act now".
5. **Inconsistent containers.**
   - The dashboard line cards use corner ticks, the KPI tiles are flat, the side panels are bordered boxes, and the floor uses rounded glass.
   - That's four container styles with no rule for when to use which.
6. **The same information looks different on different screens.**
   - A station appears as a strip cell on the floor, a tile on the dashboard, a row in reports and a cell on the TV display. Each is drawn differently.
   - The takt marker is a yellow tick on the dashboard and doesn't appear at all on the floor.

**Overall:** the visual language is strong and worth keeping. What's missing is the system underneath it.

---

## 2. Which design system to adopt

**Recommendation: build our own "Andon DS" on the IBM Carbon foundation, with the ISA-101 and ISA-18.2 industrial standards for how colour and alarms behave. Don't import a component library wholesale.**

| Option | Fit | Verdict |
|---|---|---|
| **IBM Carbon (foundation only)** | Built for dense, data-heavy enterprise and industrial tools (IBM Maximo is built on it). Square corners by default, a 2-px-based spacing grid, a strict type scale, a layering model, three-tier tokens (primitive → semantic → component), and good tables, notifications and status patterns. | **Adopt its structure:** token tiers and naming, spacing scale, type scale, layering, status and notification rules. **Don't import `@carbon/react`:** it would replace our look with IBM's and add a lot of weight. |
| **ISA-101 (high-performance HMI) and ISA-18.2 (alarm management)** | The industry standards for control-room and shop-floor screens. Normal running is quiet and neutral; colour is reserved for abnormal states; alarms have fixed priorities, shapes and colours; screens are organised in levels from overview to detail. | **Adopt as the rules for colour and alarms.** This is what makes an Andon screen readable from 5 m and trusted by the plant. |
| Material, Ant Design, Chakra | Consumer or back-office, rounded, colour-rich | No: fights the industrial look and wastes screen space |
| shadcn/ui or Radix | Good accessible behaviour, unstyled | **Borrow the patterns** (focus trapping, menus, tooltips) where we rebuild components. No dependency needed for now. |
| Tailwind | A styling method, not a design system | No: we already have CSS custom properties; the work is in the tokens, not the tooling |

**Why this keeps our current look:**
- Carbon's corners are square and its density is high, as ours are.
- Barlow and JetBrains Mono stay; they replace IBM Plex in Carbon's type roles.
- MG red stays as the brand colour only.
- The glass stays, but only where a panel floats over the 3D floor.
- ISA-101 changes when colour appears, not what the colours are.

---

## 3. Design principles for this product

1. **Read it from 5 metres.**
   - Every screen has one primary message: line state and the station causing a problem.
   - That message can be read in under 2 seconds on the TV display.
   - Size, contrast and position show what matters most; colour doesn't have to do it alone.
2. **Normal is quiet; colour means something is wrong** (ISA-101).
   - A running line is neutral grey.
   - Amber means close to takt, red means over takt or a fault, and blue means waiting or held.
   - Red never appears on a number that is fine.
3. **One status vocabulary everywhere.**
   - A station's state has the same colour, icon and wording on the floor, in the strip, on the dashboard, on the TV, in reports and in the 3D tag.
   - Status is never shown by colour alone (colour-blind staff, glare on a TV): each state also gets an icon or shape.
4. **Detail on demand.** Screens go from overview to detail in levels:
   1. plant;
   2. line;
   3. station;
   4. vehicle.

   Each level only shows what that level needs; the rest is one click away.
5. **The 3D floor is the background, not the interface.**
   - Panels sit in fixed zones around a safe area. The camera frames the line inside that area.
   - Tags in the 3D view follow the same component rules as the 2D screens.
6. **Slightly softened corners, honest structure** (decided 6 Nov 2026).
   - 4 px corners for boxes and controls, 3 px for small items, round only for status dots and avatars.
   - Corner ticks follow the same curve.
   - Borders, not shadows, show structure. Shadows and glass are only for panels floating over the 3D floor.
7. **One component per idea.** If two things mean the same, they share a component. If they look different, they must mean something different.

---

## 4. Tokens: three tiers, Carbon-style

Tiers: **primitive** (raw values) → **semantic** (purpose, themed light and dark) → **component** (only where a component needs its own value).

Naming: `--ds-<category>-<role>-<variant>`, for example `--ds-color-status-critical`, `--ds-space-4`, `--ds-type-kpi-lg`.

Existing variables (`--text`, `--hair`, `--ok`, …) are kept as **aliases** of the new tokens during migration, so nothing breaks on day one.

| Category | Proposal |
|---|---|
| **Colour primitives** | Neutral ramp: 12 steps from the current dark background `#0c1014` to `#f2f4f6`. MG red ramp (brand only). One ramp per status hue: green, amber, red, magenta (escalated), blue (held), cyan (moving), violet (supervisor call), azure (maintenance call). |
| **Colour semantics** | `background` / `layer-01..03` / `layer-glass` (Carbon's layering), `border-subtle` and `-strong`, `text-primary` / `-secondary` / `-disabled`, `interactive`, `focus`, and `status-{normal, warning, critical, escalated, held, moving, paused, offline, sim}`. All in both themes; contrast checked ≥ 4.5:1 for text and ≥ 3:1 for status marks. |
| **Alarm priority** (ISA-18.2) | Four priorities mapped to `SEV`:<br>• P1 critical/escalated: red + filled triangle, flashes until acknowledged;<br>• P2 over takt / fault: red + outline triangle;<br>• P3 warning: amber + diamond;<br>• P4 information: neutral + circle.<br>Acknowledged alarms stop flashing but stay coloured until resolved. |
| **Type** | Barlow for UI text, JetBrains Mono for numbers, VINs and codes. Nine-step scale (12/13/14/16/20/24/32/48/72) in named roles: `label-01`, `body-01`, `body-02`, `heading-01..04`, `kpi-sm/md/lg`, `display` (TV). Uppercase micro-labels keep their letter spacing, as one token. |
| **Spacing** | 4-px base (Carbon's 2-px grid without the 2): `--ds-space-1..10` = 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Every padding and gap uses a token; the 65 combinations become about 10. |
| **Size** | Control heights `sm 28`, `md 36`, `lg 44` (touch), `xl 56` (floor tablets and gloves). Icons 12/16/20/24. |
| **Radius** | `--ds-radius-md: 4px` (panels, cards, dialogs, drawers, the top bar and strip, buttons, inputs), `--ds-radius-sm: 3px` (strip cells, chips, tags, swatches), `--ds-radius-round` (dots, avatars). This replaces the 10 hand-typed values. Corner ticks are a frame with the same curve, masked to the corners. |
| **Border** | `1px` hairline, `2px` emphasis (selection, status edge), `3px` status bar on tiles and cells. |
| **Elevation** | Four layers:<br>• **0:** the page;<br>• **1:** panels (border, no shadow);<br>• **2:** glass over 3D (blur + rim + shadow);<br>• **3:** overlays (dialog, drawer, menu).<br>The glass recipe is kept, but only layer 2 uses it. |
| **Motion** | `fast 120ms`, `base 200ms`, `slow 320ms`. Two easings (standard, emphasised). Alarm flash 1 Hz. All motion is turned off for people who choose reduced motion, except alarm flashing, which falls back to a static marker. |
| **Z-index** | Named layers replace the 18 numbers:<br>• `scene 0`;<br>• `scene-tags 10`;<br>• `chrome 20` (top bar, strip);<br>• `panel 30` (inspector, console);<br>• `drawer 40`;<br>• `overlay 50`;<br>• `toast 60`;<br>• `critical 70` (emergency banner). |
| **Breakpoints** | Named sizes:<br>• `compact < 1024` (tablet);<br>• `regular 1024–1439`;<br>• `wide 1440–1919`;<br>• `ultra ≥ 1920` (TV).<br>Components respond to the width of their own container rather than the window, so the same tile works in the dashboard grid and the TV view. |

**3D scene:** one shared palette. At start-up, and when the theme changes, the scene reads the semantic status and surface colours from the CSS variables, so the car, the floor marking and the 2D chip are the same red. The raw hex values in `packages/scene` are replaced.

---

## 5. Layout architecture

### App shell: one grid, fixed regions

```
┌ top bar (56) ──────────────────────────────────────────────────────────┐
│ [identity] [page nav] [── page status (flexible) ──] [tools] [calls][alarms][user] │
├────────────────────────────────────────────────────────────────────────┤
│ page content (dashboard / reports / settings) — or —                   │
│ floor: 3D safe area  ·  inspector region (right, 400)  ·  console (left)│
├ station strip (floor only, fixed 96) ──────────────────────────────────┤
└────────────────────────────────────────────────────────────────────────┘
```

**Top bar: priority order, so nothing overflows**
- **Always fixed:** identity (logo, clock, shift, mode chip), Calls, Alarms and the user menu.
- **Shrinks by itself:** the middle "page status" region holds the line KPIs. It is built with **priority+**:
  - each KPI has a priority;
  - when space runs out, the lowest-priority KPIs move into a "More" menu (in process, last hour, remaining go first);
  - line state and completed/target never move.
- **Page navigation:** collapses to a menu on compact screens.
- **Partner logo:** moves to the user menu and the About page at `regular` width and below.

**Floor page**
- The 3D view gets a safe area: the top bar, strip, inspector and console are excluded from it.
- The camera frames the line inside the safe area, so nothing important sits under a panel.

**Station strip**
- Fixed height, with vertical overflow never allowed.
- The three lanes share the width in proportion to their station count: 6, 4 + buffer, 7.
- Cells have a minimum of 56 px. Below `wide` they drop the timer line and show only status and ID.
- At `compact` the strip becomes one lane at a time, with Trim / Chassis / Final tabs.
- No horizontal scrolling on screens of 1024 px and wider.

**Page layout**
- A 12-column grid with 24 px gutters (16 at compact) and a maximum width of 1600 for document pages (reports, settings).
- Dashboards are full width.
- Every page starts with the same page header: section label, title, sub-line, actions.

**TV display**
- A fixed 1920 × 1080 layout scaled to the screen, so it looks the same on any TV size.
- Typography is set for 5 m: KPI 72, labels 20.

### Order of importance on every screen

1. **The answer:** is the line OK, and if not, where and why? One element, the largest, top-left or centre.
2. **Progress:** completed against target, the takt marker, remaining.
3. **Exceptions:** calls, alarms, offline units, each with its own place.
4. **Context:** history, last hour, in process.
5. **Tools and navigation:** quiet, always in the same place.

On the floor page, for example, "CONSTRAINED · FL1" becomes the main element of the page status region: status shape, line state and the cause station as a link that selects it in 3D. The other KPIs drop one level.

---

## 6. Components

All components are in one package, `packages/ui` (React + htm, typed). Each defines its variants, sizes and states (default, hover, focus, active, disabled, loading, error), its accessibility (role, keyboard, screen-reader text) and the tokens it uses.

### Foundations (new)
- `Icon` (exists; to be registered)
- `Text` (type roles)
- `Num` (tabular figures)
- `Stack`, `Cluster`, `Grid` (layout helpers that replace inline styles)
- `VisuallyHidden`
- `FocusRing`

### Core controls

| Component | Today | Plan |
|---|---|---|
| `Button` | `.btn` plus 12 combinations | Variants: primary / secondary / ghost / danger. Sizes: sm/md/lg/xl. Icon-only and loading states. One `Button` with props instead of class combinations. |
| `IconButton`, `ToggleButton`, `SegmentedControl` | Hand-built several times (speed 1×/5×/15×, views) | New |
| `Switch`, `Checkbox`, `Radio` | `.toggle` only | New, as one family |
| `TextField`, `NumberField`, `DateField`, `TimeField`, `Select`, `Combobox` (VIN search) | Raw inputs with per-page CSS | New `Field` wrapper (label, hint, error, required) plus the controls |
| `Tabs`, `Menu`, `Tooltip`, `Popover` | Ad hoc | New. Keyboard support follows the standard accessible patterns. |
| `Dialog`, `Drawer`, `Sheet` | `.dialog`, `.drawer` | Rebuilt with focus trapping, Esc to close, named z-index layers |
| `Toast`, `InlineMessage`, `Banner` | `.result good/bad`, `lcd-banner` | One feedback family: info / success / warning / error / critical |

### Data display

| Component | Plan |
|---|---|
| `Panel` | One container with variants: `plain` (layer 1), `glass` (over 3D), `ticked` (corner ticks for primary objects only). This replaces `.panel`, `.glass`, `.seg`, `.dev-card` and the KPI tiles. |
| `Stat` (KPI) | Label, value, unit, target, change, status. Sizes sm/md/lg/display. One component for the top bar, dashboard, reports and TV. |
| `Meter` | Progress against target, with the takt / plan marker. Replaces the attainment bar, cycle bar and shift bar. |
| `Sparkline`, `BarMini` | Completed per hour, cycle history |
| `DataTable` | Dense and comfortable densities, sticky header, numeric alignment, sortable, empty, loading and error states, row status edge. Used for reports, audit, users, devices and the signal log. |
| `KeyValue`, `Tag`, `Badge`, `EmptyState`, `Skeleton`, `PageHeader` | New (`Tag` and `Badge` replace `.chip`, `.tag` and part of `.sim-tag`) |

### Andon (domain) components: the heart of the system

| Component | One definition, used in |
|---|---|
| `StatusIndicator` | Shape + colour + label for every station and line state (the ISA-101 vocabulary) |
| `AlarmPriority` | P1–P4 marker, flashing until acknowledged |
| `StationCell` | The strip, dashboard tiles, the TV display and the 3D tag. Sizes xs/sm/md/lg. Shows ID, status, timer and takt progress. |
| `LineLane` | A group of station cells with the line header (name, completed / target, delta) |
| `LineSummary` | Dashboard line card and TV header |
| `ModeIndicator` | SIMULATION / SIM · EDGE / SHADOW / LIVE / DEVICE DOWN / RECONNECTING |
| `ShiftClock` | Clock, shift, break state |
| `CallCard`, `AlarmItem` | Drawer, TV display, floor |
| `VehicleTag`, `VinText` | Inspector, reports, 3D tags |
| `TaktTimer` | Station inspector, TV display |
| `DeviceCard`, `SignalRow` | Settings → Devices |
| `SceneTag` | 3D anchored labels, with collision avoidance (see §7) |

---

## 7. 3D floor and the design system

- **One palette.** The scene reads its colours from the design tokens. Status materials (station floor marking, lamps, car highlight) use the same semantic colours as the 2D components.
- **The 3D view changes with the theme:** the floor, gridlines and labels follow the light/dark surface tokens.
- **Normal is quiet in 3D too.**
  - When everything is normal, cars keep their paint colours and stations are neutral.
  - A station over takt gets a red floor ring and a lamp; a blocked one gets blue.
  - The large MG logo on the floor becomes a subtle watermark, so it isn't mistaken for an alarm.
- **`SceneTag` rules:**
  - **Placement:** tags are 2D components anchored to 3D points, with a leader line to the station.
  - **Overlap:** they avoid each other (highest priority wins, others stack or collapse to a dot).
  - **Limit:** a maximum of 5 visible at once; the rest are counted in a "+3 more" chip.
  - **Depth:** tags fade with distance and hide behind panels (safe-area aware).
- **Camera:** "fit line" presets for overview, Trim, Chassis and Final, framed inside the UI safe area. Moves use the motion tokens and ease out. Selecting a station from the strip, a tag or an alarm frames it the same way everywhere.
- **Detail by distance:**
  - Labels and detailed meshes appear only when zoomed in.
  - Overview mode shows the line state, not every bolt.
  - The frame budget is checked: at least 50 fps on the plant PC's integrated GPU, and the 2D plan view as a fallback.

---

## 8. UX research and strategy (how we make sure it's right)

### Who uses it, from where

| Who | Where | What they need in seconds |
|---|---|---|
| **Line operator** | Station, standing, sometimes gloved | Am I over takt? Call for help |
| **Line supervisor** | Walking the floor, tablet or HMI | Which station is holding the line, and why? Respond to calls |
| **Maintenance** | Responding | Where, what, how long |
| **Authorised person** | Office PC | Change takt, plan, shifts; correct positions |
| **Management** | TV or desk | Are we on plan today? |

### Research plan (light, 2–3 weeks, alongside the build)

1. **Contextual inquiry** at the plant, with 2–3 people per role: watch a shift and capture where they look, how far away the screens are, the lighting, and gloves and touch.
2. **5-second tests:**
   - **TV display and floor top bar:** "Is the line OK? Which station?" Target: correct in 5 s at 5 m, by 9 out of 10 participants.
   - **3 alternative top-bar arrangements:** tested the same way.
3. **Task-based usability tests:** raise and respond to a call, take a unit offline and return it, correct a position, find yesterday's downtime for FL3.
   - **Measures:** time on task, errors, confidence (SEQ).
   - **When:** before and after the redesign.
4. **Heuristic review** of every screen against the new principles before it is rebuilt (scored, so the improvement can be measured).

### Success measures
- Time to identify the constraining station: target under 3 s.
- Wrong-action rate in the tasks: 0 critical errors.
- Number of distinct UI values (tokens used against values typed by hand): from about 400 to under 60.
- Zero layout overflow at the 4 breakpoints × 2 themes.

---

## 9. Making it stick (governance)

- **Living catalogue:** Storybook (`pnpm --filter @mg/web storybook`), decided 6 Nov 2026.
  - It shows every token and every component in every variant and state, in both themes.
  - It doubles as the review surface.
  - Storybook can come later if a second app appears.
- **Guardrails in CI:**
  - **Stylelint:** no raw hex or px outside the token files; only named z-index layers; only radius tokens.
  - **ESLint:** inline `style` only for genuinely changing values, such as the position of a moving car.
  - **Visual regression:** Playwright screenshots of the catalogue and of 8 key screens at 4 widths × 2 themes, compared on every PR.
  - **Overflow test:** fails if any shell region scrolls or overflows at the named breakpoints. This would have caught both of today's bugs.
  - **Accessibility:** axe checks on the catalogue; contrast checked for the token pairs.
- **Docs:** each component has a short page covering when to use it, variants, states, do's and don'ts, and accessibility.
- **Ownership:** a component review checklist in the PR template. Breaking token or component changes get a version note and a migration path.

---

## 10. Migration: no big bang, the look never breaks

Each step ships on its own and is checked with screenshot comparisons before and after. Screens change only where we mean them to.

| Step | What | Visible change |
|---|---|---|
| **A. Tokens** | Add the token files (primitive / semantic / component, light / dark). Map the current variables onto them as aliases. Bring in z-index layers, radius and spacing. | Almost none. Corners become consistently square or 2 px. |
| **B. Shell fixes (quick wins)** | Top-bar regions with priority+ collapse; strip with a fixed height, no vertical overflow and proportional lanes; named breakpoints; floor safe area. | **Fixes the overlaps and the strip scroll** |
| **C. Core components** | Button, Field family, Panel, Stat, Meter, DataTable, Tabs, Menu, Dialog / Drawer / Toast, PageHeader, `#/design-system` catalogue, CI guardrails. | Consistent controls and containers |
| **D. Andon components** | StatusIndicator, AlarmPriority, StationCell, LineLane, LineSummary, ModeIndicator, CallCard, AlarmItem. Apply the ISA-101 colour rules. | One status vocabulary; red only for problems |
| **E. Screens** | Rebuilt one at a time with the new components:<br>1. floor;<br>2. dashboard;<br>3. TV display;<br>4. reports;<br>5. settings;<br>6. sign-in. | Clear order of importance on each screen |
| **F. 3D alignment** | Shared palette, SceneTag with collision handling, camera presets and safe area, detail by distance, theme-aware floor. | 3D and 2D tell one story |

The research (§8) runs alongside B–E: the 5-second and task tests are done before B and after E.

**Order of value:** B gives the fastest visible improvement, so A and B go first as one release. C and D unlock the screen rebuilds.

---

## 11. Decisions (6 Nov 2026)

1. **Corners:** 4 px for boxes and controls, 3 px for small items; the corner ticks follow the same curve (reference: the agreed button with curved corner accents).
2. **Glass:** only for panels floating over the 3D floor; flat bordered panels everywhere else.
3. **Colour:** normal is neutral (ISA-101). Downtime is neutral until it passes 5 % of the productive shift time so far (amber) or 10 % (red), or while a station is over takt (amber). Plan delta: neutral on or ahead of plan, amber behind, red more than 2 behind. The 5 % starting point is to be agreed with MG JW (`DOWNTIME_WARN_PCT` in `apps/web/src/lib/tone.js`).
4. **Catalogue:** Storybook.
5. **Target screens** (TV sizes, touch, gloves): still open; it affects the control sizes chosen in step C.

## 12. Release 1 (done)

- **Tokens:** `apps/web/src/styles/tokens/` (primitives and semantic, light and dark). The old variable names are aliases.
- **Stylesheet layers:** `reset`, `tokens`, `legacy` (`app.css`, being migrated), `layout`, `components`, `overrides`. New design-system rules live in `styles/ds/`.
- **Corners and curved ticks.**
- **Colour discipline:** for downtime and plan figures; the 3D MG floor badge is a grey watermark.
- **Top bar:** fixed regions; the status row folds by priority into More; tools fold into a menu.
- **Station strip:** fixed height, never scrolls, cells adapt to their width, status shown as an edge plus an icon, lane tabs below 1024 px.
- **Camera:** frames the line inside the UI safe area.
- **Storybook:** foundations (colour with contrast checks, status, type, spacing, corners, elevation, motion, layers) and today's components.
  - Its light-theme contrast check found the green and amber status colours below 3 : 1, so they were darkened.
- **CI guardrails:**
  - Stylelint (radius and z-index from tokens; no raw colours outside the token files; warnings only in the legacy stylesheet);
  - the Playwright layout test (top bar and strip at 1024–2560 px, both themes);
  - the Storybook build.
- **Not yet:**
  - stored visual-regression baselines (from step C, when components are rebuilt);
  - the page navigation menu below 1024 px (the icons still fit at the widths we support).
