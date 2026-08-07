import { isAdminRole } from '../utils/roles.js';

export const ensureAuth = (req, res, next) => {
  if (req.session?.user) {
    return next();
  }
  if (req.originalUrl?.startsWith('/api/')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
};

export const ensureAdmin = (req, res, next) => {
  if (req.session?.user && isAdminRole(req.session.user.role)) {
    return next();
  }
  if (req.originalUrl?.startsWith('/api/')) {
    return res.status(403).json({ success: false, message: 'Admin privileges required' });
  }
  return res.status(403).render('error', {
    pageTitle: 'Access denied',
    message: 'You need admin privileges to access this area.'
  });
};

export const ensureAdminOrFounder = (req, res, next) => {
  const user = req.session?.user;
  if (user && (isAdminRole(user.role) || user.id === 1)) {
    return next();
  }
  if (req.originalUrl?.startsWith('/api/')) {
    const status = user ? 403 : 401;
    return res.status(status).json({ success: false, message: 'Additional privileges required' });
  }
  if (!user) {
    return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
  }
  return res.status(403).render('error', {
    pageTitle: 'Access denied',
    message: 'This area is reserved for the core admin team.'
  });
};

export default ensureAuth;
