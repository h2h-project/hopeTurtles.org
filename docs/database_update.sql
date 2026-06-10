-- ------------------------------------------------------------
-- 🐢 HopeTurtles DB update: v1.1 -> v1.2
-- ------------------------------------------------------------
-- Run these statements manually against hopeturtle_db.
-- The app does NOT auto-migrate.
--
-- Purpose: enable idempotent device telemetry ingestion at
-- POST /api/v1/telemetry and /api/v1/telemetry/batch.
-- turtleOS devices retry failed sends from an offline queue, so the
-- same (turtle_id, timestamp) reading can arrive more than once.
-- The unique key below lets the server INSERT IGNORE duplicates.
--
-- NOTE: the live DB already carries columns not present in
-- hopeturtle_schema_v1.1.sql (turtles_tb.secret_hash, turtle_manager,
-- profile_photo_id, and the 'awaiting_serial' status). Those are NOT
-- re-added here; they are documented in docs/hopeturtles_db_v1.2.sql.
--
-- DEPLOYMENT NOTE (outside this DB): turtleOS devices are HTTP-only
-- and do not follow redirects. nginx for hopeturtles.org must serve
-- http://hopeturtles.org/api/v1/* and http://hopeturtles.org/v1/*
-- directly (proxy_pass to the Node port) WITHOUT the usual
-- 301 -> HTTPS redirect on those paths.
-- ------------------------------------------------------------

-- 1) Remove any existing duplicate (turtle_id, timestamp) telemetry
--    rows, keeping the earliest telemetry_id, so the unique key can
--    be added cleanly.
DELETE t1 FROM telemetry_tb t1
JOIN telemetry_tb t2
  ON t1.turtle_id <=> t2.turtle_id
 AND t1.`timestamp` = t2.`timestamp`
 AND t1.telemetry_id > t2.telemetry_id;

-- 2) Idempotent device ingestion: one reading per turtle per
--    device-timestamp. Also serves per-turtle
--    ORDER BY `timestamp` DESC queries used by the dashboard.
ALTER TABLE telemetry_tb
  ADD UNIQUE KEY uq_telemetry_turtle_ts (turtle_id, `timestamp`);
