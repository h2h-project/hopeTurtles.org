import { query } from '../config/db.js';
import { createModel } from './baseModel.js';

const hubsModel = createModel('hubs_tb', 'hub_id');

hubsModel.getAllWithStats = async () => {
  const sql = `
    SELECT
      h.*,
      COALESCE(mission_link.full_name, mission_map.mission_name) AS mission_name,
      COALESCE(boat_counts.boat_count, 0) AS boat_count,
      COALESCE(bottle_counts.bottle_count, 0) AS bottle_count,
      COALESCE(turtle_counts.turtle_count, 0) AS turtle_count
    FROM hubs_tb h
    LEFT JOIN missions_tb AS mission_link ON mission_link.mission_id = h.mission_id
    LEFT JOIN (
      SELECT
        t.hub_id,
        GROUP_CONCAT(DISTINCT m.full_name ORDER BY m.full_name SEPARATOR ', ') AS mission_name
      FROM turtles_tb t
      INNER JOIN missions_tb m ON m.mission_id = t.mission_id
      WHERE t.hub_id IS NOT NULL AND t.mission_id IS NOT NULL
      GROUP BY t.hub_id
    ) AS mission_map ON mission_map.hub_id = h.hub_id
    LEFT JOIN (
      SELECT hub_id, COUNT(*) AS boat_count
      FROM boats_tb
      WHERE hub_id IS NOT NULL
      GROUP BY hub_id
    ) AS boat_counts ON boat_counts.hub_id = h.hub_id
    LEFT JOIN (
      SELECT hub_id, COUNT(*) AS turtle_count
      FROM turtles_tb
      WHERE hub_id IS NOT NULL
      GROUP BY hub_id
    ) AS turtle_counts ON turtle_counts.hub_id = h.hub_id
    LEFT JOIN (
      SELECT t.hub_id, COUNT(b.bottle_id) AS bottle_count
      FROM turtles_tb t
      INNER JOIN bottles_tb b ON b.turtle_id = t.turtle_id
      WHERE t.hub_id IS NOT NULL
      GROUP BY t.hub_id
    ) AS bottle_counts ON bottle_counts.hub_id = h.hub_id
    ORDER BY h.name
  `;

  return query(sql);
};

export default hubsModel;
