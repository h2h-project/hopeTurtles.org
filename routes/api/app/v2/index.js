import { Router } from 'express';
import appAuth from '../../../../middleware/appAuth.js';
import { rateLimit } from '../../../../middleware/rateLimit.js';
import {
  postSession,
  deleteSession,
  getMe,
  getTurtles,
  getTurtleLatest,
  getTurtleTrack,
  getJourneyTrack
} from '../../../../controllers/appApiController.js';

// App API v2, consumed by the Turtle Wrangler Android app. Read-only apart
// from the session. Spec: turtleOS docs/wrangler/03_v2_plan.md, Phase D.
const router = Router();

router.post('/session', rateLimit({ key: 'app-session', max: 20 }), postSession);

router.use(appAuth);

router.delete('/session', deleteSession);
router.get('/me', getMe);
router.get('/turtles', getTurtles);
router.get('/turtles/:id/latest', getTurtleLatest);
router.get('/turtles/:id/track', getTurtleTrack);
router.get('/turtles/:id/journeys/:journey_id/track', getJourneyTrack);

// Unknown app API paths answer in the app's shape, not the site's 404 page.
router.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

export default router;
