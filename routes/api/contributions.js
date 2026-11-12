import { Router } from 'express';
import { rateLimit } from '../../middleware/rateLimit.js';
import { createCheckoutSession } from '../../controllers/contributionsController.js';

const router = Router();

// Open to everyone, signed in or not. Signed-in contributors are linked to
// their Buwana ID in the ledger. The Stripe webhook is mounted separately in
// server.js because it needs the raw request body.
router.post(
  '/checkout',
  rateLimit({ key: 'contribution-checkout', max: 20 }),
  createCheckoutSession
);

export default router;
