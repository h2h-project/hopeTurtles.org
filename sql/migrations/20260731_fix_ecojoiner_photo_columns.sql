-- ------------------------------------------------------------
-- 🐢 Fix: ecojoiner tables missing photo/visibility columns
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- Cause: docs/august_schema_update.md section 2 is a proposal document — its
-- `CREATE TABLE` blocks are an earlier draft of ecojoiner_bottle_profiles_tb /
-- ecojoiner_designs_tb. The version actually meant to be run is
-- sql/migrations/20260804_ecojoiner_profiles_and_designs.sql, which adds
-- `bottle_photo_id`, `ecojoiner_photo_id`, `visibility`, and `share_token` on
-- top of the doc's draft (see that file's header comment for why). If the
-- doc's raw SQL got run instead of the migration, the tables exist but are
-- missing those columns — which is what throws
-- "Unknown column 'p.bottle_photo_id' in 'on clause'" from
-- models/ecojoinerProfilesModel.js.
--
-- Every change below is guarded through information_schema + PREPARE/EXECUTE
-- rather than `ADD COLUMN IF NOT EXISTS` / `ADD KEY IF NOT EXISTS` — those
-- are MariaDB-only extensions and error out on stock MySQL ("You have an
-- error in your SQL syntax ... near 'IF NOT EXISTS'"). This version runs on
-- both, and is safe to run more than once.
-- ------------------------------------------------------------

-- ecojoiner_bottle_profiles_tb.bottle_photo_id ------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecojoiner_bottle_profiles_tb'
    AND COLUMN_NAME = 'bottle_photo_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `ecojoiner_bottle_profiles_tb` ADD COLUMN `bottle_photo_id` BIGINT UNSIGNED DEFAULT NULL AFTER `thickness_mm`, ADD KEY `bottle_photo_id` (`bottle_photo_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecojoiner_bottle_profiles_tb'
    AND CONSTRAINT_NAME = 'eco_profiles_photo_fk'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `ecojoiner_bottle_profiles_tb` ADD CONSTRAINT `eco_profiles_photo_fk` FOREIGN KEY (`bottle_photo_id`) REFERENCES `photos_tb`(`photo_id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ecojoiner_designs_tb.visibility -------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecojoiner_designs_tb'
    AND COLUMN_NAME = 'visibility'
);
SET @sql := IF(@col_exists = 0,
  "ALTER TABLE `ecojoiner_designs_tb` ADD COLUMN `visibility` ENUM('private','public') NOT NULL DEFAULT 'private' AFTER `status`",
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ecojoiner_designs_tb.share_token -------------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecojoiner_designs_tb'
    AND COLUMN_NAME = 'share_token'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `ecojoiner_designs_tb` ADD COLUMN `share_token` CHAR(22) DEFAULT NULL AFTER `visibility`, ADD UNIQUE KEY `uq_design_share_token` (`share_token`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ecojoiner_designs_tb.ecojoiner_photo_id ------------------------------------
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecojoiner_designs_tb'
    AND COLUMN_NAME = 'ecojoiner_photo_id'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE `ecojoiner_designs_tb` ADD COLUMN `ecojoiner_photo_id` BIGINT UNSIGNED DEFAULT NULL AFTER `file_manifest`, ADD KEY `ecojoiner_photo_id` (`ecojoiner_photo_id`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ecojoiner_designs_tb'
    AND CONSTRAINT_NAME = 'eco_designs_photo_fk'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE `ecojoiner_designs_tb` ADD CONSTRAINT `eco_designs_photo_fk` FOREIGN KEY (`ecojoiner_photo_id`) REFERENCES `photos_tb`(`photo_id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Re-assert the full related_type ENUM regardless of which migrations ran
-- and in what order — MODIFY is safe to repeat.
ALTER TABLE `photos_tb`
  MODIFY `related_type` ENUM('turtle','bottle','success','mission','hub',
                              'ecojoiner_bottle_profile','ecojoiner_design',
                              'component') NOT NULL;
