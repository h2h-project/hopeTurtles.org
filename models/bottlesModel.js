import { query } from '../config/db.js';
import createModel from './baseModel.js';

const bottlesModel = createModel('bottles_tb', 'bottle_id');

bottlesModel.getForPackerWithDetails = async (packerId) => {
  if (!packerId) {
    return [];
  }

  const sql = `
    SELECT
      b.bottle_id,
      b.serial_number,
      b.brand,
      b.volume_ml,
      b.turtle_id,
      b.hub_id,
      b.contents,
      b.weight_grams,
      b.status,
      b.verified,
      b.mission_id,
      b.bottle_basic_pic,
      b.bottle_selfie_pic,
      m.full_name AS mission_name,
      photo.url AS basic_photo_url,
      selfie.url AS selfie_photo_url,
      h.name AS hub_name,
      h.mailing_address AS hub_mailing_address,
      t.name AS turtle_name,
      t.hub_id AS turtle_hub_id
    FROM bottles_tb b
    LEFT JOIN missions_tb m ON b.mission_id = m.mission_id
    LEFT JOIN photos_tb photo ON photo.photo_id = b.bottle_basic_pic
    LEFT JOIN photos_tb selfie ON selfie.photo_id = b.bottle_selfie_pic
    LEFT JOIN hubs_tb h ON h.hub_id = b.hub_id
    LEFT JOIN turtles_tb t ON t.turtle_id = b.turtle_id
    WHERE b.packed_by = ?
    ORDER BY b.updated_at DESC, b.created_at DESC
  `;

  return query(sql, [packerId]);
};

bottlesModel.getByIdForPacker = async (bottleId, packerId) => {
  if (!bottleId || !packerId) {
    return null;
  }

  const sql = `
    SELECT
      b.bottle_id,
      b.serial_number,
      b.brand,
      b.volume_ml,
      b.turtle_id,
      b.hub_id,
      b.contents,
      b.weight_grams,
      b.status,
      b.verified,
      b.mission_id,
      b.bottle_basic_pic,
      b.bottle_selfie_pic,
      m.full_name AS mission_name,
      photo.url AS basic_photo_url,
      selfie.url AS selfie_photo_url,
      h.name AS hub_name,
      h.mailing_address AS hub_mailing_address,
      t.name AS turtle_name,
      t.hub_id AS turtle_hub_id
    FROM bottles_tb b
    LEFT JOIN missions_tb m ON b.mission_id = m.mission_id
    LEFT JOIN photos_tb photo ON photo.photo_id = b.bottle_basic_pic
    LEFT JOIN photos_tb selfie ON selfie.photo_id = b.bottle_selfie_pic
    LEFT JOIN hubs_tb h ON h.hub_id = b.hub_id
    LEFT JOIN turtles_tb t ON t.turtle_id = b.turtle_id
    WHERE b.bottle_id = ? AND b.packed_by = ?
    LIMIT 1
  `;

  const rows = await query(sql, [bottleId, packerId]);
  return rows[0] ?? null;
};

bottlesModel.getForManagedTurtle = async (turtleId, managerId) => {
  if (!turtleId || !managerId) {
    return [];
  }

  const sql = `
    SELECT
      b.bottle_id,
      b.serial_number,
      b.brand,
      b.volume_ml,
      b.turtle_id,
      b.hub_id,
      b.contents,
      b.weight_grams,
      b.status,
      b.verified,
      b.mission_id,
      b.bottle_basic_pic,
      b.bottle_selfie_pic,
      photo.url AS basic_photo_url,
      selfie.url AS selfie_photo_url,
      h.name AS hub_name,
      h.mailing_address AS hub_mailing_address
    FROM bottles_tb b
    INNER JOIN turtles_tb t ON t.turtle_id = b.turtle_id
    LEFT JOIN photos_tb photo ON photo.photo_id = b.bottle_basic_pic
    LEFT JOIN photos_tb selfie ON selfie.photo_id = b.bottle_selfie_pic
    LEFT JOIN hubs_tb h ON h.hub_id = b.hub_id
    WHERE b.turtle_id = ? AND t.turtle_manager = ?
    ORDER BY b.updated_at DESC, b.created_at DESC
  `;

  return query(sql, [turtleId, managerId]);
};

bottlesModel.getManagedBottleById = async (bottleId, managerId) => {
  if (!bottleId || !managerId) {
    return null;
  }

  const sql = `
    SELECT
      b.bottle_id,
      b.serial_number,
      b.turtle_id,
      b.hub_id,
      b.packed_by,
      t.turtle_manager
    FROM bottles_tb b
    INNER JOIN turtles_tb t ON t.turtle_id = b.turtle_id
    WHERE b.bottle_id = ? AND t.turtle_manager = ?
    LIMIT 1
  `;

  const rows = await query(sql, [bottleId, managerId]);
  return rows[0] ?? null;
};

bottlesModel.getForTurtle = async (turtleId) => {
  if (!turtleId) {
    return [];
  }

  const sql = `
    SELECT
      b.bottle_id,
      b.serial_number,
      b.brand,
      b.volume_ml,
      b.turtle_id,
      b.hub_id,
      b.contents,
      b.weight_grams,
      b.status,
      b.verified,
      b.mission_id,
      b.bottle_basic_pic,
      b.bottle_selfie_pic,
      photo.url AS basic_photo_url,
      selfie.url AS selfie_photo_url,
      h.name AS hub_name,
      h.mailing_address AS hub_mailing_address
    FROM bottles_tb b
    LEFT JOIN photos_tb photo ON photo.photo_id = b.bottle_basic_pic
    LEFT JOIN photos_tb selfie ON selfie.photo_id = b.bottle_selfie_pic
    LEFT JOIN hubs_tb h ON h.hub_id = b.hub_id
    WHERE b.turtle_id = ?
    ORDER BY b.updated_at DESC, b.created_at DESC
  `;

  return query(sql, [turtleId]);
};

export default bottlesModel;
