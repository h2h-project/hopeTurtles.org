import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  validateEcojoiner,
  generateEcojoiner,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  listDesigns,
  listPublicDesigns,
  getDesign,
  getSharedDesign,
  createDesign,
  updateDesign,
  deleteDesign,
  updateDesignVisibility,
} from "../../controllers/ecojoinerController.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { ensureAuth } from "../../middleware/auth.js";

const router = Router();

// Unauthenticated: the read-only view for a design's public share link. Must
// be registered before router.use(ensureAuth) below or it would 401 for the
// visitors it's meant to serve. 404s unless the design is visibility='public'.
router.get("/designs/shared/:token", getSharedDesign);

// Everything else requires login — the generator, and saving/browsing
// bottle profiles and designs, are all account-gated.
router.use(ensureAuth);

router.post(
  "/validate",
  rateLimit({ key: "ecojoiner-validate", max: 60 }),
  validateEcojoiner,
);

router.post(
  "/generate",
  rateLimit({
    key: "ecojoiner-generate",
    max: 10,
    message:
      "That is a lot of ecojoiners! Please wait a few minutes before generating more.",
  }),
  generateEcojoiner,
);

// Photo uploads for saved bottle profiles / designs. A dedicated config
// (rather than reusing another router's inline multer) so these get real
// size/type limits, which none of the codebase's existing upload configs do.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../../public/uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(
      file.mimetype,
    );
    cb(
      ok ? null : new Error("Only JPEG, PNG, or WEBP images are allowed."),
      ok,
    );
  },
});

router.get(
  "/profiles",
  rateLimit({ key: "ecojoiner-profiles", max: 60 }),
  listProfiles,
);
router.post(
  "/profiles",
  rateLimit({ key: "ecojoiner-profiles", max: 20 }),
  upload.single("bottle_photo"),
  createProfile,
);
router.put(
  "/profiles/:id",
  rateLimit({ key: "ecojoiner-profiles", max: 20 }),
  upload.single("bottle_photo"),
  updateProfile,
);
router.delete(
  "/profiles/:id",
  rateLimit({ key: "ecojoiner-profiles", max: 60 }),
  deleteProfile,
);

router.get(
  "/designs",
  rateLimit({ key: "ecojoiner-designs", max: 60 }),
  listDesigns,
);
router.post(
  "/designs",
  rateLimit({ key: "ecojoiner-designs", max: 20 }),
  upload.fields([
    { name: "bottle_photo", maxCount: 1 },
    { name: "ecojoiner_photo", maxCount: 1 },
  ]),
  createDesign,
);
// Registered before /designs/:id so "public" isn't swallowed as an :id.
router.get(
  "/designs/public",
  rateLimit({ key: "ecojoiner-designs", max: 60 }),
  listPublicDesigns,
);
router.get(
  "/designs/:id",
  rateLimit({ key: "ecojoiner-designs", max: 60 }),
  getDesign,
);
router.put(
  "/designs/:id",
  rateLimit({ key: "ecojoiner-designs", max: 20 }),
  upload.fields([
    { name: "bottle_photo", maxCount: 1 },
    { name: "ecojoiner_photo", maxCount: 1 },
  ]),
  updateDesign,
);
router.delete(
  "/designs/:id",
  rateLimit({ key: "ecojoiner-designs", max: 60 }),
  deleteDesign,
);
router.patch(
  "/designs/:id/visibility",
  rateLimit({ key: "ecojoiner-designs", max: 60 }),
  updateDesignVisibility,
);

export default router;
