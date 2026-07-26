import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The Ecojoiner generator runs on Python. Prefer an explicit interpreter, then
// the project venv created by `npm run ecojoiner:setup`, then whatever python3
// is on PATH (which only works if reportlab happens to be installed globally).
const resolveEcojoinerPython = () => {
  if (process.env.ECOJOINER_PYTHON) return process.env.ECOJOINER_PYTHON;
  const venvPython = path.join(rootDir, 'ecojoiner', '.venv', 'bin', 'python3');
  return fs.existsSync(venvPython) ? venvPython : 'python3';
};

const requiredVariables = [
  'DB_HOST',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'SESSION_SECRET',
  'BUWANA_CLIENT_ID',
  'BUWANA_PUBLIC_KEY',
  'BUWANA_API_URL',
  'BUWANA_AUTHORIZE_URL',
  'BUWANA_TOKEN_URL',
  'BUWANA_REDIRECT_URI',
  'BUWANA_SCOPE',
  'BUWANA_JWKS_URI'
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    console.warn(`⚠️  Missing recommended environment variable: ${variable}`);
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    name: process.env.DB_NAME
  },


  auth: {
  // Sessions / cookies
  sessionSecret: process.env.SESSION_SECRET || 'hopeturtles-secret',
  jwtSecret: process.env.JWT_SECRET || 'hopeturtles-jwt',
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'ht.sid',
  sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN || 'hopeturtles.org',
  sessionCookieSameSite: (() => {
    // default to 'none' for cross-site OAuth redirect
    const value = (process.env.SESSION_COOKIE_SAMESITE || 'none').toLowerCase();
    return ['lax', 'strict', 'none'].includes(value) ? value : 'none';
  })(),

  // Buwana endpoints / client
  buwanaApiUrl: process.env.BUWANA_API_URL || 'https://buwana.ecobricks.org',
  buwanaClientId: process.env.BUWANA_CLIENT_ID || '',

  // OIDC endpoints
  buwanaAuthorizeUrl:
    process.env.BUWANA_AUTHORIZE_URL ||
    'https://buwana.ecobricks.org/authorize',
  buwanaTokenUrl:
    process.env.BUWANA_TOKEN_URL ||
    'https://buwana.ecobricks.org/token',
  buwanaJwksUri:
    process.env.BUWANA_JWKS_URI ||
    'https://buwana.ecobricks.org/.well-known/jwks.php',

  // Redirect URI (prefer REDIRECT_URI; fallback to BUWANA_REDIRECT_URI)
  buwanaRedirectUri:
    process.env.REDIRECT_URI ||
    process.env.BUWANA_REDIRECT_URI ||
    'https://hopeturtles.org/auth/callback',

  // Scopes — namespaced Buwana scope system
  // buwana:basic     → buwana_id, email, given_name, buwana:earthlingEmoji
  // buwana:profile   → family_name, role, profile_pic, community_id, zoneinfo, birth_date, …
  // buwana:community → buwana:community (community name)
  // buwana:bioregion → location_full, watershed_id/name, lat/long, …
  // buwana:profile.read / .write → read + update the profile via the Buwana API
  buwanaScope:
    process.env.BUWANA_SCOPE ||
    'openid buwana:basic buwana:profile buwana:community buwana:bioregion buwana:profile.read buwana:profile.write'
},


  
  appearance: {
    defaultTheme: process.env.DEFAULT_THEME || 'light',
    supportedThemes: (process.env.SUPPORTED_THEMES || 'light,dark').split(','),
    defaultLang: process.env.DEFAULT_LANG || 'en',
    supportedLangs: (
      process.env.SUPPORTED_LANGS || 'en,ms,id,he,ar,de,zh,tr'
    )
      .split(',')
      .map((code) => code.trim())
  },
  ecojoiner: {
    rootDir,
    python: resolveEcojoinerPython(),
    script: path.join(rootDir, 'ecojoiner', 'generate_exports.py'),
    fontDir: path.join(rootDir, 'fonts'),
    exportsDir: path.join(rootDir, 'public', 'ecojoiner_exports'),
    urlPrefix: '/ecojoiner_exports',
    // Generated job folders are swept after this many days.
    jobTtlDays: Number(process.env.ECOJOINER_JOB_TTL_DAYS || 7),
    timeoutMs: Number(process.env.ECOJOINER_TIMEOUT_MS || 30000)
  },
  integrations: {
    mapboxToken: process.env.MAPBOX_TOKEN || '',
    includeWebsiteCarbon:
      String(process.env.INCLUDE_WEBSITE_CARBON || 'false').toLowerCase() === 'true'
  }
};

export default config;
