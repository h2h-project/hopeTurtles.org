import { query } from '../config/db.js';
import { createModel } from './baseModel.js';

const boatsModel = createModel('boats_tb', 'boat_id');

boatsModel.getAllWithStats = async () => {
  const sql = `
    SELECT
      b.*, 
      h.name AS hub_name,
      m.full_name AS mission_name,
      COALESCE(turtle_counts.turtle_count, 0) AS turtle_count,
      COALESCE(bottle_counts.bottle_count, 0) AS bottle_count
    FROM boats_tb b
    LEFT JOIN hubs_tb h ON h.hub_id = b.hub_id
    LEFT JOIN missions_tb m ON m.mission_id = h.mission_id
    LEFT JOIN (
      SELECT boat_id, COUNT(*) AS turtle_count
      FROM turtles_tb
      WHERE boat_id IS NOT NULL
      GROUP BY boat_id
    ) AS turtle_counts ON turtle_counts.boat_id = b.boat_id
    LEFT JOIN (
      SELECT t.boat_id, COUNT(b.bottle_id) AS bottle_count
      FROM turtles_tb t
      INNER JOIN bottles_tb b ON b.turtle_id = t.turtle_id
      WHERE t.boat_id IS NOT NULL
      GROUP BY t.boat_id
    ) AS bottle_counts ON bottle_counts.boat_id = b.boat_id
    ORDER BY b.name
  `;

  return query(sql);
};

export default boatsModel;
