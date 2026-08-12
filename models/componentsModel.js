import { query } from '../config/db.js';
import { createModel } from './baseModel.js';

const componentsModel = createModel('components_tb', 'component_id');

// Returns every available component, grouped by category, ordered for display.
// Shape: { turtle_base: [...], foodstuff: [...], electronics_addon: [...], engraving: [...] }
componentsModel.getCatalog = async () => {
  const rows = await query(
    `SELECT * FROM components_tb WHERE is_available = 1 ORDER BY category, sort_order, label`
  );
  return rows.reduce((catalog, row) => {
    (catalog[row.category] ||= []).push(row);
    return catalog;
  }, {});
};

export default componentsModel;
