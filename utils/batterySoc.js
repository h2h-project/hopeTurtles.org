// Coulomb-counted battery State of Charge.
//
// Each telemetry packet integrates ina_current_ma (signed: positive =
// charging into the battery, negative = discharging) over the elapsed time
// since the previous packet into a running SoC%. Two anchors bound the
// long-run drift inherent to coulomb counting:
//   - charger termination (tail current tapers off near float voltage) → 100%
//   - near-empty voltage under light/no load → a defined low value
// Both thresholds are deliberately named constants so they're easy to tune
// without hunting through the integration logic below.
const CHARGE_TERM_CURRENT_MA = 20; // charger considered terminated below this
const CHARGE_TERM_VOLTAGE_V = 4.15; // ...and bus voltage at/near float
const LOW_VOLTAGE_ANCHOR_V = 3.25; // near-empty voltage anchor point, in VOLTS — busV must
                                    // already be in volts (e.g. 3.8), never millivolts, or
                                    // this comparison is meaningless (see PLAUSIBLE_* below).
const LOW_VOLTAGE_ANCHOR_LOAD_MA = 50; // "light/no load" ceiling for that anchor
const LOW_VOLTAGE_ANCHOR_SOC_PCT = 0;

// A busV outside this range can't be a real single/dual-cell Li-ion bus
// reading — it's either a bad sensor sample or, historically, the classic
// volts-vs-millivolts unit mix-up (e.g. 3800 instead of 3.8). Readings
// outside it are excluded from the voltage anchors below so a garbage
// sample can't force a false 0%/100% re-anchor.
const PLAUSIBLE_VOLTAGE_MIN_V = 0.5;
const PLAUSIBLE_VOLTAGE_MAX_V = 6.0;

// Coulomb counting needs a real, non-zero capacity to turn mA·h into a %.
// If the turtle's stored capacity is ever missing/zero/NaN (e.g. a legacy
// row from before control_battery_capacity_ah existed), integration used to
// just silently skip forever, freezing SoC at whatever it last was. Falling
// back to this default (matches turtles_tb's own column default) means a
// broken capacity value degrades accuracy instead of permanently disabling
// the integration.
const DEFAULT_CAPACITY_AH = 4.2;

// A gap this large (device offline, boot delay, clock jump) makes the
// elapsed-time term unreliable, so the packet's current is not integrated —
// it can still trigger a re-anchor below.
const MAX_INTEGRATION_GAP_SECONDS = 6 * 3600;

// Guards against a single bad device clock (RTC not yet synced, garbage
// recorded_at) permanently poisoning the persisted reference timestamp.
// Without this, a recorded_at far in the future becomes the new
// updatedAtUnix (see the trailing Math.max below) and — because that value
// only ever moves forward — every subsequent, correctly-clocked packet then
// computes a negative dt against it forever, disabling integration for the
// turtle permanently. A recorded_at more than this far ahead of the
// server's own clock is treated as unreliable: it still isn't rejected
// outright (validateTelemetryBody already bounds it to a plausible
// calendar range), but it's never allowed to become the new anchor.
const MAX_CLOCK_SKEW_AHEAD_SECONDS = 3600;

const clampSoc = (pct) => Math.max(0, Math.min(100, pct));
const isPlausibleVoltage = (v) => v >= PLAUSIBLE_VOLTAGE_MIN_V && v <= PLAUSIBLE_VOLTAGE_MAX_V;

/**
 * @param {object} params
 * @param {number|null} params.prevSocPct - last known SoC%, or null if unknown
 * @param {number|null} params.prevUpdatedAtUnix - unix seconds of the reading prevSocPct was computed at
 * @param {number|null} params.currentMa - this packet's signed battery current (mA)
 * @param {number|null} params.busV - this packet's battery bus voltage (V)
 * @param {number} params.recordedAtUnix - this packet's recorded_at (unix seconds)
 * @param {number|null} params.capacityAh - control battery capacity (Ah)
 * @param {number|null} [params.fallbackPct] - starting point when there is no prior SoC to integrate from
 * @param {number} [params.nowUnix] - server "now", used only to bound clock-skewed recorded_at values
 * @param {boolean} [params.debug] - when true, console.logs the integration/anchor decision for this sample
 * @returns {{ socPct: number, updatedAtUnix: number }}
 */
