import { Router } from 'express';
import missionsRouter from './missions.js';
import turtlesRouter from './turtles.js';
import telemetryRouter from './telemetry.js';
import successRouter from './success.js';
import alertsRouter from './alerts.js';
import hubsRouter from './hubs.js';
import boatsRouter from './boats.js';
import bottlesRouter from './bottles.js';
import myBottlesRouter from './my-bottles.js';
import bottleLookupRouter from './bottleLookup.js';
import summaryRouter from './summary.js';
import usersRouter from './users.js';
import ecojoinerRouter from './ecojoiner.js';
import commissionsRouter from './commissions.js';

const router = Router();

router.use('/missions', missionsRouter);
router.use('/turtles', turtlesRouter);
router.use('/telemetry', telemetryRouter);
router.use('/success', successRouter);
router.use('/alerts', alertsRouter);
router.use('/hubs', hubsRouter);
router.use('/boats', boatsRouter);
router.use('/my-bottles', myBottlesRouter);
router.use('/bottle-lookup', bottleLookupRouter);
router.use('/bottles', bottlesRouter);
router.use('/users', usersRouter);
router.use('/ecojoiner', ecojoinerRouter);
router.use('/commissions', commissionsRouter);
router.use('/', summaryRouter);

export default router;
