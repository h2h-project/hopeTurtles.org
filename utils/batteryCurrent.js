// Battery current sign — the one place the server converts it.
//
// turtleOS sends `values.ina_current_ma` as the INA219's raw reading, which on
// the turtle (shunt in the battery lead: VIN+ on the pack, VIN- on the XIAO)
// is NEGATIVE while the pack charges and POSITIVE while the XIAO draws from
// it. The turtle's OLED and the Wrangler app read it the same way. raw_data
// keeps that raw value untouched; everything the server computes or charts
// (SoC, battery KPIs, daily energy, the "+ charging" current chart) uses the
// charge current below instead: positive = charging, negative = discharging.
// Mirrors turtleOS INA219.charge_ma().

/** Raw `ina_current_ma` → charge current in mA (positive = charging), or null. */
export const chargeMaFromIna = (inaCurrentMa) => {
  if (inaCurrentMa === null || inaCurrentMa === undefined) return null;
  const n = Number(inaCurrentMa);
  return Number.isFinite(n) ? (n === 0 ? 0 : -n) : null;
};
