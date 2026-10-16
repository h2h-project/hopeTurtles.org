import { config } from '../config/env.js';

// Shared Buwana color-mode contract (Buwana repo: docs/color-mode-policy.md).
// The `theme` cookie is what the server renders from; `?mode=` is how Buwana
// hands the mode back across the login redirect, so it wins and is persisted.
export const THEME_COOKIE = 'theme';
export const THEME_COOKIE_OPTIONS = { httpOnly: false, maxAge: 31536000000, sameSite: 'lax' };

export const isSupportedTheme = (value) =>
  typeof value === 'string' &&
  config.appearance.supportedThemes.map((t) => t.trim()).includes(value);

export const themeMiddleware = (req, res, next) => {
  const queryMode = req.query?.mode;
  const cookieTheme = req.cookies?.[THEME_COOKIE];
  let theme = config.appearance.defaultTheme;
  let explicit = false;

  if (isSupportedTheme(queryMode)) {
    theme = queryMode;
    explicit = true;
    if (queryMode !== cookieTheme) {
      res.cookie(THEME_COOKIE, theme, THEME_COOKIE_OPTIONS);
    }
  } else if (isSupportedTheme(cookieTheme)) {
    theme = cookieTheme;
    explicit = true;
  }

  res.locals.theme = theme;
  // false = no saved choice yet; the page may fall back to prefers-color-scheme.
  res.locals.themeExplicit = explicit;
  res.locals.supportedThemes = config.appearance.supportedThemes;
  next();
};

export default themeMiddleware;
