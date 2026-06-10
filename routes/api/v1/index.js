import { Router } from 'express';
import deviceAuth from '../../../middleware/deviceAuth.js';
import {
  postTelemetry,
  postTelemetryBatch,
  getDevice
} from '../../../controllers/deviceApiController.js';

// Device-facing v1 API consumed by turtleOS firmware. Mounted at both
// /api/v1 and /v1 in server.js — the firmware's time-sync screen builds
// its URL as `<api_base>/v1/device` without the /api prefix.
const router = Router();

router.use(deviceAuth);

router.post('/telemetry', postTelemetry);
router.post('/telemetry/batch', postTelemetryBatch);
router.get('/device', getDevice);

export default router;
