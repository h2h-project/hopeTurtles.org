import appSessionsModel from '../models/appSessionsModel.js';
import { isAdminRole } from '../utils/roles.js';

// App API v2 (Turtle Wrangler): `Authorization: Bearer <app token>`, the
// token POST /api/app/v2/session handed out. Answers in the device API's
// { ok: ... } shape. Sets req.appUser = { sessionId, buwanaId, firstName,
// earthlingEmoji, admin }.
export const appAuth = async (req, res, next) => {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{20,200})$/u);
  if (!match) {
    return res.status(401).json({ ok: false, error: 'missing_token' });
  }

  try {
    const session = await appSessionsModel.findLive(match[1]);
    if (!session) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }
    await appSessionsModel.touch(session.app_session_id);
    req.appUser = {
      sessionId: session.app_session_id,
      buwanaId: session.buwana_id,
      firstName: session.first_name ?? null,
      earthlingEmoji: session.earthling_emoji ?? null,
      admin: isAdminRole(session.role)
    };
    return next();
  } catch (error) {
    console.error('appAuth error:', error?.stack || error?.message || error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

export default appAuth;
