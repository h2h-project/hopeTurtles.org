import { Router } from 'express';
import {
  validateEcojoiner,
  generateEcojoiner
} from '../../controllers/ecojoinerController.js';
import { rateLimit } from '../../middleware/rateLimit.js';

const router = Router();

// Open to anyone — the generator page is public. Generation spawns a Python
// process and writes files, so it gets the tighter budget.
router.post(
  '/validate',
  rateLimit({ key: 'ecojoiner-validate', max: 60 }),
  validateEcojoiner
);

router.post(
  '/generate',
  rateLimit({
    key: 'ecojoiner-generate',
    max: 10,
    message: 'That is a lot of ecojoiners! Please wait a few minutes before generating more.'
  }),
  generateEcojoiner
);

export default router;
