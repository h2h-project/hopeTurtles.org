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

// `label` is unique per owner (uq_profile_owner_label). The column's
// utf8mb4_unicode_ci collation makes that match case-insensitive, and
// comparing in SQL keeps this lookup consistent with the constraint.
ecojoinerProfilesModel.getByLabelForUser = async (buwanaId, label) => {
  const rows = await query(
    "SELECT profile_id, label, updated_at FROM ecojoiner_bottle_profiles_tb WHERE buwana_id = ? AND label = ? LIMIT 1",
    [buwanaId, label],
  );
  return rows[0] || null;
};

const LABEL_MAX = 80; // ecojoiner_bottle_profiles_tb.label is VARCHAR(80)

// First free "<label> (n)" for this owner, n = 2, 3, ..., trimmed to fit
// the column. Offered as the default name when the user picks "save as new".
ecojoinerProfilesModel.suggestFreeLabel = async (buwanaId, label) => {
  const rows = await query(
    "SELECT label FROM ecojoiner_bottle_profiles_tb WHERE buwana_id = ?",
    [buwanaId],
  );
  const taken = new Set(rows.map((row) => String(row.label).trim().toLowerCase()));
  const base = String(label).replace(/\s*\(\d+\)$/, "").trim();
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, LABEL_MAX - suffix.length).trim()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return null;
};

export default ecojoinerProfilesModel;
