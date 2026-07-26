import { query } from '../config/db.js';
import { createModel } from './baseModel.js';

const turtlesModel = createModel('turtles_tb', 'turtle_id');

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
    ORDER BY t.turtle_id DESC
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
  { lat = null, lng = null, solarCharge = null, machineState = null } = {}
) => {
  const assignments = ['last_update = UTC_TIMESTAMP()', "status = IF(status = 'awaiting_serial', 'idle', status)"];
  const params = [];

  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
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

  params.push(turtleId);
  await query(`UPDATE turtles_tb SET ${assignments.join(', ')} WHERE turtle_id = ?`, params);
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

turtlesModel.getTelemetrySummary = async () => {
  const latestTimestamps = await query(
    `SELECT turtle_id, MAX(timestamp) AS last_contact FROM telemetry_tb GROUP BY turtle_id`
  );
  return latestTimestamps;
};

export default turtlesModel;
