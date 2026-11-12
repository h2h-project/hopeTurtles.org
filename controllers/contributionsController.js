import config from '../config/env.js';
import { getStripe, STRIPE_APP_TAG } from '../utils/stripe.js';
import { recordStripeContribution } from '../models/transactionsModel.js';

const CONTRIBUTION_NAME = 'Contribution to the Hope Turtle Project';

const sessionBuwanaId = (req) => {
  const id = Number(req.session?.user?.buwanaId ?? req.session?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// POST /api/contributions/checkout  { amount: <whole USD> }
// Creates a Stripe Checkout session and answers with its URL. The amount is
// validated here, never trusted from the form, and the price is built inline.
// No Product or Price has to exist in the Stripe dashboard.
export const createCheckoutSession = async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      success: false,
      message: 'Online contributions are not switched on yet. Please check back soon.'
    });
  }

  const { minContributionUsd: min, maxContributionUsd: max, siteUrl } = config.stripe;
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    return res.status(422).json({
      success: false,
      message: `Please enter a whole-dollar amount between $${min} and $${max.toLocaleString('en-US')}.`
    });
  }

  const buwanaId = sessionBuwanaId(req);
  // Do NOT name this key `buwana_id`. Earthcal's webhook gets this account's
  // events too, and it treats `buwana_id` metadata on a session as an
  // earthcal user, linking them to a Stripe customer.
  const metadata = {
    app: STRIPE_APP_TAG,
    kind: 'contribution',
    ...(buwanaId ? { ht_buwana_id: String(buwanaId) } : {})
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'donate',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount * 100,
            product_data: { name: CONTRIBUTION_NAME }
          }
        }
      ],
      metadata,
      payment_intent_data: { metadata, description: CONTRIBUTION_NAME },
      success_url: `${siteUrl}/contribute/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/contribute`
    });
    return res.json({ success: true, data: { url: session.url } });
  } catch (error) {
    console.error('Stripe checkout session failed:', error.message);
    return res.status(502).json({
      success: false,
      message: 'We could not reach our payment provider. Please try again in a moment.'
    });
  }
};

// Record a paid Hope Turtles Checkout session in the ledger.
const recordPaidSession = async (session) => {
  if (session?.metadata?.app !== STRIPE_APP_TAG) return 'ignored: not a hopeturtles session';
  if (session.metadata.kind !== 'contribution') return 'ignored: not a contribution';
  if (session.payment_status !== 'paid') return 'ignored: not paid yet';

  const buwanaId = Number(session.metadata.ht_buwana_id);
  await recordStripeContribution({
    buwanaId: Number.isInteger(buwanaId) && buwanaId > 0 ? buwanaId : null,
    amountUsd: (session.amount_total ?? 0) / 100,
    paymentIntentId: session.payment_intent,
    description: CONTRIBUTION_NAME
  });
  return 'recorded';
};

// POST /api/stripe/webhook. Mounted in server.js with express.raw(), ahead of
// express.json(), because the signature is checked against the raw body.
export const handleStripeWebhook = async (req, res) => {
  const stripe = getStripe();
  const { webhookSecret } = config.stripe;
  if (!stripe || !webhookSecret) {
    return res.status(503).json({ received: false, message: 'Stripe is not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (error) {
    console.warn('Stripe webhook signature check failed:', error.message);
    return res.status(400).json({ received: false, message: 'Invalid signature' });
  }

  try {
    switch (event.type) {
      // Cards are paid at completion. Delayed methods (bank debits) are not
      // paid until async_payment_succeeded arrives.
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const outcome = await recordPaidSession(event.data.object);
        if (outcome === 'recorded') {
          console.log(`Stripe ${event.type} ${event.id}: contribution recorded`);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    // Answering 500 makes Stripe retry for up to three days, so a database
    // outage, or the transactions_tb migration not being applied yet, loses
    // no contributions.
    console.error(`Stripe webhook ${event.id} (${event.type}) failed:`, error.message);
    return res.status(500).json({ received: false });
  }

  return res.json({ received: true });
};

// GET /contribute/thanks?session_id=...  Stripe's success_url.
// Shows the amount when the session is genuinely ours and paid. The ledger
// row itself is written by the webhook, not here.
export const renderThanks = async (req, res) => {
  let amountUsd = null;
  const stripe = getStripe();
  const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : '';
  if (stripe && /^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.app === STRIPE_APP_TAG && session.payment_status === 'paid') {
        amountUsd = (session.amount_total ?? 0) / 100;
      }
    } catch (error) {
      console.warn('Could not load Stripe session for thanks page:', error.message);
    }
  }
  res.render('contribute-thanks', {
    pageTitle: res.locals.t.contribute_thanks_title || 'Thank you',
    bodyClass: 'ocean-bg',
    amountUsd
  });
};
