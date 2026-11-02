-- ------------------------------------------------------------
-- 🐢 Turtle fin codes
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
-- Run this BEFORE deploying the code that reads fin_code. Existing turtles
-- were given codes on 2026-11-02 by a one-off backfill script (since
-- removed) that set a random unique code wherever fin_code IS NULL.
--
-- A fin code is a 4-character Crockford Base32 ID painted on the turtle's
-- fin, so whoever finds a turtle can identify it on /report. Alphabet:
-- 0123456789ABCDEFGHJKMNPQRSTVWXYZ (no I, L, O, U) — 32^4 = 1,048,576
-- codes. Codes are random (not sequential) so they are hard to guess, and
-- stored upper-case. utils/finCode.js generates and normalizes them.
--
-- Nullable so it could deploy ahead of the backfill; new turtles get a code
-- on creation (controllers/turtlesController.js).
-- ------------------------------------------------------------

ALTER TABLE turtles_tb
  ADD COLUMN fin_code CHAR(4) CHARACTER SET ascii COLLATE ascii_general_ci NULL DEFAULT NULL AFTER name,
  ADD UNIQUE KEY turtles_fin_code_uq (fin_code);
