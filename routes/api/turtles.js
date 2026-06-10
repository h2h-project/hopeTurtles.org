import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listBottlesForTurtleAdmin } from '../../controllers/bottlesController.js';
import {
  getTurtles,
  getTurtleById,
  createTurtle,
  launchManagedTurtle,
  updateTurtle,
  deleteTurtle,
  regenerateTurtleSecret,
  getTurtleLive
} from '../../controllers/turtlesController.js';
import { ensureAdmin, ensureAuth } from '../../middleware/auth.js';

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
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${unique}${ext}`);
  }
});

const upload = multer({ storage });
const profilePhotoFields = [
  { name: 'profile_photo', maxCount: 1 },
  { name: 'profile_photo_thumbnail', maxCount: 1 }
];

const assignUploadShortcuts = (req) => {
  req.profilePhotoFile = req?.files?.profile_photo?.[0] ?? null;
  req.profilePhotoThumbnailFile = req?.files?.profile_photo_thumbnail?.[0] ?? null;
  if (!req.file && req.profilePhotoFile) {
    req.file = req.profilePhotoFile;
  }
};

const handleProfileUpload = (req, res, next) => {
  return upload.fields(profilePhotoFields)(req, res, (error) => {
    if (error) {
      return next(error);
    }
    assignUploadShortcuts(req);
    return next();
  });
};

const optionalProfileUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return next();
  }
  return handleProfileUpload(req, res, next);
};

router.get('/', getTurtles);
router.post('/launch', ensureAuth, optionalProfileUpload, launchManagedTurtle);
router.get('/:id/bottles', ensureAuth, ensureAdmin, listBottlesForTurtleAdmin);
router.get('/:id/live', ensureAuth, getTurtleLive);
router.get('/:id', getTurtleById);
router.post('/', ensureAuth, ensureAdmin, handleProfileUpload, createTurtle);
router.put('/:id', ensureAuth, ensureAdmin, optionalProfileUpload, updateTurtle);
router.delete('/:id', ensureAuth, deleteTurtle);
router.post('/:id/secret', ensureAuth, regenerateTurtleSecret);

export default router;
