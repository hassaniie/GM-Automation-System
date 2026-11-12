/* ════════════════════════════════════════════════════════════════════════
   MG GA OPERATIONS — SIMULATION ENGINE v2
   Line flow confirmed by the plant: paint-shop buffer → Trim conveyor TL1–TL5
   → TL6 (load onto one of 4 hangers) → CL1 → CL2 → CL3 → Buffer → CL4 → FL1
   (lower onto conveyor) → Final conveyor FL2–FL7 → line-off. Empty hangers
   return FL1 → TL6 on a separate rail. Units with fitment issues or excess time are
   taken off the line immediately and recorded (no in-shop repair).
   The engine is the only source of truth. Deterministic: seeded PRNG,
   fixed 1-second steps.
   ════════════════════════════════════════════════════════════════════════ */
import { ANDON_AREAS, AREAS, AREA_IDS, AREA_LAST, AREA_STATIONS, BODY_BUFFER, BUILD, CALL_TYPES, checkPlanPatch, checkShifts, trimHistory, DEFAULT_CFG, DEFAULT_SHIFTS, EDGES, HANGER_FEED_PATH, HB_Z, H_BUFFER, H_CHASSIS, H_FINAL, H_FL1, H_TL6, H_TRIM, Integration, LOOPS, LOOP_GEOM, NEXT, OFFLINE_POS, OFFLINE_REASONS, OFFLINE_SLOTS, PAINTS, POS, POSITIONS, Path, RETURN_Y, RH, ROUTE, SEV, STATIONS, STATION_TARGET, STORAGE_PATH, TRANSFERS, VARIANTS, WORK_POS, XFER_FROM, XFER_TO, ackAlarm, alarmActive, alarmUnacked, analyze, andonActive, andonState, apply, applyTakt, areaPaused, audit, bufferHead, buildFor, buildState, buzzerEnabled, buzzerOn, callActive, callAllowedAt, callDuration, callEmergency, callResponse, callsAt, canReturn, canTakeOffLine, clamp, clearCall, clearEmergency, clearFault, clearGhost, correctPosition, createState, curSeg, dateKeyAt, dateKeyOf, dayOf, dayOfDate, describeOcc, dispId, entryScan, exitScan, findVehicleByVin, fmtClock, fmtDur, hangerReturnPath, hangerSlotX, hash01, injectCarrierFault, injectSensorFault, isActive, isLoopFirst, lineAndon, linePace, lineStatus, lineWip, locationLabel, logEvent, manualComplete, netElapsed, nextBoundary, occCycle, openCall, pace, permissives, posStatus, raiseCall, rescanEngine, respondCall, returnToLine, setBuzzer, setDefaultTarget, setPlan, setShiftPattern, setTakt, setWarnPct, shiftAt, shiftKey, shiftsFor, shortVin, stationCount, stationStatus, stationVehicle, summarizePlan, summarizeShift, takeOffLine, targetFor, targetsFor, validateVinFormat, vinCheckDigit } from '@mg/core';
import { feedBuffer, makeVin, runUntil, runWhile, setPaused, step } from '@mg/sim';


/* Facade: the MGE object the UI and scene use, assembled from the rules (@mg/core) and the simulator (@mg/sim). */
export const MGE = {
  RH, RETURN_Y, AREAS, POS, POSITIONS, ROUTE, NEXT, WORK_POS, STATIONS, LOOPS, TRANSFERS, XFER_FROM, XFER_TO, EDGES, Path,
  hangerReturnPath, HANGER_FEED_PATH, hangerSlotX, HB_Z, LOOP_GEOM, H_TL6, H_FL1, BODY_BUFFER, STORAGE_PATH, OFFLINE_SLOTS, H_TRIM, H_CHASSIS, H_FINAL, H_BUFFER,
  VARIANTS, PAINTS, OFFLINE_REASONS, isLoopFirst, BUILD, buildFor, buildState, DEFAULT_CFG, DEFAULT_SHIFTS, SEV, Integration, targetFor, STATION_TARGET,
  AREA_IDS, AREA_STATIONS, AREA_LAST, ANDON_AREAS, OFFLINE_POS, CALL_TYPES,
  createState, step, apply, runUntil, runWhile, entryScan, exitScan, makeVin, validateVinFormat, vinCheckDigit, bufferHead, feedBuffer,
  permissives, posStatus, stationStatus, stationVehicle, analyze, pace, lineStatus, locationLabel, describeOcc, dispId,
  ackAlarm, alarmActive, alarmUnacked, injectCarrierFault, injectSensorFault, clearFault, callEmergency, clearEmergency, callActive, setPaused,
  manualComplete, rescanEngine, canTakeOffLine, takeOffLine, canReturn, returnToLine,
  // Andon
  raiseCall, respondCall, clearCall, callsAt, openCall, callAllowedAt, callResponse, callDuration,
  andonState, andonActive, buzzerOn, buzzerEnabled, stationCount, lineWip, linePace, lineAndon, occCycle,
  correctPosition, clearGhost, audit, setTakt, setWarnPct, applyTakt, setDefaultTarget, setPlan, setShiftPattern, checkShifts, checkPlanPatch, setBuzzer, summarizePlan,
  dateKeyOf, dateKeyAt, dayOf, dayOfDate, shiftsFor, targetsFor, shiftAt, shiftKey, netElapsed, nextBoundary, summarizeShift, areaPaused,
  findVehicleByVin, isActive, logEvent, trimHistory, curSeg, fmtClock, fmtDur, shortVin, clamp, hash01,
};
// Exposed for console debugging in the browser, except in production builds (audit S1).
if (typeof window !== 'undefined' && import.meta.env?.MODE !== 'production') window.MGE = MGE;
export default MGE;
