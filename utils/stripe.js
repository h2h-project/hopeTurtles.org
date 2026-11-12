import Stripe from 'stripe';
import config from '../config/env.js';

// One Stripe client for the process, created on first use. Returns null when
// STRIPE_SECRET_KEY is unset, so callers can answer "not available" instead
// of crashing on a missing key.
let client = null;

export const getStripe = () => {
  if (!config.stripe.secretKey) return null;
  if (!client) client = new Stripe(config.stripe.secretKey);
  return client;
};

// This Stripe account is shared with earthcal.app, and every webhook endpoint
// on the account receives every event it subscribes to. Each Checkout session
// created here is tagged with this value in its metadata. The webhook only
// acts on tagged events and ignores earthcal's.
export const STRIPE_APP_TAG = 'hopeturtles';

export default getStripe;
