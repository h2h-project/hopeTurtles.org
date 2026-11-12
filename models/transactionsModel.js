import { query } from '../config/db.js';

// The OpenBooks ledger (transactions_tb, sql/migrations/20260731_commissioning_transactions.sql).

// Record a contribution that Stripe has confirmed as paid. Stripe may deliver
// a webhook event more than once. stripe_payment_intent_id is UNIQUE, so a
// repeat delivery only refreshes the row instead of adding a second one.
export const recordStripeContribution = async ({
  buwanaId = null,
  amountUsd,
  paymentIntentId,
  description = null
}) => {
  const result = await query(
    `INSERT INTO transactions_tb
       (buwana_id, type, direction, amount_usd, status, stripe_payment_intent_id, description, is_public)
     VALUES (?, 'contribution', 'in', ?, 'completed', ?, ?, 1)
     ON DUPLICATE KEY UPDATE status = 'completed', updated_at = CURRENT_TIMESTAMP`,
    [buwanaId, amountUsd, paymentIntentId, description]
  );
  return result;
};

export default { recordStripeContribution };
