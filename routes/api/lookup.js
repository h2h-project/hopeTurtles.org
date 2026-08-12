import { Router } from 'express';
import { searchBottlesPublic } from '../../controllers/bottlesController.js';
import { searchTurtlesPublic } from '../../controllers/turtlesController.js';

const router = Router();

router.get('/bottles', searchBottlesPublic);
router.get('/turtles', searchTurtlesPublic);

export default router;
