import { Router } from 'express';
import { createCommission, listMyCommissions } from '../../controllers/commissionsController.js';
import { ensureAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../middleware/rateLimit.js';

const router = Router();

router.use(ensureAuth);

router.get('/', listMyCommissions);
router.post('/', rateLimit({ key: 'commissions-create', max: 30 }), createCommission);

export default router;
