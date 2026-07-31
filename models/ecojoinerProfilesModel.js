import { query } from "../config/db.js";
import { createModel } from "./baseModel.js";

const ecojoinerProfilesModel = createModel(
  "ecojoiner_bottle_profiles_tb",
  "profile_id",
);

ecojoinerProfilesModel.getForUser = async (buwanaId) => {
  return query(
    `SELECT p.*, ph.url AS bottle_photo_url
     FROM ecojoiner_bottle_profiles_tb p
     LEFT JOIN photos_tb ph ON ph.photo_id = p.bottle_photo_id
     WHERE p.buwana_id = ?
     ORDER BY p.updated_at DESC`,
    [buwanaId],
  );
};

ecojoinerProfilesModel.getByIdForUser = async (profileId, buwanaId) => {
  const rows = await query(
    "SELECT * FROM ecojoiner_bottle_profiles_tb WHERE profile_id = ? AND buwana_id = ? LIMIT 1",
    [profileId, buwanaId],
  );
  return rows[0] || null;
};

export default ecojoinerProfilesModel;
