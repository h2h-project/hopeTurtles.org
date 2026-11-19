import { query } from '../config/db.js';

// The OpenBooks ledger (transactions_tb). Created by
// sql/migrations/20260731_commissioning_transactions.sql, moved to euros by
// sql/migrations/20261116_openbooks_ledger_eur_vendors_documents.sql.

// Record a contribution that Stripe has confirmed as paid. Stripe may deliver
// a webhook event more than once. stripe_payment_intent_id is UNIQUE, so a
// repeat delivery only refreshes the row instead of adding a second one.
export const recordStripeContribution = async ({
  buwanaId = null,
  amountEur,
  paymentIntentId,
  occurredOn = null,
  description = null
}) => {
  const result = await query(
    `INSERT INTO transactions_tb
       (buwana_id, type, category, direction, payment_method, amount_eur, occurred_on,
        status, stripe_payment_intent_id, description, is_public)
     VALUES (?, 'contribution', 'contribution', 'in', 'stripe', ?, COALESCE(?, CURDATE()),
        'completed', ?, ?, 1)
     ON DUPLICATE KEY UPDATE status = 'completed', updated_at = CURRENT_TIMESTAMP`,
    [buwanaId, amountEur, occurredOn, paymentIntentId, description]
  );
  return result;
};

export default { recordStripeContribution };
