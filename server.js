import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MySQLSession from 'express-mysql-session';

import { config } from './config/env.js';
import pool from './config/db.js';
import languageMiddleware from './middleware/localization.js';
import themeMiddleware from './middleware/theme.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandlers.js';
import webRouter from './routes/web.js';
import apiRouter from './routes/api/index.js';
import deviceV1Router from './routes/api/v1/index.js';
import authRouter from './routes/api/auth.js';
import { loadLocales } from './utils/localization.js';
import { isAdminRole } from './utils/roles.js';
import { scheduleEcojoinerCleanup } from './utils/ecojoinerCleanup.js';
import { checkGeneratorHealth } from './utils/ecojoinerGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const MySQLStore = MySQLSession(session);

// ------------------------------------------------------------
// MySQL Session Store
// ------------------------------------------------------------
const sessionStore = new MySQLStore({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
});

loadLocales();

// ------------------------------------------------------------
// Express Setup
// ------------------------------------------------------------
app.set('trust proxy', 1); // Required for secure cookies behind nginx
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // strict-origin-when-cross-origin sends the origin (e.g. https://hopeturtles.org)
    // as Referer on cross-origin HTTPS→HTTPS requests. Required by OSM tile servers.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);
app.use(compression());
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// ------------------------------------------------------------
// Session Configuration (fixes OAuth state loss from Buwana v2)
// ------------------------------------------------------------
const isProduction = config.env === 'production';

const sessionCookieOptions = {
  httpOnly: true,
  secure: true,                 // Always true (HTTPS enforced by nginx)
  sameSite: 'none',             // Needed for cross-site redirect back from buwana.ecobricks.org
  maxAge: 1000 * 60 * 15        // Session lasts 15 minutes (short-lived OAuth session)
};

// ✅ Use consistent cookie domain (.hopeturtles.org if subdomains)
sessionCookieOptions.domain = config.auth.sessionCookieDomain || '.hopeturtles.org';

// Warn if dev env not HTTPS
if (!isProduction) {
  console.warn('⚠️ Dev mode: secure cookies require HTTPS; login may fail locally.');
}

const sessionMiddleware = session({
  name: config.auth.sessionCookieName || 'ht.sid',
  secret: config.auth.sessionSecret || 'changeme',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: sessionCookieOptions
});

app.use(sessionMiddleware);

// ------------------------------------------------------------
// Global Template Variables
// ------------------------------------------------------------
app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user || null;
  res.locals.isAdmin = isAdminRole(req.session?.user?.role);
  res.locals.theme = res.locals.theme || config.appearance.defaultTheme;
  res.locals.mapboxToken = config.integrations.mapboxToken;
  res.locals.includeWebsiteCarbon = config.integrations.includeWebsiteCarbon;
  res.locals.loginUrl = '/auth/login';
  res.locals.brand = {
    name: 'HopeTurtles.org',
    colors: {
      primary: '#017919',
      light: '#c0e3cb',
      dark: '#1f3b22'
    }
  };
  res.locals.currentPath = req.path;
  next();
});

// ------------------------------------------------------------
// Routes and Middleware
// ------------------------------------------------------------
app.use(languageMiddleware);
app.use(themeMiddleware);
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
// Generated ecojoiner exports. Mounted explicitly (ahead of the blanket public
// mount) so downloads get their own cache policy and no directory listings.
app.use(
  config.ecojoiner.urlPrefix,
  express.static(config.ecojoiner.exportsDir, {
    maxAge: '7d',
    index: false,
    dotfiles: 'ignore'
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/auth', authRouter);
// turtleOS device API — also aliased at /v1 because the firmware's
// time-sync screen requests <api_base>/v1/device without the /api prefix.
app.use(['/api/v1', '/v1'], deviceV1Router);
app.use('/api', apiRouter);
app.use('/', webRouter);

// ------------------------------------------------------------
// Error Handling
// ------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// ------------------------------------------------------------
// Start Server
// ------------------------------------------------------------
const start = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Database connection established');
  } catch (error) {
    console.warn(
      `⚠️  Starting without a database connection: ${error.message}\n` +
        '   Pages that query the database will error until it is reachable.'
    );
  }

  scheduleEcojoinerCleanup();
  await checkGeneratorHealth();

  app.listen(config.port, config.host, () => {
    console.log(`🌊 HopeTurtles.org landing page ready at http://127.0.0.1:${config.port}`);
  });
};

start();