export function computeSoc({
  prevSocPct,
  prevUpdatedAtUnix,
  currentMa,
  busV,
  recordedAtUnix,
  capacityAh,
  fallbackPct = null,
  nowUnix = Math.floor(Date.now() / 1000),
  debug = false
}) {
  const hasCurrent = Number.isFinite(currentMa);
  const hasVoltage = Number.isFinite(busV) && isPlausibleVoltage(busV);
  const hasPrev = Number.isFinite(prevSocPct);

  const capacityAhRaw = capacityAh;
  const capacityIsValid = Number.isFinite(capacityAh) && capacityAh > 0;
  if (!capacityIsValid) {
    capacityAh = DEFAULT_CAPACITY_AH;
  }
  const hasCapacity = Number.isFinite(capacityAh) && capacityAh > 0;

  // A recorded_at far ahead of the server's clock must not become the new
  // persisted anchor (see MAX_CLOCK_SKEW_AHEAD_SECONDS above) — but it can
  // still be safely integrated against a sane prior anchor if one exists.
  const clockSkewedAhead =
    Number.isFinite(recordedAtUnix) && recordedAtUnix - nowUnix > MAX_CLOCK_SKEW_AHEAD_SECONDS;

  let socPct = hasPrev ? prevSocPct : null;
  let integrated = false;
  let chargeDeltaAh = null;
  let dtSeconds = null;

  if (
    hasCurrent &&
    hasCapacity &&
    Number.isFinite(prevUpdatedAtUnix) &&
    Number.isFinite(recordedAtUnix)
  ) {
    dtSeconds = recordedAtUnix - prevUpdatedAtUnix;
    if (dtSeconds > 0 && dtSeconds < MAX_INTEGRATION_GAP_SECONDS) {
      const base = socPct ?? clampSoc(Number.isFinite(fallbackPct) ? fallbackPct : 50);
      chargeDeltaAh = (currentMa / 1000) * (dtSeconds / 3600);
      socPct = base + (chargeDeltaAh / capacityAh) * 100;
      integrated = true;
    }
  }

  if (socPct === null) {
    socPct = Number.isFinite(fallbackPct) ? fallbackPct : 50;
  }

  let anchor = null;

  if (
    hasCurrent &&
    hasVoltage &&
    currentMa >= 0 &&
    currentMa < CHARGE_TERM_CURRENT_MA &&
    busV >= CHARGE_TERM_VOLTAGE_V
  ) {
    socPct = 100;
    anchor = 'charge_taper';
  } else if (
    hasVoltage &&
    busV <= LOW_VOLTAGE_ANCHOR_V &&
    (!hasCurrent || Math.abs(currentMa) < LOW_VOLTAGE_ANCHOR_LOAD_MA)
  ) {
    socPct = LOW_VOLTAGE_ANCHOR_SOC_PCT;
    anchor = 'low_voltage';
  }

  socPct = clampSoc(socPct);

  // Only let this packet's timestamp become the new persisted reference
  // when it isn't clock-skewed ahead of the server — otherwise keep the
  // previous anchor so a later, correctly-clocked packet can still
  // integrate a valid (positive, bounded) dt against it.
  const updatedAtUnix = Number.isFinite(prevUpdatedAtUnix)
    ? clockSkewedAhead
      ? prevUpdatedAtUnix
      : Math.max(prevUpdatedAtUnix, recordedAtUnix)
    : clockSkewedAhead
      ? nowUnix
      : recordedAtUnix;

  if (debug) {
    // TEMPORARY — remove once the SoC-flatlining-at-0 investigation is
    // confirmed fixed. Toggle with DEBUG_BATTERY_SOC=true (see
    // controllers/deviceApiController.js).
    console.log('[batterySoc]', {
      currentMa,
      busV,
      capacityAhRaw,
      capacityAhUsed: capacityAh,
      capacityFellBackToDefault: !capacityIsValid,
      dtSeconds,
      chargeDeltaAh,
      integrated,
      anchor,
      clockSkewedAhead,
      prevSocPct,
      socPct,
      prevUpdatedAtUnix,
      recordedAtUnix,
      updatedAtUnix
    });
  }

  return { socPct, updatedAtUnix };
}

export default { computeSoc };
