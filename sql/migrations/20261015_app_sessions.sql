-- ------------------------------------------------------------
-- 🐢 Turtle Wrangler app sessions (app API v2)
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- The Wrangler Android app logs in with Buwana (its own Buwana client,
-- PKCE), then trades the ID token for an app token at
-- POST /api/app/v2/session (controllers/appApiController.js). Buwana's
-- tokens last 90 minutes with no refresh token, so the app keeps this
-- token instead. Only its SHA-256 is stored; revoking is setting
-- revoked_at (DELETE /api/app/v2/session). expires_at slides forward on
-- use (middleware/appAuth.js).
--
-- Spec: turtleOS docs/wrangler/03_v2_plan.md, Phase D.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_sessions_tb (
  app_session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash     CHAR(64)     NOT NULL,
  buwana_id      INT          NOT NULL,
  client         VARCHAR(32)  NOT NULL DEFAULT 'wrangler',
  created_at     DATETIME     NOT NULL,
  last_used_at   DATETIME     NOT NULL,
  expires_at     DATETIME     NOT NULL,
  revoked_at     DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (app_session_id),
  UNIQUE KEY uq_app_sessions_token (token_hash),
  KEY idx_app_sessions_user (buwana_id),
  CONSTRAINT app_sessions_user_fk FOREIGN KEY (buwana_id)
    REFERENCES users_tb (buwana_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
