import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import missionsController from '../controllers/missionsController.js';
import turtlesController from '../controllers/turtlesController.js';
import dashboardController from '../controllers/dashboardController.js';
import teamController from '../controllers/teamController.js';
import profileController from '../controllers/profileController.js';
import { ensureAdmin, ensureAdminOrFounder, ensureAuth } from '../middleware/auth.js';
import { getPlatformSummary, getAboutMetrics } from '../models/summaryModel.js';
import missionsModel from '../models/missionsModel.js';
import turtlesModel from '../models/turtlesModel.js';
import { renderManagementPage } from '../controllers/usersController.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '../public/uploads');

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

const profileUpload = multer({ storage });

router.get('/', async (req, res, next) => {
  try {
    const [summary, missions] = await Promise.all([
      getPlatformSummary(),
      missionsModel.getAllWithHub({ status: 'active' })
    ]);
    return res.render('index', {
      pageTitle: 'HopeTurtles.org',
      summary,
      missions
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/report', async (req, res, next) => {
  try {
    const turtles = await turtlesModel.getAll();
    return res.render('report', {
      pageTitle: 'Report a Found Turtle',
      turtles
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/about', async (req, res, next) => {
  try {
    const aboutMetrics = await getAboutMetrics();
    return res.render('about', {
      pageTitle: 'About the Hope Turtle Project',
      aboutMetrics
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to load about page metrics', error);
    }
    try {
      return res.render('about', {
        pageTitle: 'About the Hope Turtle Project',
        aboutMetrics: { turtles: 0, users: 0, boats: 0, hubs: 0 }
      });
    } catch (renderError) {
      return next(renderError);
    }
  }
});

router.get('/turtleos', (req, res) => {
  res.render('turtleos', {
    pageTitle: res.locals.t.turtleos_page_title
  });
});

router.get('/ecojoiners', (req, res) => {
  res.render('ecojoiners', {
    pageTitle: res.locals.t.eco_page_title
  });
});

router.get('/ecojoiners/generate', (req, res) => {
  res.render('generate', {
    pageTitle: res.locals.t.gen_page_title
  });
});

router.get('/missions', missionsController.renderExplorer);
router.get('/team', teamController.renderTeamPage);
router.get('/turtles/:id', turtlesController.renderTurtlePage);

router.get('/login', (req, res) => {
  res.redirect('/auth/callback');
});

router.get('/dashboard', ensureAuth, dashboardController.renderDashboard);
router.get('/my-turtle/:id', ensureAuth, dashboardController.renderMyTurtle);
router.get('/admin', ensureAuth, ensureAdmin, dashboardController.renderAdmin);
router.get('/admin/users', ensureAuth, ensureAdminOrFounder, renderManagementPage);
router.get('/profile', ensureAuth, profileController.renderProfilePage);
router.post('/profile', ensureAuth, profileUpload.single('profile_pic'), profileController.updateProfile);
router.post('/profile/buwana', ensureAuth, profileController.updateBuwanaProfile);
router.post('/profile/privacy', ensureAuth, profileController.updatePrivacy);

router.post('/theme', (req, res) => {
  const { theme } = req.body;
  res.cookie('theme', theme, { maxAge: 31536000000, sameSite: 'lax' });
  return res.json({ success: true, theme });
});

router.post('/language', (req, res) => {
  const { lang } = req.body;
  res.cookie('lang', lang, { maxAge: 31536000000, sameSite: 'lax' });
  return res.json({ success: true, lang });
});

export default router;
