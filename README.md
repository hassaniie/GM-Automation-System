# MG GA Operations: General Assembly digital twin (prototype)

An interactive 3D digital twin and HMI for the MG Motors Pakistan (MG JW Automobile) General Assembly shop. It covers the HS and ZS lineup, with hanger automation, station timers, VIN scans, delay alarms, bottleneck tracing and take-off-line handling.

Designed and built by **Bolt & Volt (Pvt) Ltd**.

> **Status: simulation only.** No PLC, scanner or sensor is connected. Every value on screen comes from a deterministic simulator and is labelled `SIMULATION`.

## Run

`index.html` is a single self-contained page. Open it in a browser, or serve the folder:

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

It loads three.js r128, React 18.3.1, htm 3.1.1 and the Barlow and JetBrains Mono fonts from public CDNs, so it needs internet access.

## Source layout

| File | Contents |
|---|---|
| `src/01-head.html` | Title, fonts, all CSS: light, dark and auto themes, the sharp-frame design system and buttons |
| `src/02-engine.js` | Deterministic line simulator (`window.MGE`): stations, carriers, hangers, transfers, permissives, alarms, root-cause analysis, scans, take-off-line, HS/ZS variants and paints |
| `src/03-scene.js` | three.js scene (`Scene3D`): floor and layout, conveyors, hanger loop, cars (HS and ZS bodies), build-phase parts, signage, MG and Bolt & Volt floor marks, lighting per theme |
| `src/04-ui.js` | React + htm HMI: top bar, line strip, inspectors, alarms drawer, scan and take-off dialogs, shift report, scenarios |
| `src/00-shell-open.html`, `src/05-shell-close.html` | Document wrapper: doctype, viewport and base styles |
| `build.sh` | Concatenates `src/` into `index.html` |
| `docs/ga-layout-reference.png` | Plant GA layout drawing the floor plan was traced from |

Edit files in `src/`, then run `./build.sh`. The engine is wrapped in an IIFE so its top-level constants don't clash with the scene and UI scripts.

## Line model

- **Trim, Station 1:** TL1–TL5 on a manual floor conveyor. Scanner 1 receives the VIN at TL1. TL6 is a Trim work point and the hanger load point (Scanner 2).
- **Chassis, Station 2:** exactly 4 hangers run TL6 → CL1 → CL2 → CL3 → Buffer → CL4 → FL1. The buffer can hold a loaded hanger while CL4 is busy. Empty hangers return FL1 → TL6 on their own rail. CL2 pairs the engine and gearbox to the VIN by scan; a mismatch puts the station on quality hold.
- **Final, Station 3:** FL1 is worked on the hanger, then the body is lowered onto the Final conveyor FL2–FL7. Scanner 3 at FL7 scans the car off the line.
- **Stations:** every station has a 10:00 target. In the simulation teams finish in 9:00. Each station has **Work done**, **Assistance** and **Emergency** buttons, and a unit moves on when Work done is pressed and the next point is free.
- **No in-shop repair:** a problem unit is taken off the line and recorded, never counted as completed.
- **Alarms:**
  - **Warning** at 9:30 of work time.
  - **Overdue** at 10:00.
  - **Escalated** at 13:00.
  - **Blocked** 90 s after Work done if the unit can't move.
  - **Hold, Fault and Emergency** are raised the moment they happen.
- **Scenario 1 demo:** after about 2½ minutes of running, CL2 hits an engine-mount problem that runs past target, escalates and holds up the line behind it.

## Assumptions to confirm with the plant

1. The HS/ZS variant mix and the ZS paint list. The ZS currently uses the HS paints.
2. The model codes used in the simulated VINs.
3. Exact station work content. The drawing shows positions only.
4. The protocols and data sources for real PLC, scanner and MES integration.
