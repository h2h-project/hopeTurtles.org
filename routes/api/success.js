import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSuccessLog, createSuccessEntry, lookupFoundTurtle } from '../../controllers/successController.js';
import { rateLimit } from '../../middleware/rateLimit.js';

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

router.get('/', getSuccessLog);
router.get('/turtle/:code', rateLimit({ key: 'report-turtle-lookup', max: 60 }), lookupFoundTurtle);
router.post('/', upload.single('photo'), createSuccessEntry);

export default router;
