-- ------------------------------------------------------------
-- 🐢 Ecojoiner: saved bottle profiles + saved designs, login-gated generator
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- Builds on the proposal in docs/august_schema_update.md (section 2), with
-- two additions that proposal was missing:
--   * `ecojoiner_designs_tb.visibility` + `share_token` — a saved design can
--     be exported privately (default) or made public via an unguessable
--     shareable link. There is no public gallery/listing — `share_token` is
--     the only way to reach a public design's read-only view.
--   * `bottle_photo_id` on profiles and `ecojoiner_photo_id` on designs —
--     the user is prompted for a photo of the bottle and of the finished
--     ecojoiner when saving. Both point at the existing polymorphic
--     `photos_tb`, whose `related_type` ENUM is extended below.
--
-- Section 1 of docs/august_schema_update.md (bottle recovery lifecycle /
-- success_bottles_tb) is unrelated to this feature and ships separately.
--
-- ⚠️  Deploy alongside the matching app code (new models, routes/api/ecojoiner.js
--     auth gate, controllers, views) — /ecojoiners/generate becomes login-only
--     as part of this same change.
-- ------------------------------------------------------------

-- Reusable bottle measurements, keyed to the user who entered them. Mirrors
-- the fields validated by ecojoiner/generate_exports.py::validate_inputs()
-- and mapped in utils/ecojoinerGenerator.js::mapFormFields(). Always private
-- to the owner — no visibility column here by design.
CREATE TABLE IF NOT EXISTS `ecojoiner_bottle_profiles_tb` (
  `profile_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `buwana_id` INT NOT NULL,
  `label` VARCHAR(80) NOT NULL,
  `brand` VARCHAR(60) NOT NULL,
  `volume_ml` DECIMAL(7,2) NOT NULL,
  `diameter_mm` DECIMAL(6,2) NOT NULL,
  `cap_mm` DECIMAL(6,2) NOT NULL,
  `collar_mm` DECIMAL(6,2) NOT NULL,
  `height_mm` DECIMAL(6,2) DEFAULT NULL,
  `top_tapper_mm` DECIMAL(6,2) NOT NULL,
  `bottom_tapper_mm` DECIMAL(6,2) DEFAULT NULL,
  `material` ENUM('solid-wood','pallet-wood','plywood','particle-board','plastic','other') DEFAULT NULL,
  `thickness_mm` DECIMAL(5,2) NOT NULL,
  `bottle_photo_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`profile_id`),
  KEY `buwana_id` (`buwana_id`),
  KEY `bottle_photo_id` (`bottle_photo_id`),
  UNIQUE KEY `uq_profile_owner_label` (`buwana_id`, `label`),
  CONSTRAINT `eco_profiles_user_fk` FOREIGN KEY (`buwana_id`) REFERENCES `users_tb`(`buwana_id`) ON DELETE CASCADE,
  CONSTRAINT `eco_profiles_photo_fk` FOREIGN KEY (`bottle_photo_id`) REFERENCES `photos_tb`(`photo_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A generate run against a profile. Denormalizes the spec at save time
-- (profile_snapshot) so edits to the profile — or its deletion — never
-- change what a previously-generated design says it was built from.
CREATE TABLE IF NOT EXISTS `ecojoiner_designs_tb` (
  `design_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `buwana_id` INT NOT NULL,
  `profile_id` BIGINT UNSIGNED DEFAULT NULL,
  `profile_snapshot` JSON NOT NULL,
  `ecojoiner_type` VARCHAR(20) NOT NULL DEFAULT '6fc',
  `formats` JSON NOT NULL,
  `status` ENUM('draft','generated','expired') NOT NULL DEFAULT 'draft',
  -- 'private' (default) or 'public'. Public designs are reachable only via
  -- their unguessable share_token — there is no public gallery/listing.
  `visibility` ENUM('private','public') NOT NULL DEFAULT 'private',
  -- Generated only when a design is first made public (see
  -- controllers/ecojoinerController.js). NULL for private designs.
  `share_token` CHAR(22) DEFAULT NULL,
  `job_id` VARCHAR(32) DEFAULT NULL,
  `file_manifest` JSON DEFAULT NULL,
  `ecojoiner_photo_id` BIGINT UNSIGNED DEFAULT NULL,
  `generated_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`design_id`),
  KEY `buwana_id` (`buwana_id`),
  KEY `profile_id` (`profile_id`),
  KEY `ecojoiner_photo_id` (`ecojoiner_photo_id`),
  UNIQUE KEY `uq_design_share_token` (`share_token`),
  CONSTRAINT `eco_designs_user_fk` FOREIGN KEY (`buwana_id`) REFERENCES `users_tb`(`buwana_id`) ON DELETE CASCADE,
  CONSTRAINT `eco_designs_profile_fk` FOREIGN KEY (`profile_id`) REFERENCES `ecojoiner_bottle_profiles_tb`(`profile_id`) ON DELETE SET NULL,
  CONSTRAINT `eco_designs_photo_fk` FOREIGN KEY (`ecojoiner_photo_id`) REFERENCES `photos_tb`(`photo_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend the polymorphic photo ENUM to cover the two new owning entities.
-- Uses MODIFY (not DROP+ADD) so all existing values are preserved as-is.
ALTER TABLE `photos_tb`
  MODIFY `related_type` ENUM('turtle','bottle','success','mission','hub',
                              'ecojoiner_bottle_profile','ecojoiner_design') NOT NULL;
