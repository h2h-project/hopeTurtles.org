-- ------------------------------------------------------------
-- 🐢 Ecojoiner: "Adjust Connection" port fit offset
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- Adds the port-fit offset (mm) set by the generate page's "Adjust
-- Connection" slider — how snugly the ecojoiner's ports grip the bottle.
-- Positive values loosen the port beyond the bottle diameter, negative
-- values tighten it. Stored per saved bottle profile (ecojoiner/generate_
-- exports.py::EcojoinerInputs.port_height already folds this offset in at
-- parse time, so nothing downstream of parsing needs a separate column).
-- Saved designs pick it up automatically via profile_snapshot, which is a
-- JSON snapshot of the whole profile row.
-- ------------------------------------------------------------

ALTER TABLE `ecojoiner_bottle_profiles_tb`
  ADD COLUMN `port_fit_mm` DECIMAL(3,1) NOT NULL DEFAULT 0
    AFTER `top_tapper_mm`;
