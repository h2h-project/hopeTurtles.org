-- ------------------------------------------------------------
-- 🐢 Per-turtle operator-set test-project nav fields
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- A turtle is assigned to a grand mission via turtles_tb.mission_id, whose
-- destination lives in missions_tb.target_lat/target_lng. For small-project
-- field testing (ponds, fields) the operator needs an independent target
-- set by hand on the device, without disturbing the mission assignment.
--
-- turtleOS firmware now owns these values in its config.json as
--   set_destination / set_departure / set_arrival  ([lat, lon] pairs)
--   set_waypoints                                   (list of [lat, lon])
--   set_short_name / set_full_name                  (labels)
-- and pushes them here via the new PATCH /api/v1/device endpoint
-- (controllers/deviceApiController.js::patchDevice ->
--  turtlesModel.updateSetFields). The dashboard "My Turtles" expand row
-- (views/dashboard.ejs) renders them read-only.
--
-- Coordinates are split _lat/_lng DECIMAL(10,7) columns to match the
-- existing last_lat/last_lng and missions_tb.target_lat/target_lng
-- convention; set_waypoints is JSON (a variable-length list the device
-- rewrites wholesale). All columns are nullable so this deploys safely
-- ahead of the firmware update, and a turtle that never runs a test
-- project simply keeps them NULL.
-- ------------------------------------------------------------

ALTER TABLE turtles_tb
  ADD COLUMN set_destination_lat DECIMAL(10,7) NULL DEFAULT NULL AFTER last_lng,
  ADD COLUMN set_destination_lng DECIMAL(10,7) NULL DEFAULT NULL AFTER set_destination_lat,
  ADD COLUMN set_departure_lat   DECIMAL(10,7) NULL DEFAULT NULL AFTER set_destination_lng,
  ADD COLUMN set_departure_lng   DECIMAL(10,7) NULL DEFAULT NULL AFTER set_departure_lat,
  ADD COLUMN set_arrival_lat     DECIMAL(10,7) NULL DEFAULT NULL AFTER set_departure_lng,
  ADD COLUMN set_arrival_lng     DECIMAL(10,7) NULL DEFAULT NULL AFTER set_arrival_lat,
  ADD COLUMN set_waypoints       JSON         NULL DEFAULT NULL AFTER set_arrival_lng,
  ADD COLUMN set_short_name      VARCHAR(50)  NULL DEFAULT NULL AFTER set_waypoints,
  ADD COLUMN set_full_name       VARCHAR(100) NULL DEFAULT NULL AFTER set_short_name;
