-- ------------------------------------------------------------
-- 🐢 Coulomb-counted Battery State of Charge
-- ------------------------------------------------------------
-- Run manually against hopeturtle_db. The app does NOT auto-migrate.
--
-- Replaces the voltage-to-percent lookup with true coulomb counting: each
-- telemetry packet integrates ina_current_ma over the elapsed time since the
-- previous packet into a running SoC%, anchored back to 100%/0% at charger
-- termination / near-empty voltage to bound long-run drift. See
-- controllers/deviceApiController.js and utils/batterySoc.js.
--
-- turtles_tb gets the battery capacities (coulomb counting's denominator)
-- and the latest running SoC + its reference timestamp, so the integration
-- survives a server restart. Capacities default to the control/servo pack
-- sizes currently used (4200mAh / 4000mAh) so every turtle always has a
-- usable value, and are settable per turtle at launch time.
--
-- telemetry_tb gets its own battery_soc_pct so the SoC trend chart can plot
-- the value as it stood at each historical packet, not just the current one.

ALTER TABLE turtles_tb
  ADD COLUMN control_battery_capacity_ah DECIMAL(6,3) NOT NULL DEFAULT 4.200 AFTER solar_charge,
  ADD COLUMN servo_battery_capacity_ah DECIMAL(6,3) NOT NULL DEFAULT 4.000 AFTER control_battery_capacity_ah,
  ADD COLUMN battery_soc_pct DECIMAL(5,2) NULL DEFAULT NULL AFTER servo_battery_capacity_ah,
  ADD COLUMN battery_soc_updated_at DATETIME NULL DEFAULT NULL AFTER battery_soc_pct;

ALTER TABLE telemetry_tb
  ADD COLUMN battery_soc_pct DECIMAL(5,2) NULL DEFAULT NULL AFTER battery_voltage;
