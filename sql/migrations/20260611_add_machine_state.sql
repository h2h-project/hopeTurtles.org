-- ------------------------------------------------------------
-- 🐢 Machine state reporting (Olive Turtle 5-state autonomy)
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- turtleOS firmware now reports its autonomy state in every telemetry
-- payload as a top-level `machine_state` field:
--   BOOT → ACQUIRE → SAIL_NAV → ARRIVAL (normal mission)
--   any state → SAFE (fault); any reboot → BOOT
--
-- machine_state on telemetry_tb keeps per-reading history (state
-- transitions over a mission); last_machine_state on turtles_tb is the
-- denormalized latest value for fast dashboard rendering. Both are
-- nullable so this deploys safely ahead of the firmware update, and
-- readings from airOS devices (no nav stack) simply store NULL.

ALTER TABLE telemetry_tb
  ADD COLUMN machine_state ENUM('BOOT','ACQUIRE','SAIL_NAV','ARRIVAL','SAFE')
    NULL DEFAULT NULL AFTER `connection`;

ALTER TABLE turtles_tb
  ADD COLUMN last_machine_state ENUM('BOOT','ACQUIRE','SAIL_NAV','ARRIVAL','SAFE')
    NULL DEFAULT NULL AFTER `status`;
