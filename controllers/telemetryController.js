import telemetryModel from '../models/telemetryModel.js';
import turtlesModel from '../models/turtlesModel.js';

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
  const isAdmin = currentUser?.role === 'admin';
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
        inaCurrentMas: pick('ina_current_ma')
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

export default {
  getTelemetryForTurtle,
  getLatestTelemetry,
  getTurtleTrends,
  deleteTurtleTelemetry
};
