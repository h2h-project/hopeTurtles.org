import { query, getConnection } from '../config/db.js';
import { createModel } from './baseModel.js';

const commissionsModel = createModel('commissions_tb', 'commission_id');

// Creates a commission header row plus its line items in one transaction.
// `items` is an array of { component_id, bottle_slot, quantity, unit_price_usd }.
commissionsModel.createWithItems = async (commissionData, items = []) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const commissionKeys = Object.keys(commissionData);
    const [commissionResult] = await connection.execute(
      `INSERT INTO commissions_tb (${commissionKeys.map((k) => `\`${k}\``).join(', ')})
       VALUES (${commissionKeys.map(() => '?').join(', ')})`,
      commissionKeys.map((key) => commissionData[key])
    );
    const commissionId = commissionResult.insertId;

    for (const item of items) {
      await connection.execute(
        `INSERT INTO commission_items_tb
           (commission_id, component_id, bottle_slot, quantity, unit_price_usd)
         VALUES (?, ?, ?, ?, ?)`,
        [
          commissionId,
          item.component_id,
          item.bottle_slot ?? null,
          item.quantity ?? 1,
          item.unit_price_usd
        ]
      );
    }

    await connection.commit();
    return commissionId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

commissionsModel.getByIdForUser = async (commissionId, buwanaId) => {
  const rows = await query(
    `SELECT * FROM commissions_tb WHERE commission_id = ? AND buwana_id = ? LIMIT 1`,
    [commissionId, buwanaId]
  );
  return rows[0] || null;
};

commissionsModel.getItemsForCommission = async (commissionId) => {
  return query(
    `SELECT ci.*, c.label, c.category, c.key_name
     FROM commission_items_tb ci
     INNER JOIN components_tb c ON c.component_id = ci.component_id
     WHERE ci.commission_id = ?
     ORDER BY ci.bottle_slot IS NULL, ci.bottle_slot, ci.commission_item_id`,
    [commissionId]
  );
};

export default commissionsModel;
