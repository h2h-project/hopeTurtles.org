import { Router } from 'express';
import {
  getTelemetryForTurtle,
  getLatestTelemetry,
  getTurtleTrends,
  deleteTurtleTelemetry
} from '../../controllers/telemetryController.js';
import { ensureAuth } from '../../middleware/auth.js';

const router = Router();

router.get('/latest', getLatestTelemetry);
router.get('/:turtle_id/trends', ensureAuth, getTurtleTrends);
router.delete('/:turtle_id/readings', ensureAuth, deleteTurtleTelemetry);
router.get('/:turtle_id', getTelemetryForTurtle);

export default router;
