import { query } from '../config/db.js';
import { createModel } from './baseModel.js';
import { unixSecondsToUtcDatetime } from '../utils/time.js';

const turtlesModel = createModel('turtles_tb', 'turtle_id');

turtlesModel.searchPublic = async (searchQuery, limit = 20) => {
  if (!searchQuery) {
    return [];
  }

  // mysql2's `execute()` (prepared statements) can't bind LIMIT as a `?`
  // placeholder — it throws "Incorrect arguments to mysqld_stmt_execute".
  // Validate to a plain integer and inline it instead.
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);
  const turtleIdMatch = /^\d+$/.test(searchQuery) ? Number(searchQuery) : null;

  const sql = `
    SELECT
      t.turtle_id,
      t.name,
      t.status,
      m.full_name AS mission_name,
      h.name AS hub_name,
      photo.url AS profile_photo_url
    FROM turtles_tb t
    LEFT JOIN missions_tb m ON t.mission_id = m.mission_id
    LEFT JOIN hubs_tb h ON t.hub_id = h.hub_id
    LEFT JOIN photos_tb photo ON photo.photo_id = t.profile_photo_id
    WHERE t.name LIKE ? OR t.turtle_id = ?
    ORDER BY t.created_at DESC
    LIMIT ${safeLimit}
  `;

  return query(sql, [`%${searchQuery}%`, turtleIdMatch]);
};

turtlesModel.getAllDetailed = async () => {
  const sql = `
    SELECT t.*, m.full_name AS mission_name, h.name AS hub_name
    FROM turtles_tb t
    LEFT JOIN missions_tb m ON t.mission_id = m.mission_id
    LEFT JOIN hubs_tb h ON t.hub_id = h.hub_id
    ORDER BY t.created_at DESC
  `;
  return query(sql);
};

turtlesModel.getAllWithRelations = async () => {
  const sql = `
    SELECT
      t.turtle_id,
      t.name,
      t.status,
      t.profile_photo_id,
      t.last_update,
      t.mission_id,
      t.hub_id,
      t.boat_id,
      t.turtle_manager,
      t.control_battery_capacity_ah,
      t.servo_battery_capacity_ah,
      m.full_name AS mission_name,
      h.name AS hub_name,
      b.name AS boat_name,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
        NULLIF(u.full_name, ''),
        u.email,
        ''
      ) AS manager_name,
      COALESCE(bottle_counts.bottle_count, 0) AS bottle_count,
      COALESCE(log_counts.log_count, 0) AS log_count,
      profile_photo.url AS profile_photo_url,
      profile_photo.thumbnail_url AS profile_photo_thumbnail_url
    FROM turtles_tb t
    LEFT JOIN missions_tb m ON t.mission_id = m.mission_id
    LEFT JOIN hubs_tb h ON t.hub_id = h.hub_id
    LEFT JOIN boats_tb b ON t.boat_id = b.boat_id
    LEFT JOIN users_tb u ON t.turtle_manager = u.buwana_id
    LEFT JOIN photos_tb profile_photo ON profile_photo.photo_id = t.profile_photo_id
    LEFT JOIN (
      SELECT turtle_id, COUNT(*) AS bottle_count
      FROM bottles_tb
      GROUP BY turtle_id
    ) AS bottle_counts ON bottle_counts.turtle_id = t.turtle_id
    LEFT JOIN (
      SELECT turtle_id, COUNT(*) AS log_count
      FROM telemetry_tb
      GROUP BY turtle_id
    ) AS log_counts ON log_counts.turtle_id = t.turtle_id
    ORDER BY
      CASE WHEN m.full_name IS NULL OR m.full_name = '' THEN 1 ELSE 0 END,
      m.full_name,
      t.name,
      t.turtle_id
  `;
  return query(sql);
};

turtlesModel.getManagedWithRelations = async (managerId) => {
  if (!managerId) {
    return [];
  }

  const sql = `
    SELECT
      t.turtle_id,
      t.name,
      t.status,
      t.last_machine_state,
      t.last_update,
      t.profile_photo_id,
      t.mission_id,
      t.hub_id,
      t.boat_id,
      t.turtle_manager,
      t.control_battery_capacity_ah,
      t.servo_battery_capacity_ah,
      t.battery_soc_pct,
      m.full_name AS mission_name,
      h.name AS hub_name,
      b.name AS boat_name,
      COALESCE(bottle_counts.bottle_count, 0) AS bottle_count,
      profile_photo.url AS profile_photo_url,
      profile_photo.thumbnail_url AS profile_photo_thumbnail_url
    FROM turtles_tb t
    LEFT JOIN missions_tb m ON t.mission_id = m.mission_id
    LEFT JOIN hubs_tb h ON t.hub_id = h.hub_id
    LEFT JOIN boats_tb b ON t.boat_id = b.boat_id
    LEFT JOIN photos_tb profile_photo ON profile_photo.photo_id = t.profile_photo_id
    LEFT JOIN (
      SELECT turtle_id, COUNT(*) AS bottle_count
      FROM bottles_tb
      GROUP BY turtle_id
    ) AS bottle_counts ON bottle_counts.turtle_id = t.turtle_id
    WHERE t.turtle_manager = ?
    ORDER BY t.last_update IS NULL, t.last_update DESC, t.turtle_id DESC
  `;

  return query(sql, [managerId]);
};

