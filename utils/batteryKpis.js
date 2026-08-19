// Battery health KPIs derived from the correctly-signed INA219 net current
// (positive = charging, negative = discharging) via coulomb counting.
//
// This is deliberately independent from utils/batterySoc.js, which persists a
// live running SoC% per telemetry packet as it's ingested (anchored with its
// own thresholds). The KPIs here are computed on demand over a query window
// so their anchoring behaviour and windows (7-day / all-time / per-night /
// per-day) can be tuned without touching the ingest-time persistence.
//
// A "reading" throughout this module is a plain { ts, currentMa, busV }
// object, ts in Unix seconds, ascending order, gaps allowed.

// Charger (BQ25185) is considered approaching termination once its charge
// current tapers below this, so SoC is re-anchored to 100% — bounds
// long-run coulomb-counting drift on the high end.
const CHARGE_TAPER_MA = 50;

// Bus voltage low enough, while discharging, to treat the battery as
// effectively empty — bounds drift on the low end.
const LOW_VOLTAGE_ANCHOR_V = 3.3;

// "Sustained" discharge at/below the low-voltage anchor — requires this many
// consecutive qualifying samples so a single transient sag under load
// doesn't falsely zero the running SoC.
const LOW_VOLTAGE_SUSTAINED_SAMPLES = 3;

// A gap this large (device offline, boot delay, clock jump) makes the
// elapsed-time term unreliable, so the packet's current is not integrated.
const MAX_INTEGRATION_GAP_SECONDS = 6 * 3600;

const FALLBACK_SOC_PCT = 50;

// A "night" is a run of consecutive samples with no reading above this
// current — i.e. no solar input — lasting at least the minimum duration.
const NIGHT_MAX_POSITIVE_CURRENT_MA = 20;
const NIGHT_MIN_DURATION_SECONDS = 30 * 60;

const round2 = (value) => Math.round(value * 100) / 100;
const clampSoc = (pct) => Math.max(0, Math.min(100, pct));

/**
 * Coulomb-counts a SoC% series from raw current/voltage readings, re-anchoring
 * at charger taper (→100%) and sustained low-voltage discharge (→0%).
 * @param {{ts:number, currentMa:number|null, busV:number|null}[]} readings - ascending by ts
 * @param {{capacityAh:number}} params
 * @returns {{ts:number, socPct:number}[]}
 */
export function computeSocSeries(readings, { capacityAh } = {}) {
  const hasCapacity = Number.isFinite(capacityAh) && capacityAh > 0;
  const series = [];
  let socPct = null;
  let prevIntegratedTs = null;
  let lowVoltageStreak = 0;

  for (const reading of readings) {
    const hasCurrent = Number.isFinite(reading.currentMa);
    const hasVoltage = Number.isFinite(reading.busV);
    if (!hasCurrent && !hasVoltage) continue;

    if (socPct === null) {
      socPct = FALLBACK_SOC_PCT;
    }

    if (hasCurrent && hasCapacity && prevIntegratedTs !== null) {
      const dtSeconds = reading.ts - prevIntegratedTs;
      if (dtSeconds > 0 && dtSeconds < MAX_INTEGRATION_GAP_SECONDS) {
        const chargeDeltaAh = (reading.currentMa / 1000) * (dtSeconds / 3600);
        socPct += (chargeDeltaAh / capacityAh) * 100;
      }
    }

    if (hasCurrent && reading.currentMa >= 0 && reading.currentMa < CHARGE_TAPER_MA) {
      socPct = 100;
    }

    if (hasCurrent && hasVoltage && reading.currentMa < 0 && reading.busV <= LOW_VOLTAGE_ANCHOR_V) {
      lowVoltageStreak += 1;
    } else {
      lowVoltageStreak = 0;
    }
    if (lowVoltageStreak >= LOW_VOLTAGE_SUSTAINED_SAMPLES) {
      socPct = 0;
    }

    socPct = clampSoc(socPct);
    series.push({ ts: reading.ts, socPct });
    if (hasCurrent) prevIntegratedTs = reading.ts;
  }

  return series;
}

/**
 * Running minimum SoC, reset on a rolling 7-day basis and separately
 * tracked all-time.
 */
export function computeMinSocKpis(socSeries, nowUnix, windowSeconds = 7 * 24 * 3600) {
  if (!socSeries.length) {
    return { allTime: null, last7d: null };
  }
  const cutoff = nowUnix - windowSeconds;
  let allTime = socSeries[0];
  let last7d = null;
  for (const point of socSeries) {
    if (point.socPct < allTime.socPct) allTime = point;
    if (point.ts >= cutoff && (!last7d || point.socPct < last7d.socPct)) last7d = point;
  }
  return {
    allTime: { pct: round2(allTime.socPct), atUnix: allTime.ts },
    last7d: last7d ? { pct: round2(last7d.socPct), atUnix: last7d.ts } : null
  };
}

