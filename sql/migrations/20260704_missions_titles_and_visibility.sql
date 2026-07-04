-- ------------------------------------------------------------
-- 🐢 Missions: split title into full_name + short_name, add visibility
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- Changes to missions_tb:
--   * `name`  -> renamed to `full_name` (existing values are preserved)
--   * `short_name`  (NEW, nullable) — a brief label for cards / lists /
--     map pins where the full title is too long.
--   * `visibility`  (NEW) — who may see the mission:
--       'public'     = full public
--       'admin_only' = admins only
--       'core_team'  = core team only
--       'users_only' = any logged-in user
--     Defaults to 'public' so existing missions stay visible after migrating.
--
-- ⚠️  Application code still references missions_tb.name (missionsModel does
--     `SELECT m.*`, and several views read `mission.name` / `mission_name`,
--     and the admin create/edit form POSTs `name`). Deploy the matching code
--     changes TOGETHER with this migration, or missions will fail to render /
--     save. Run this against a backup / staging DB first.
-- ------------------------------------------------------------



-- Optional: seed short_name from the (now) full_name so existing missions
-- have a non-null brief label. Uncomment to run.
-- UPDATE `missions_tb`
--   SET `short_name` = LEFT(`full_name`, 50)
--   WHERE `short_name` IS NULL;
