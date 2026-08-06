import { query } from "../config/db.js";
import { createModel } from "./baseModel.js";

const ecojoinerDesignsModel = createModel("ecojoiner_designs_tb", "design_id");

ecojoinerDesignsModel.getForUser = async (buwanaId) => {
  return query(
    `SELECT d.*, ph.url AS ecojoiner_photo_url, bph.url AS bottle_photo_url
     FROM ecojoiner_designs_tb d
     LEFT JOIN photos_tb ph ON ph.photo_id = d.ecojoiner_photo_id
     LEFT JOIN ecojoiner_bottle_profiles_tb p ON p.profile_id = d.profile_id
     LEFT JOIN photos_tb bph ON bph.photo_id = p.bottle_photo_id
     WHERE d.buwana_id = ?
     ORDER BY d.created_at DESC`,
    [buwanaId],
  );
};

ecojoinerDesignsModel.getByIdForUser = async (designId, buwanaId) => {
  const rows = await query(
    "SELECT * FROM ecojoiner_designs_tb WHERE design_id = ? AND buwana_id = ? LIMIT 1",
    [designId, buwanaId],
  );
  return rows[0] || null;
};

// Un-publishing a design leaves share_token in place (so re-publishing
// reuses the same link) but must stop resolving immediately, hence the
// visibility filter here rather than clearing the token on un-publish.
ecojoinerDesignsModel.getByShareToken = async (token) => {
  const rows = await query(
    "SELECT * FROM ecojoiner_designs_tb WHERE share_token = ? AND visibility = 'public' LIMIT 1",
    [token],
  );
  return rows[0] || null;
};

export default ecojoinerDesignsModel;
