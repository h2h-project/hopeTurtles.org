import { Router } from 'express';
import { getHubs, getHubTurtles, createHub, updateHub, deleteHub } from '../../controllers/hubsController.js';
import { ensureAdmin, ensureAuth } from '../../middleware/auth.js';

const router = Router();

router.get('/', getHubs);
router.get('/:id/turtles', ensureAuth, getHubTurtles);
router.post('/', ensureAuth, ensureAdmin, createHub);
router.put('/:id', ensureAuth, ensureAdmin, updateHub);
router.delete('/:id', ensureAuth, ensureAdmin, deleteHub);

export default router;
