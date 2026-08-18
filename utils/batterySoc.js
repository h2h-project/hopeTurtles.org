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
const LOW_VOLTAGE_ANCHOR_V = 3.25; // near-empty voltage anchor point
const LOW_VOLTAGE_ANCHOR_LOAD_MA = 50; // "light/no load" ceiling for that anchor
const LOW_VOLTAGE_ANCHOR_SOC_PCT = 0;

// A gap this large (device offline, boot delay, clock jump) makes the
// elapsed-time term unreliable, so the packet's current is not integrated —
// it can still trigger a re-anchor below.
const MAX_INTEGRATION_GAP_SECONDS = 6 * 3600;

const clampSoc = (pct) => Math.max(0, Math.min(100, pct));

/**
 * @param {object} params
 * @param {number|null} params.prevSocPct - last known SoC%, or null if unknown
 * @param {number|null} params.prevUpdatedAtUnix - unix seconds of the reading prevSocPct was computed at
 * @param {number|null} params.currentMa - this packet's signed battery current (mA)
 * @param {number|null} params.busV - this packet's battery bus voltage (V)
 * @param {number} params.recordedAtUnix - this packet's recorded_at (unix seconds)
 * @param {number|null} params.capacityAh - control battery capacity (Ah)
 * @param {number|null} [params.fallbackPct] - starting point when there is no prior SoC to integrate from
 * @returns {{ socPct: number, updatedAtUnix: number }}
 */
export function computeSoc({
  prevSocPct,
  prevUpdatedAtUnix,
  currentMa,
  busV,
  recordedAtUnix,
  capacityAh,
  fallbackPct = null
}) {
  const hasCurrent = Number.isFinite(currentMa);
  const hasVoltage = Number.isFinite(busV);
  const hasCapacity = Number.isFinite(capacityAh) && capacityAh > 0;
  const hasPrev = Number.isFinite(prevSocPct);

  let socPct = hasPrev ? prevSocPct : null;

  if (
    hasCurrent &&
    hasCapacity &&
    Number.isFinite(prevUpdatedAtUnix) &&
    Number.isFinite(recordedAtUnix)
  ) {
    const dtSeconds = recordedAtUnix - prevUpdatedAtUnix;
    if (dtSeconds > 0 && dtSeconds < MAX_INTEGRATION_GAP_SECONDS) {
      const base = socPct ?? clampSoc(Number.isFinite(fallbackPct) ? fallbackPct : 50);
      const chargeDeltaAh = (currentMa / 1000) * (dtSeconds / 3600);
      socPct = base + (chargeDeltaAh / capacityAh) * 100;
    }
  }

  if (socPct === null) {
    socPct = Number.isFinite(fallbackPct) ? fallbackPct : 50;
  }

  if (
    hasCurrent &&
    hasVoltage &&
    currentMa >= 0 &&
    currentMa < CHARGE_TERM_CURRENT_MA &&
    busV >= CHARGE_TERM_VOLTAGE_V
  ) {
    socPct = 100;
  } else if (
    hasVoltage &&
    busV <= LOW_VOLTAGE_ANCHOR_V &&
    (!hasCurrent || Math.abs(currentMa) < LOW_VOLTAGE_ANCHOR_LOAD_MA)
  ) {
    socPct = LOW_VOLTAGE_ANCHOR_SOC_PCT;
  }

  // The persisted reference timestamp only ever moves forward, so an
  // out-of-order/duplicate packet can't drag the next real reading's dt
  // negative.
  const updatedAtUnix = Number.isFinite(prevUpdatedAtUnix)
    ? Math.max(prevUpdatedAtUnix, recordedAtUnix)
    : recordedAtUnix;

  return { socPct: clampSoc(socPct), updatedAtUnix };
}

export default { computeSoc };