turtlesModel.getManagedById = async (turtleId, managerId) => {
  if (!turtleId || !managerId) {
    return null;
  }

  const sql = `
    SELECT
      t.turtle_id,
      t.name,
      t.status,
      t.mission_id,
      t.hub_id,
      t.boat_id,
      t.turtle_manager,
      m.full_name AS mission_name,
      h.name AS hub_name,
      b.name AS boat_name
    FROM turtles_tb t
    LEFT JOIN missions_tb m ON t.mission_id = m.mission_id
    LEFT JOIN hubs_tb h ON t.hub_id = h.hub_id
    LEFT JOIN boats_tb b ON t.boat_id = b.boat_id
    WHERE t.turtle_id = ? AND t.turtle_manager = ?
    LIMIT 1
  `;

  const rows = await query(sql, [turtleId, managerId]);
  return rows[0] ?? null;
};

turtlesModel.getWithRelationsById = async (turtleId) => {
  if (!turtleId) {
    return null;
  }

  const sql = `
    SELECT
      t.*,
      m.full_name AS mission_name,
      h.name AS hub_name,
      b.name AS boat_name,
      profile_photo.url AS profile_photo_url,
      profile_photo.thumbnail_url AS profile_photo_thumbnail_url
    FROM turtles_tb t
    LEFT JOIN missions_tb m ON t.mission_id = m.mission_id
    LEFT JOIN hubs_tb h ON t.hub_id = h.hub_id
    LEFT JOIN boats_tb b ON t.boat_id = b.boat_id
    LEFT JOIN photos_tb profile_photo ON profile_photo.photo_id = t.profile_photo_id
    WHERE t.turtle_id = ?
    LIMIT 1
  `;

  const rows = await query(sql, [turtleId]);
  return rows[0] ?? null;
};

turtlesModel.touchLiveness = async (
  turtleId,
  {
    lat = null,
    lng = null,
    solarCharge = null,
    machineState = null,
    batterySocPct = null,
    batterySocUpdatedAtUnix = null
  } = {}
) => {
  const assignments = ['last_update = UTC_TIMESTAMP()', "status = IF(status = 'awaiting_serial', 'idle', status)"];
  const params = [];

  // (0, 0) is "null island", not a real fix — never let it overwrite a
  // previously known-good last_lat/last_lng.
  if (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    !(Number(lat) === 0 && Number(lng) === 0)
  ) {
    assignments.push('last_lat = ?', 'last_lng = ?');
    params.push(Number(lat), Number(lng));
  }
  if (Number.isFinite(Number(solarCharge))) {
    assignments.push('solar_charge = ?');
    params.push(Number(solarCharge));
  }
  // Firmware autonomy state from the newest reading. Deliberately does NOT
  // touch the mission-lifecycle `status` column — the two are independent.
  if (typeof machineState === 'string' && machineState.length) {
    assignments.push('last_machine_state = ?');
    params.push(machineState);
  }
  // Running coulomb-counted SoC, persisted with the reading it was
  // integrated up to so the next packet's dt survives a server restart.
  if (Number.isFinite(Number(batterySocPct)) && Number.isFinite(Number(batterySocUpdatedAtUnix))) {
    assignments.push('battery_soc_pct = ?', 'battery_soc_updated_at = ?');
    params.push(Number(batterySocPct), unixSecondsToUtcDatetime(batterySocUpdatedAtUnix));
  }

  params.push(turtleId);
  await query(`UPDATE turtles_tb SET ${assignments.join(', ')} WHERE turtle_id = ?`, params);
};

// Manager's IANA time zone, used to reset daily energy rollups at local
// midnight. Falls back to UTC when the turtle has no manager or the
// manager hasn't set one.
turtlesModel.getManagerTimeZone = async (turtleId) => {
  const rows = await query(
    `SELECT u.time_zone
     FROM turtles_tb t
     LEFT JOIN users_tb u ON t.turtle_manager = u.buwana_id
     WHERE t.turtle_id = ?
     LIMIT 1`,
    [turtleId]
  );
  const timeZone = rows[0]?.time_zone;
  return typeof timeZone === 'string' && timeZone.length ? timeZone : 'Etc/UTC';
};

turtlesModel.getDeviceInfo = async (turtleId) => {
  const sql = `
    SELECT
      t.turtle_id,
      t.name,
      m.short_name AS mission_short_name,
      m.full_name  AS mission_full_name,
      h.name AS hub_name,
      u.time_zone,
      -- Bottles currently assigned to this turtle. Not "aboard": bottles_tb has
      -- no lifecycle state yet, so a recovered bottle still counts. See
      -- docs/july_tasks.md task 1.
      (SELECT COUNT(*) FROM bottles_tb b WHERE b.turtle_id = t.turtle_id) AS bottle_count
    FROM turtles_tb t
    LEFT JOIN missions_tb m ON t.mission_id = m.mission_id
    LEFT JOIN hubs_tb h ON t.hub_id = h.hub_id
    LEFT JOIN users_tb u ON t.turtle_manager = u.buwana_id
    WHERE t.turtle_id = ?
    LIMIT 1
  `;
  const rows = await query(sql, [turtleId]);
  return rows[0] ?? null;
};

turtlesModel.getForHub = async (hubId) => {
  if (!hubId) {
    return [];
  }

  const sql = `
    SELECT
      t.turtle_id,
      t.name,
      t.status,
      t.hub_id,
      t.turtle_manager,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
        NULLIF(u.full_name, ''),
        u.email,
        ''
      ) AS manager_name
    FROM turtles_tb t
    LEFT JOIN users_tb u ON t.turtle_manager = u.buwana_id
    WHERE t.hub_id = ?
    ORDER BY t.name, t.turtle_id
  `;

  return query(sql, [hubId]);
};

turtlesModel.getTelemetrySummary = async () => {
  const latestTimestamps = await query(
    `SELECT turtle_id, MAX(timestamp) AS last_contact FROM telemetry_tb GROUP BY turtle_id`
  );
  return latestTimestamps;
};

export default turtlesModel;
