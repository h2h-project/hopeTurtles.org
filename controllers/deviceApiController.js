import telemetryModel from '../models/telemetryModel.js';
import turtlesModel from '../models/turtlesModel.js';
import { computeSoc } from '../utils/batterySoc.js';
import { tzOffsetMinAt } from '../utils/time.js';

// Device-facing endpoints speak the turtleOS wire protocol (ported from
// the turtleAPI reference implementation): responses use { ok: ... },
// any 2xx is treated as success by the firmware, and `server_now`
// (Unix seconds) is parsed for clock-drift display.

const MAX_BATCH = 1000;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const finiteOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const firstFinite = (...values) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
};

const serverNow = () => Math.floor(Date.now() / 1000);

// turtleOS autonomy states (src/nav/state_machine.py). Lenient by design:
// an unknown value is stored as NULL rather than rejecting the reading.
const MACHINE_STATES = new Set(['BOOT', 'ACQUIRE', 'SAIL_NAV', 'ARRIVAL', 'SAFE']);

const normalizeMachineState = (value) => {
  if (typeof value !== 'string') return null;
  const state = value.trim().toUpperCase().replace(/-/g, '_');
  return MACHINE_STATES.has(state) ? state : null;
};

// ------------------------------------------------------------
// Validation (mirrors turtleAPI src/routes/v1/telemetry.js)
// ------------------------------------------------------------
const validateTelemetryBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Body must be a JSON object';
  }

  const { recorded_at: recordedAt, values, confidence, flags, lat, lon, alt_m: altM } = body;

  if (!isFiniteNumber(recordedAt)) {
    return '`recorded_at` must be a unix timestamp number (seconds)';
  }

  // 2000-01-01 .. 2100-01-01 rough guardrails
  if (recordedAt < 946684800 || recordedAt > 4102444800) {
    return '`recorded_at` out of expected range';
  }

  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return '`values` must be an object';
  }

  if (Object.keys(values).length === 0) {
    return '`values` must not be empty';
  }

  if (confidence && (typeof confidence !== 'object' || Array.isArray(confidence))) {
    return '`confidence` must be an object if provided';
  }

  if (flags && (typeof flags !== 'object' || Array.isArray(flags))) {
    return '`flags` must be an object if provided';
  }

  if (lat !== undefined && lat !== null) {
    if (!isFiniteNumber(lat)) return '`lat` must be a number';
    if (lat < -90 || lat > 90) return '`lat` out of range';
  }

  if (lon !== undefined && lon !== null) {
    if (!isFiniteNumber(lon)) return '`lon` must be a number';
    if (lon < -180 || lon > 180) return '`lon` out of range';
  }

  if (altM !== undefined && altM !== null && !isFiniteNumber(altM)) {
    return '`alt_m` must be a number';
  }

  return null;
};

// Boot-garbage gate: a freshly powered sensor can report exact zeros
// before warmup. TVOC/AQI may legitimately be 0, so only block fields
// where zero is physically implausible — or a payload of all zeros.
const isBadZeroTelemetry = (values) => {
  const suspectKeys = ['aht_temp', 'aht_humidity', 'ens_eco2'];

  for (const key of suspectKeys) {
    const value = values[key];
    if (value !== undefined && value !== null) {
      const n = Number(value);
      if (Number.isFinite(n) && n === 0) {
        return `invalid_zero_${key}`;
      }
    }
  }

  const numericValues = Object.values(values).filter((value) => Number.isFinite(Number(value)));
  if (numericValues.length > 0 && numericValues.every((value) => Number(value) === 0)) {
    return 'invalid_all_numeric_zero';
  }

  return null;
};

// Sign convention for ina_current_ma (high-side shunt on the battery's
// positive lead, net battery current): positive = charging into the
// battery, negative = discharging out of it. Passed through unmodified
// below — this is the only place that convention needs stating.
const buildIngestArgs = (turtleId, body, batterySocPct = null) => {
  const values = body.values;
  const tempC = firstFinite(values.aht_temp, values.scd_temp, values.bme_temp);

  return {
    turtleId,
    recordedAtUnix: body.recorded_at,
    lat: finiteOrNull(body.lat),
    lon: finiteOrNull(body.lon),
    batteryVoltage: finiteOrNull(values.ina_bus_v),
    batterySocPct,
    tempC: tempC === null ? null : Math.round(tempC * 10) / 10,
    machineState: normalizeMachineState(body.machine_state),
    rawData: JSON.stringify({
      values,
      flags: body.flags ?? null,
      confidence: body.confidence ?? null,
      alt_m: body.alt_m ?? null
    })
  };
};

