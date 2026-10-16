import crypto from 'crypto';
import { query } from '../config/db.js';
import { sha256Hex } from '../utils/deviceCrypto.js';

// App tokens for the Turtle Wrangler app (app API v2). The plaintext token
// goes to the app once; only its SHA-256 is stored. A token lasts
// SESSION_DAYS from its last use. Spec: turtleOS docs/wrangler/03_v2_plan.md,
// Phase D.
export const SESSION_DAYS = 90;

const appSessionsModel = {};

// Returns { token, expiresAtUnix }.
appSessionsModel.create = async (buwanaId, client = 'wrangler') => {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO app_sessions_tb (token_hash, buwana_id, client, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${SESSION_DAYS} DAY))`,
    [sha256Hex(token), buwanaId, client]
  );
  return { token, expiresAtUnix: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 };
};

// The live session for a plaintext token, with its user's role, or null.
appSessionsModel.findLive = async (token) => {
  const rows = await query(
    `SELECT s.app_session_id, s.buwana_id, u.role, u.first_name, u.earthling_emoji
     FROM app_sessions_tb s
     JOIN users_tb u ON u.buwana_id = s.buwana_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [sha256Hex(token)]
  );
  return rows[0] ?? null;
};

// Slide the expiry forward; called on each authenticated request.
appSessionsModel.touch = async (appSessionId) => {
  await query(
    `UPDATE app_sessions_tb
     SET last_used_at = UTC_TIMESTAMP(), expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${SESSION_DAYS} DAY)
     WHERE app_session_id = ?`,
    [appSessionId]
  );
};

appSessionsModel.revoke = async (appSessionId) => {
  await query('UPDATE app_sessions_tb SET revoked_at = UTC_TIMESTAMP() WHERE app_session_id = ?', [
    appSessionId
  ]);
};

export default appSessionsModel;
