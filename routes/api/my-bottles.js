import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  listMyBottles,
  registerMyBottle,
  submitBottleDeliveryDetails,
  deleteMyBottle,
  listBottlesForManagedTurtle,
  reassignBottleToTurtle,
  detachBottleFromManagedTurtle
} from '../../controllers/bottlesController.js';
import { ensureAuth } from '../../middleware/auth.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../../public/uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${unique}${ext}`);
  }
});

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const upload = multer({ storage, limits: { fileSize: MAX_PHOTO_BYTES } });

router.use(ensureAuth);

router.get('/', listMyBottles);
router.post('/', registerMyBottle);
router.delete('/:id', deleteMyBottle);
router.get('/turtles/:id', listBottlesForManagedTurtle);
router.post(
  '/:id/delivery',
  (req, res, next) => {
    upload.fields([
      { name: 'bottle_basic_photo', maxCount: 1 },
      { name: 'bottle_selfie_photo', maxCount: 1 }
    ])(req, res, (err) => {
      if (!err) {
        return next();
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          message: `Your photo is too large. Please upload one under ${MAX_PHOTO_BYTES / (1024 * 1024)}MB.`
        });
      }
      return next(err);
    });
  },
  submitBottleDeliveryDetails
);
router.patch('/:id/turtle', reassignBottleToTurtle);
router.delete('/:id/turtle', detachBottleFromManagedTurtle);

export default router;
