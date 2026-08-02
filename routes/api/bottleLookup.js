import { Router } from 'express';
import { searchBottlesPublic } from '../../controllers/bottlesController.js';

const router = Router();

router.get('/', searchBottlesPublic);

export default router;