/**
 * Segments readings into "nights" — runs with no reading above
 * NIGHT_MAX_POSITIVE_CURRENT_MA lasting at least NIGHT_MIN_DURATION_SECONDS —
 * and sums the negative-current energy (Wh consumed) within each.
 * @returns {{startUnix:number, endUnix:number, wh:number}[]}
 */
export function computeOvernightDrawdowns(readings) {
  const filtered = readings.filter((r) => Number.isFinite(r.currentMa) && Number.isFinite(r.busV));
  const nights = [];
  let run = [];

  const finalizeRun = () => {
    if (run.length >= 2) {
      const startUnix = run[0].ts;
      const endUnix = run[run.length - 1].ts;
      if (endUnix - startUnix >= NIGHT_MIN_DURATION_SECONDS) {
        let negativeWh = 0;
        for (let i = 1; i < run.length; i += 1) {
          const prev = run[i - 1];
          const cur = run[i];
          const dtHours = (cur.ts - prev.ts) / 3600;
          if (dtHours <= 0 || dtHours >= MAX_INTEGRATION_GAP_SECONDS / 3600) continue;
          if (cur.currentMa < 0) {
            negativeWh += ((cur.busV * cur.currentMa) / 1000) * dtHours;
          }
        }
        nights.push({ startUnix, endUnix, wh: round2(-negativeWh) });
      }
    }
    run = [];
  };

  for (const reading of filtered) {
    if (reading.currentMa <= NIGHT_MAX_POSITIVE_CURRENT_MA) {
      run.push(reading);
    } else {
      finalizeRun();
    }
  }
  finalizeRun();

  return nights;
}

export function worstOvernightDrawdown(nights) {
  return nights.reduce((worst, night) => (!worst || night.wh > worst.wh ? night : worst), null);
}

const localDateKey = (unixSeconds, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(unixSeconds * 1000));

/**
 * Net Wh (∫ V×I dt, signed) per local calendar day.
 * @returns {{dayKey:string, startUnix:number, endUnix:number, netWh:number, isDeficit:boolean}[]}
 * sorted ascending by dayKey.
 */
export function computeDailyNetEnergy(readings, { timeZone = 'Etc/UTC' } = {}) {
  const filtered = readings.filter((r) => Number.isFinite(r.currentMa) && Number.isFinite(r.busV));
  const byDay = new Map();

  for (let i = 1; i < filtered.length; i += 1) {
    const prev = filtered[i - 1];
    const cur = filtered[i];
    const dtHours = (cur.ts - prev.ts) / 3600;
    if (dtHours <= 0 || dtHours >= MAX_INTEGRATION_GAP_SECONDS / 3600) continue;

    const wh = ((cur.busV * cur.currentMa) / 1000) * dtHours;
    const dayKey = localDateKey(cur.ts, timeZone);
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, { dayKey, netWh: 0, startUnix: cur.ts, endUnix: cur.ts });
    }
    const entry = byDay.get(dayKey);
    entry.netWh += wh;
    entry.startUnix = Math.min(entry.startUnix, cur.ts);
    entry.endUnix = Math.max(entry.endUnix, cur.ts);
  }

  return Array.from(byDay.values())
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
    .map((day) => ({ ...day, netWh: round2(day.netWh), isDeficit: day.netWh < 0 }));
}

/** Drops today's (still-in-progress) bucket so streaks only count full days. */
export function excludeInProgressDay(days, nowUnix, timeZone = 'Etc/UTC') {
  const todayKey = localDateKey(nowUnix, timeZone);
  return days.filter((day) => day.dayKey !== todayKey);
}

/**
 * Current (trailing) and longest consecutive-deficit-day streaks within
 * `days` (expected sorted ascending, full days only).
 */
export function computeDeficitStreaks(days) {
  let longestStreak = null;
  let runStart = null;
  let runLength = 0;

  for (const day of days) {
    if (day.isDeficit) {
      if (runLength === 0) runStart = day.dayKey;
      runLength += 1;
      if (!longestStreak || runLength > longestStreak.length) {
        longestStreak = { length: runLength, startDayKey: runStart, endDayKey: day.dayKey };
      }
    } else {
      runLength = 0;
      runStart = null;
    }
  }

  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].isDeficit) currentStreak += 1;
    else break;
  }
  const currentStreakStart = currentStreak > 0 ? days[days.length - currentStreak].dayKey : null;

  return { currentStreak, currentStreakStart, longestStreak };
}

export default {
  computeSocSeries,
  computeMinSocKpis,
  computeOvernightDrawdowns,
  worstOvernightDrawdown,
  computeDailyNetEnergy,
  excludeInProgressDay,
  computeDeficitStreaks
};
