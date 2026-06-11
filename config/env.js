import dotenv from 'dotenv';

dotenv.config();

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
  buwanaScope:
    process.env.BUWANA_SCOPE ||
    'openid buwana:basic buwana:profile buwana:community buwana:bioregion'
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
  integrations: {
    mapboxToken: process.env.MAPBOX_TOKEN || '',
    includeWebsiteCarbon:
      String(process.env.INCLUDE_WEBSITE_CARBON || 'false').toLowerCase() === 'true'
  }
};

export default config;
