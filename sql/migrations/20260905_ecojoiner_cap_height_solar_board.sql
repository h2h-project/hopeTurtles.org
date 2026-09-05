-- ------------------------------------------------------------
-- 🐢 Ecojoiner: cap height, board max-width & solar panel dimensions
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- Adds five "capture only" dimension fields to the saved bottle profile:
-- cap_height_mm (a bottle dimension, alongside diameter_mm/cap_mm/collar_mm)
-- and board_max_width_mm / solar_panel_width_mm / solar_panel_thickness_mm /
-- solar_panel_height_mm (board + solar dimensions, alongside thickness_mm/
-- material). These are validated and saved like height_mm/bottom_tapper_mm
-- already are, but do NOT feed ecojoiner/generate_exports.py's geometry —
-- see utils/ecojoinerGenerator.js::mapFormFields()'s `context` object and
-- controllers/ecojoinerController.js::parseProfileFields() for where they're
-- handled. The solar panel fields only apply to the new "Fin Attachment"
-- ecojoiner type (Panel 4 of /ecojoiners/generate); real fin geometry is a
-- follow-up project.
-- ------------------------------------------------------------

ALTER TABLE `ecojoiner_bottle_profiles_tb`
  ADD COLUMN `cap_height_mm` DECIMAL(6,2) DEFAULT NULL
    AFTER `bottom_tapper_mm`,
  ADD COLUMN `board_max_width_mm` DECIMAL(6,2) DEFAULT NULL
    AFTER `thickness_mm`,
  ADD COLUMN `solar_panel_width_mm` DECIMAL(6,2) DEFAULT NULL
    AFTER `board_max_width_mm`,
  ADD COLUMN `solar_panel_thickness_mm` DECIMAL(6,2) DEFAULT NULL
    AFTER `solar_panel_width_mm`,
  ADD COLUMN `solar_panel_height_mm` DECIMAL(6,2) DEFAULT NULL
    AFTER `solar_panel_thickness_mm`;
