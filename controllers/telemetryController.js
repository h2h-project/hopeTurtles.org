import { isAdminRole } from '../utils/roles.js';
import telemetryModel from '../models/telemetryModel.js';
import turtlesModel from '../models/turtlesModel.js';
import {
  computeSocSeries,
  computeMinSocKpis,
  computeOvernightDrawdowns,
  worstOvernightDrawdown,
  computeDailyNetEnergy,
  excludeInProgressDay,
  computeDeficitStreaks
} from '../utils/batteryKpis.js';

export const getTelemetryForTurtle = async (req, res, next) => {
  try {
    const { limit } = req.query;
    const telemetry = await telemetryModel.getByTurtleId(
      req.params.turtle_id,
      Number(limit) || 50
    );
    return res.json({ success: true, data: telemetry });
  } catch (error) {
    return next(error);
  }
};

export const getLatestTelemetry = async (req, res, next) => {
  try {
    const telemetry = await telemetryModel.getLatest();
    return res.json({ success: true, data: telemetry });
  } catch (error) {
    return next(error);
  }
};

// Returns the turtle when the session user manages it (admins bypass),
// otherwise sends the error response and returns null.
const resolveManagedTurtle = async (req, res, turtleId) => {
  const turtle = await turtlesModel.getById(turtleId);
  if (!turtle) {
    res.status(404).json({ success: false, message: 'Turtle not found' });
    return null;
  }

  const currentUser = req.session?.user || null;
  const isAdmin = isAdminRole(currentUser?.role);
  const managerIdRaw = currentUser?.buwanaId ?? currentUser?.id ?? null;
  const hasManagerId = managerIdRaw !== undefined && managerIdRaw !== null && managerIdRaw !== '';
  const turtleHasManager =
    turtle.turtle_manager !== undefined && turtle.turtle_manager !== null && turtle.turtle_manager !== '';
  const managesTurtle =
    hasManagerId && turtleHasManager && String(turtle.turtle_manager) === String(managerIdRaw);

  if (!isAdmin && !managesTurtle) {
    res.status(403).json({ success: false, message: 'Additional privileges required' });
    return null;
  }

  return turtle;
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const getTurtleTrends = async (req, res, next) => {
  try {
    const turtleId = req.params.turtle_id;
    const turtle = await resolveManagedTurtle(req, res, turtleId);
    if (!turtle) {
      return undefined;
    }

    const rows = await telemetryModel.getTrendsForTurtle(turtleId, req.query.hours ?? 25);

    const pick = (field) => rows.map((row) => toNumberOrNull(row[field]));
    return res.json({
      success: true,
      data: {
        ids: rows.map((row) => row.telemetry_id),
        timestamps: pick('ts'),
        lats: pick('latitude'),
        lons: pick('longitude'),
        rawDatas: rows.map((row) => row.raw_data ?? null),
        ensEco2s: pick('ens_eco2'),
        ensTvocs: pick('ens_tvoc'),
        ensAqis: pick('ens_aqi'),
        ahtTemps: pick('aht_temp'),
        rtcTemps: pick('rtc_temp'),
        bmeTemps: pick('bme_temp'),
        ahtHumidities: pick('aht_humidity'),
        bmeHumidities: pick('bme_humidity'),
        inaBattPcts: pick('ina_batt_pct'),
        inaBusVs: pick('ina_bus_v'),
        inaCurrentMas: pick('ina_current_ma'),
        batterySocPcts: pick('battery_soc_pct')
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const getDailyEnergy = async (req, res, next) => {
  try {
    const turtleId = req.params.turtle_id;
    const turtle = await resolveManagedTurtle(req, res, turtleId);
    if (!turtle) {
      return undefined;
    }

    const timeZone = await turtlesModel.getManagerTimeZone(turtleId);
    const data = await telemetryModel.getDailyEnergyForTurtle(turtleId, timeZone);
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

// Three battery-health KPIs computed on demand from raw current/voltage via
// coulomb counting — see utils/batteryKpis.js. Min SoC is tracked over fixed
// 7-day/all-time windows regardless of the requested range; overnight
// drawdown and deficit-day streaks are scoped to `hours` (same semantics as
// getTurtleTrends' range bar).
export const getBatteryKpis = async (req, res, next) => {
  try {
    const turtleId = req.params.turtle_id;
    const turtle = await resolveManagedTurtle(req, res, turtleId);
    if (!turtle) {
      return undefined;
    }

    const parsedHours = Number.parseFloat(req.query.hours);
    const rangeHours = Number.isFinite(parsedHours) ? Math.min(Math.max(parsedHours, 0.25), 721) : 721;
    const nowUnix = Math.floor(Date.now() / 1000);
    const rangeStartUnix = nowUnix - rangeHours * 3600;

    const rawRows = await telemetryModel.getBatteryReadingsForTurtle(turtleId);
    const readings = rawRows
      .map((row) => ({
        ts: toNumberOrNull(row.ts),
        currentMa: toNumberOrNull(row.ina_current_ma),
        busV: toNumberOrNull(row.ina_bus_v)
      }))
      .filter((row) => Number.isFinite(row.ts));

    const capacityAh = toNumberOrNull(turtle.control_battery_capacity_ah) ?? 4.2;
    const socSeries = computeSocSeries(readings, { capacityAh });
    const minSoc = computeMinSocKpis(socSeries, nowUnix);

    const rangeReadings = readings.filter((row) => row.ts >= rangeStartUnix);

    const nights = computeOvernightDrawdowns(rangeReadings);
    const worstNight = worstOvernightDrawdown(nights);

    const timeZone = await turtlesModel.getManagerTimeZone(turtleId);
    const days = excludeInProgressDay(
      computeDailyNetEnergy(rangeReadings, { timeZone }),
      nowUnix,
      timeZone
    );
    const deficitStreaks = computeDeficitStreaks(days);

    return res.json({
      success: true,
      data: {
        rangeHours,
        minSoc,
        overnightDrawdown: { worst: worstNight, nights },
        deficitDays: { ...deficitStreaks, days }
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteTurtleTelemetry = async (req, res, next) => {
  try {
    const turtleId = req.params.turtle_id;
    const turtle = await resolveManagedTurtle(req, res, turtleId);
    if (!turtle) {
      return undefined;
    }

    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, message: 'ids array required' });
    }

    // Note: deleting the newest packet leaves turtles_tb.last_lat/last_update
    // stale until the next reading arrives — acceptable for test-packet cleanup.
    const deleted = await telemetryModel.deleteByIdsForTurtle(ids, turtleId);
    return res.json({ success: true, data: { deleted } });
  } catch (error) {
    return next(error);
  }
};

export const deleteAllTurtleTelemetry = async (req, res, next) => {
  try {
    const turtleId = req.params.turtle_id;
    const turtle = await resolveManagedTurtle(req, res, turtleId);
    if (!turtle) {
      return undefined;
    }

    // Note: leaves turtles_tb.last_lat/last_update stale until the next
    // reading arrives — same tradeoff as the selective delete above.
    const deleted = await telemetryModel.deleteAllForTurtle(turtleId);
    return res.json({ success: true, data: { deleted } });
  } catch (error) {
    return next(error);
  }
};

export default {
  getTelemetryForTurtle,
  getLatestTelemetry,
  getTurtleTrends,
  getDailyEnergy,
  getBatteryKpis,
  deleteTurtleTelemetry,
  deleteAllTurtleTelemetry
};
