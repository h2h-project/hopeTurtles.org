import { query } from '../config/db.js';
import { createModel } from './baseModel.js';

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

// Device clock time arrives as Unix seconds; convert in JS rather than
// FROM_UNIXTIME() because the MySQL session timezone is not pinned to UTC.
const unixSecondsToUtcDatetime = (unixSeconds) =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');

telemetryModel.ingestReading = async ({
  turtleId,
  recordedAtUnix,
  lat = null,
  lon = null,
  batteryVoltage = null,
  tempC = null,
  rawData
}) => {
  // INSERT IGNORE + uq_telemetry_turtle_ts keeps queued-retry duplicates idempotent.
  const sql = `
    INSERT IGNORE INTO telemetry_tb
      (turtle_id, \`timestamp\`, latitude, longitude, battery_voltage, temp_c, connection, raw_data, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, 'wifi', ?, UTC_TIMESTAMP())
  `;
  const result = await query(sql, [
    turtleId,
    unixSecondsToUtcDatetime(recordedAtUnix),
    lat,
    lon,
    batteryVoltage,
    tempC,
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

  const sql = `
    SELECT
      telemetry_id,
      UNIX_TIMESTAMP(\`timestamp\`) AS ts,
      latitude,
      longitude,
      ${valueColumns}
    FROM telemetry_tb
    WHERE turtle_id = ?
      AND \`timestamp\` >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
    ORDER BY \`timestamp\` ASC
    LIMIT 5000
  `;
  return query(sql, [turtleId, minutes]);
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
