import { query } from '../config/db.js';
import { createModel } from './baseModel.js';
import { unixSecondsToUtcDatetime, localDayBoundsUnix } from '../utils/time.js';

const telemetryModel = createModel('telemetry_tb', 'telemetry_id');

const toSafeLimit = (value, fallback, maximum = 500) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, maximum);
};

telemetryModel.getByTurtleId = async (turtleId, limit = 50) => {
  const safeLimit = toSafeLimit(limit, 50);
  const sql = `
    SELECT *
    FROM telemetry_tb
    WHERE turtle_id = ?
    ORDER BY timestamp DESC
    LIMIT ${safeLimit}
  `;
  return query(sql, [turtleId]);
};

telemetryModel.ingestReading = async ({
  turtleId,
  recordedAtUnix,
  lat = null,
  lon = null,
  batteryVoltage = null,
  batterySocPct = null,
  tempC = null,
  machineState = null,
  rawData
}) => {
  // INSERT IGNORE + uq_telemetry_turtle_ts keeps queued-retry duplicates idempotent.
  const sql = `
    INSERT IGNORE INTO telemetry_tb
      (turtle_id, \`timestamp\`, latitude, longitude, battery_voltage, battery_soc_pct, temp_c, connection, machine_state, raw_data, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'wifi', ?, ?, UTC_TIMESTAMP())
  `;
  const result = await query(sql, [
    turtleId,
    unixSecondsToUtcDatetime(recordedAtUnix),
    lat,
    lon,
    batteryVoltage,
    batterySocPct,
    tempC,
    machineState,
    rawData
  ]);
  return result.affectedRows === 1;
};

// Chart-ready trend rows. Sensor values live in raw_data.values (JSON written
// by deviceApiController), so they are extracted per-row; CAST yields NULL for
// readings that lack a given sensor, which the charts render as gaps.
const TREND_VALUE_FIELDS = [
  'ens_eco2',
  'ens_tvoc',
  'ens_aqi',
  'aht_temp',
  'rtc_temp',
  'bme_temp',
  'aht_humidity',
  'bme_humidity',
  'ina_batt_pct',
  'ina_bus_v',
  'ina_current_ma'
];

telemetryModel.getTrendsForTurtle = async (turtleId, hours = 25) => {
  const parsed = Number.parseFloat(hours);
  const safeHours = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0.25), 721) : 25;
  const minutes = Math.round(safeHours * 60);

  const valueColumns = TREND_VALUE_FIELDS.map(
    (field) => `CAST(JSON_EXTRACT(raw_data, '$.values.${field}') AS DOUBLE) AS ${field}`
  ).join(',\n      ');

  // TIMESTAMPDIFF is pure arithmetic and ignores @@session.time_zone, unlike
  // UNIX_TIMESTAMP() which interprets the stored UTC datetime as local time.
  const sql = `
    SELECT
      telemetry_id,
      TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', \`timestamp\`) AS ts,
      latitude,
      longitude,
      raw_data,
      battery_soc_pct,
      ${valueColumns}
    FROM telemetry_tb
    WHERE turtle_id = ?
      AND \`timestamp\` >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
    ORDER BY \`timestamp\` ASC
    LIMIT 5000
  `;
  return query(sql, [turtleId, minutes]);
};

// Daily energy rollup: Wh harvested (current > 0) and Wh consumed
// (current < 0), reset at local midnight in `timeZone`. Each sample's
// voltage*current is integrated over the elapsed time since the *previous*
// sample (the same discrete-integration approach the coulomb counter uses),
// so a lone first-of-day sample contributes nothing until a second arrives.
telemetryModel.getDailyEnergyForTurtle = async (turtleId, timeZone = 'Etc/UTC') => {
  const { startUnix, endUnix } = localDayBoundsUnix(timeZone);

  const sql = `
    SELECT
      TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', \`timestamp\`) AS ts,
      CAST(JSON_EXTRACT(raw_data, '$.values.ina_bus_v') AS DOUBLE) AS ina_bus_v,
      CAST(JSON_EXTRACT(raw_data, '$.values.ina_current_ma') AS DOUBLE) AS ina_current_ma
    FROM telemetry_tb
    WHERE turtle_id = ?
      AND \`timestamp\` >= ?
      AND \`timestamp\` < ?
    ORDER BY \`timestamp\` ASC
    LIMIT 20000
  `;
  const rows = await query(sql, [
    turtleId,
    unixSecondsToUtcDatetime(startUnix),
    unixSecondsToUtcDatetime(endUnix)
  ]);

  let harvestedWh = 0;
  let consumedWh = 0;
  let prevTs = null;
  for (const row of rows) {
    const v = Number(row.ina_bus_v);
    const i = Number(row.ina_current_ma);
    const hasSample = Number.isFinite(v) && Number.isFinite(i);
    if (hasSample && prevTs !== null) {
      const dtHours = (row.ts - prevTs) / 3600;
      if (dtHours > 0 && dtHours < 6) {
        const wh = ((v * i) / 1000) * dtHours;
        if (i > 0) harvestedWh += wh;
        else if (i < 0) consumedWh += -wh;
      }
    }
    if (hasSample) prevTs = row.ts;
  }

  return {
    harvestedWh: Math.round(harvestedWh * 100) / 100,
    consumedWh: Math.round(consumedWh * 100) / 100,
    dayStart: startUnix,
    dayEnd: endUnix,
    timeZone
  };
};

telemetryModel.deleteByIdsForTurtle = async (telemetryIds, turtleId) => {
  const ids = (Array.isArray(telemetryIds) ? telemetryIds : [])
    .map((id) => Number.parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0)
    .slice(0, 500);
  if (!ids.length) {
    return 0;
  }
  const placeholders = ids.map(() => '?').join(', ');
  // Scoping by turtle_id keeps the delete inside the caller-verified turtle.
  const sql = `DELETE FROM telemetry_tb WHERE turtle_id = ? AND telemetry_id IN (${placeholders})`;
  const result = await query(sql, [turtleId, ...ids]);
  return result.affectedRows ?? 0;
};

telemetryModel.getLatestForTurtle = async (turtleId) => {
  const rows = await query(
    'SELECT * FROM telemetry_tb WHERE turtle_id = ? ORDER BY `timestamp` DESC LIMIT 1',
    [turtleId]
  );
  return rows[0] ?? null;
};

telemetryModel.getLatest = async () => {
  const sql = `
    SELECT t1.*
    FROM telemetry_tb t1
    INNER JOIN (
      SELECT turtle_id, MAX(timestamp) AS latest
      FROM telemetry_tb
      GROUP BY turtle_id
    ) t2 ON t1.turtle_id = t2.turtle_id AND t1.timestamp = t2.latest
  `;
  return query(sql);
};

export default telemetryModel;
