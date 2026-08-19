import { Router } from 'express';
import {
  getTelemetryForTurtle,
  getLatestTelemetry,
  getTurtleTrends,
  getDailyEnergy,
  getBatteryKpis,
  deleteTurtleTelemetry
} from '../../controllers/telemetryController.js';
import { ensureAuth } from '../../middleware/auth.js';

const router = Router();

router.get('/latest', getLatestTelemetry);
router.get('/:turtle_id/trends', ensureAuth, getTurtleTrends);
router.get('/:turtle_id/daily-energy', ensureAuth, getDailyEnergy);
router.get('/:turtle_id/battery-kpis', ensureAuth, getBatteryKpis);
router.delete('/:turtle_id/readings', ensureAuth, deleteTurtleTelemetry);
router.get('/:turtle_id', getTelemetryForTurtle);

export default router;