// Integrates one packet's current/voltage into the turtle's running
// coulomb-counted SoC. `prevState` is the turtle's persisted state
// (survives restarts); `fallbackPct` seeds SoC on a turtle's very first
// packet, when there's nothing yet to integrate from.
const integrateBatterySoc = (prevState, body) =>
  computeSoc({
    prevSocPct: finiteOrNull(prevState.battery_soc_pct),
    prevUpdatedAtUnix: prevState.battery_soc_updated_at
      ? Math.floor(new Date(prevState.battery_soc_updated_at).getTime() / 1000)
      : null,
    currentMa: finiteOrNull(body.values.ina_current_ma),
    busV: finiteOrNull(body.values.ina_bus_v),
    recordedAtUnix: body.recorded_at,
    capacityAh: finiteOrNull(prevState.control_battery_capacity_ah),
    fallbackPct: finiteOrNull(body.values.ina_batt_pct)
  });

// ------------------------------------------------------------
// POST /api/v1/telemetry
// ------------------------------------------------------------
export const postTelemetry = async (req, res) => {
  const validationError = validateTelemetryBody(req.body);
  if (validationError) {
    return res.status(400).json({ ok: false, error: 'bad_payload', message: validationError });
  }

  const turtleId = req.turtle.turtle_id;

  // TEMP diagnostic for the discharge-current-reads-0 investigation — remove
  // once confirmed whether the sign is already lost by the time it reaches us.
  if (req.body.values.ina_current_ma !== undefined) {
    console.log('telemetry raw ina_current_ma:', turtleId, req.body.values.ina_current_ma);
  }

  const zeroError = isBadZeroTelemetry(req.body.values);
  if (zeroError) {
    console.log('telemetry ignored:', turtleId, zeroError);
    return res.status(202).json({ ok: true, ignored: true, reason: zeroError, server_now: serverNow() });
  }

  try {
    const { socPct, updatedAtUnix } = integrateBatterySoc(req.turtle, req.body);
    const args = buildIngestArgs(turtleId, req.body, socPct);
    await telemetryModel.ingestReading(args);
    await turtlesModel.touchLiveness(turtleId, {
      lat: args.lat,
      lng: args.lon,
      solarCharge: finiteOrNull(req.body.values.ina_batt_pct),
      machineState: args.machineState,
      batterySocPct: socPct,
      batterySocUpdatedAtUnix: updatedAtUnix
    });

    return res.status(200).json({ ok: true, server_now: serverNow() });
  } catch (error) {
    console.error('telemetry error:', error?.stack || error?.message || error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

// ------------------------------------------------------------
// POST /api/v1/telemetry/batch — drains the device's offline queue
// ------------------------------------------------------------
export const postTelemetryBatch = async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({
      ok: false,
      error: 'bad_payload',
      message: 'Body must be a JSON array of telemetry readings'
    });
  }

  const readings = req.body;

  if (readings.length === 0) {
    return res.status(200).json({ ok: true, accepted: 0, ignored: 0, server_now: serverNow() });
  }

  if (readings.length > MAX_BATCH) {
    return res.status(400).json({
      ok: false,
      error: 'batch_too_large',
      message: `Batch size ${readings.length} exceeds maximum ${MAX_BATCH}`
    });
  }

  const turtleId = req.turtle.turtle_id;

  const toInsert = [];
  let ignored = 0;

  readings.forEach((reading, index) => {
    const validationError = validateTelemetryBody(reading);
    if (validationError) {
      console.log(`telemetry batch[${index}] invalid:`, turtleId, validationError);
      ignored += 1;
      return;
    }
    const zeroError = isBadZeroTelemetry(reading.values);
    if (zeroError) {
      console.log(`telemetry batch[${index}] ignored:`, turtleId, zeroError);
      ignored += 1;
      return;
    }
    toInsert.push(reading);
  });

  if (toInsert.length === 0) {
    return res.status(202).json({ ok: true, accepted: 0, ignored, server_now: serverNow() });
  }

  try {
    let accepted = 0;
    let liveness = null;
    let newestState = null;

    // Coulomb counting must integrate in chronological order even though a
    // queued batch can arrive out of order — compute each reading's SoC in
    // a sorted pass first, independent of the insertion loop below.
    let batterySoc = {
      battery_soc_pct: req.turtle.battery_soc_pct,
      battery_soc_updated_at: req.turtle.battery_soc_updated_at,
      control_battery_capacity_ah: req.turtle.control_battery_capacity_ah
    };
    const socOrdered = [...toInsert].sort((a, b) => a.recorded_at - b.recorded_at);
    for (const reading of socOrdered) {
      const { socPct, updatedAtUnix } = integrateBatterySoc(batterySoc, reading);
      reading._batterySocPct = socPct;
      batterySoc = {
        battery_soc_pct: socPct,
        battery_soc_updated_at: new Date(updatedAtUnix * 1000),
        control_battery_capacity_ah: req.turtle.control_battery_capacity_ah
      };
    }
    const finalBatterySocPct = batterySoc.battery_soc_pct;
    const finalBatterySocUpdatedAtUnix = Math.floor(
      new Date(batterySoc.battery_soc_updated_at).getTime() / 1000
    );

    for (const reading of toInsert) {
      const args = buildIngestArgs(turtleId, reading, reading._batterySocPct);
      // eslint-disable-next-line no-await-in-loop
      const inserted = await telemetryModel.ingestReading(args);
      if (inserted) {
        accepted += 1;
      }
      // Liveness comes from the newest reading carrying a GPS fix.
      if (
        args.lat !== null &&
        args.lon !== null &&
        (!liveness || reading.recorded_at > liveness.recordedAt)
      ) {
        liveness = {
          recordedAt: reading.recorded_at,
          lat: args.lat,
          lng: args.lon,
          solarCharge: finiteOrNull(reading.values.ina_batt_pct)
        };
      }
      // Machine state comes from the newest reading overall (a queued
      // backlog may end on readings without a GPS fix).
      if (
        args.machineState !== null &&
        (!newestState || reading.recorded_at > newestState.recordedAt)
      ) {
        newestState = { recordedAt: reading.recorded_at, machineState: args.machineState };
      }
    }

    await turtlesModel.touchLiveness(turtleId, {
      ...(liveness ?? {}),
      machineState: newestState?.machineState ?? null,
      batterySocPct: finalBatterySocPct,
      batterySocUpdatedAtUnix: finalBatterySocUpdatedAtUnix
    });

    console.log(
      `telemetry batch: turtle=${turtleId} accepted=${accepted} ignored=${ignored} total=${readings.length}`
    );

    return res.status(200).json({ ok: true, accepted, ignored, server_now: serverNow() });
  } catch (error) {
    console.error('telemetry batch error:', error?.stack || error?.message || error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

// ------------------------------------------------------------
// GET /api/v1/device — boot/runtime device-info lookup.
// turtleOS accepts this flat shape; `ts` (epoch ms) and `tz_offset_min`
// drive its RTC and timezone sync, and main.py requires `ok` truthy.
//
// hopeturtles fields only. The airOS-heritage keys (home_name, room_name,
// community_name) were dropped 2026-07: airOS devices talk to
// air2.earthen.io, never here, and those keys were a renamed hub, a
// duplicate of mission_full_name, and a hardcoded literal. `hub_name`
// carries the real hubs_tb value under an honest name.
//
// `?compact=1` is sent by the firmware and deliberately ignored — with the
// airOS fields gone there is nothing left worth trimming.
// ------------------------------------------------------------
export const getDevice = async (req, res) => {
  const turtleId = req.turtle.turtle_id;

  try {
    const info = await turtlesModel.getDeviceInfo(turtleId);
    if (!info) {
      return res.status(404).json({ ok: false, error: 'device_not_found' });
    }

    const timeZone =
      typeof info.time_zone === 'string' && info.time_zone.length ? info.time_zone : 'Etc/UTC';
    const tzOffsetMin = tzOffsetMinAt(new Date(), timeZone);

    await turtlesModel.touchLiveness(turtleId, {});

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      device_id: String(info.turtle_id),
      device_name: info.name ?? null,
      hub_name: info.hub_name ?? null,
      mission_short_name: info.mission_short_name ?? null,
      mission_full_name: info.mission_full_name ?? null,
      bottle_count: Number(info.bottle_count ?? 0),
      time_zone: timeZone,
      tz_offset_min: tzOffsetMin,
      ts: Date.now(),
      server_now: serverNow()
    });
  } catch (error) {
    console.error('GET /api/v1/device error:', error?.stack || error?.message || error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

export default { postTelemetry, postTelemetryBatch, getDevice };
