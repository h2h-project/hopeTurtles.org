import { config } from '../config/env.js';
import { validateIdToken, parseBuwanaId } from './authController.js';
import usersModel from '../models/usersModel.js';
import turtlesModel from '../models/turtlesModel.js';
import telemetryModel from '../models/telemetryModel.js';
import appSessionsModel from '../models/appSessionsModel.js';
import { isAdminRole } from '../utils/roles.js';

// App API v2 for the Turtle Wrangler Android app: a Buwana login traded for
// an app token, then read-only turtle data. Field names are the turtle data
// dictionary's; times are unix seconds; a value with no data is left out
// (undefined, which JSON drops). Spec: turtleOS docs/wrangler/03_v2_plan.md,
// Phase D, "App API v2 — first slice".

const BUWANA_ISSUER = 'https://buwana.ecobricks.org';

// ------------------------------------------------------------
// Shaping (pure; exported for tests)
// ------------------------------------------------------------
const num = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export const toUnix = (value) => {
  if (value === null || value === undefined) return undefined;
  const ms = value instanceof Date ? value.getTime() : Date.parse(`${value}Z`.replace(' ', 'T'));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

// A real fix only: both finite and not "null island" (0, 0).
export const fixOf = (lat, lon) => {
  const a = num(lat);
  const b = num(lon);
  if (a === undefined || b === undefined || (a === 0 && b === 0)) return undefined;
  return { lat: a, lon: b };
};

const pairOf = (lat, lon) => {
  const p = fixOf(lat, lon);
  return p ? [p.lat, p.lon] : undefined;
};

const parseRaw = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const text = (value) => (typeof value === 'string' && value.length ? value : undefined);

export const shapeUser = ({ buwanaId, firstName, earthlingEmoji, admin }) => ({
  buwana_id: buwanaId,
  first_name: text(firstName),
  earthling_emoji: text(earthlingEmoji),
  admin: Boolean(admin)
});

export const shapeTurtleSummary = (row) => ({
  turtle_id: Number(row.turtle_id),
  name: row.name,
  mission_name: text(row.mission_name),
  last_report_at: toUnix(row.last_update),
  ...(fixOf(row.last_lat, row.last_lng) ?? {}),
  machine_state: text(row.last_machine_state),
  ina_batt_pct: num(row.solar_charge)
});

export const shapeTurtle = (t) => {
  const missionAt = fixOf(t.mission_target_lat, t.mission_target_lng);
  const mission =
    t.mission_id || missionAt ? { name: text(t.mission_name), ...(missionAt ?? {}) } : undefined;
  return {
    turtle_id: Number(t.turtle_id),
    name: t.name,
    mission,
    set_destination: pairOf(t.set_destination_lat, t.set_destination_lng),
    set_departure: pairOf(t.set_departure_lat, t.set_departure_lng),
    set_arrival: pairOf(t.set_arrival_lat, t.set_arrival_lng)
  };
};

// telemetry_tb.`timestamp` is the turtle's recorded_at; its `recorded_at`
// column is when the server received it.
export const shapeReading = (row) => {
  if (!row) return undefined;
  const raw = parseRaw(row.raw_data);
  return {
    recorded_at: toUnix(row.timestamp),
    received_at: toUnix(row.recorded_at),
    ...(fixOf(row.latitude, row.longitude) ?? {}),
    machine_state: text(row.machine_state),
    values: raw.values && typeof raw.values === 'object' ? raw.values : {},
    flags: raw.flags && typeof raw.flags === 'object' ? raw.flags : {}
  };
};

export const shapeLastFix = (row) => {
  const at = row && fixOf(row.latitude, row.longitude);
  return at ? { recorded_at: toUnix(row.timestamp), ...at } : undefined;
};

// Track rows carry `ts` (unix s) from TIMESTAMPDIFF; rows without a real fix
// are already filtered by the queries, but a stray one is dropped here too.
export const shapeTrackPoint = (row) => {
  const at = fixOf(row.latitude, row.longitude);
  if (!at) return null;
  const journeyId = num(row.journey_id);
  return {
    recorded_at: Number(row.ts),
    ...at,
    machine_state: text(row.machine_state),
    journey_id: journeyId ? journeyId : undefined
  };
};

// ------------------------------------------------------------
// Session
// ------------------------------------------------------------

// POST /api/app/v2/session  { id_token }
export const postSession = async (req, res) => {
  const audience = config.auth.buwanaWranglerClientId;
  if (!audience) {
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }
  const idToken = req.body?.id_token;
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 8192) {
    return res.status(400).json({ ok: false, error: 'bad_request' });
  }

  let claims;
  try {
    claims = await validateIdToken({ idToken, audience, issuer: BUWANA_ISSUER });
  } catch (error) {
    console.warn('app session: ID token rejected:', error?.message || error);
    return res.status(400).json({ ok: false, error: 'bad_id_token' });
  }

  try {
    // buwana:basic carries buwana_id; sub is the open_id or "buwana_<id>".
    const buwanaId = Number.isInteger(claims.buwana_id) ? claims.buwana_id : parseBuwanaId(claims.sub);
    const user = await usersModel.upsertFromBuwana({
      buwana_id: buwanaId,
      email: claims.email || undefined,
      first_name: claims.given_name || undefined,
      earthling_emoji: claims['buwana:earthlingEmoji'] || undefined,
      last_login: new Date()
    });
    const { token, expiresAtUnix } = await appSessionsModel.create(buwanaId);
    console.log('app session: created for user', buwanaId);
    return res.status(200).json({
      ok: true,
      token,
      expires_at: expiresAtUnix,
      user: shapeUser({
        buwanaId,
        firstName: user?.first_name,
        earthlingEmoji: user?.earthling_emoji,
        admin: isAdminRole(user?.role)
      })
    });
  } catch (error) {
    console.error('app session error:', error?.stack || error?.message || error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

// DELETE /api/app/v2/session
export const deleteSession = async (req, res) => {
  try {
    await appSessionsModel.revoke(req.appUser.sessionId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('app session revoke error:', error?.stack || error?.message || error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

// GET /api/app/v2/me
export const getMe = (req, res) => res.status(200).json({ ok: true, user: shapeUser(req.appUser) });

// ------------------------------------------------------------
// Turtles (read-only)
// ------------------------------------------------------------

// The turtle :id if this user may see it (manager or admin), else null —
// the same rule as dashboardController.renderMyTurtle.
const turtleFor = async (req) => {
  const turtleId = Number(req.params.id);
  if (!Number.isInteger(turtleId) || turtleId <= 0) return null;
  const turtle = await turtlesModel.getWithRelationsById(turtleId);
  if (!turtle) return null;
  const { admin, buwanaId } = req.appUser;
  if (admin || String(turtle.turtle_manager ?? '') === String(buwanaId)) return turtle;
  return null;
};

const notFound = (res) => res.status(404).json({ ok: false, error: 'turtle_not_found' });

const serverError = (res, where, error) => {
  console.error(`app api ${where} error:`, error?.stack || error?.message || error);
  return res.status(500).json({ ok: false, error: 'server_error' });
};

// GET /api/app/v2/turtles
export const getTurtles = async (req, res) => {
  try {
    const rows = await turtlesModel.listForApp(req.appUser.admin ? null : req.appUser.buwanaId);
    return res.status(200).json({ ok: true, turtles: rows.map(shapeTurtleSummary) });
  } catch (error) {
    return serverError(res, 'turtles', error);
  }
};

// GET /api/app/v2/turtles/:id/latest
export const getTurtleLatest = async (req, res) => {
  try {
    const turtle = await turtleFor(req);
    if (!turtle) return notFound(res);
    const [latest, lastFix] = await Promise.all([
      telemetryModel.getLatestForTurtle(turtle.turtle_id),
      telemetryModel.getLastFixForTurtle(turtle.turtle_id)
    ]);
    return res.status(200).json({
      ok: true,
      turtle: shapeTurtle(turtle),
      reading: shapeReading(latest),
      last_fix: shapeLastFix(lastFix)
    });
  } catch (error) {
    return serverError(res, 'latest', error);
  }
};

// GET /api/app/v2/turtles/:id/track?hours=24
export const getTurtleTrack = async (req, res) => {
  try {
    const turtle = await turtleFor(req);
    if (!turtle) return notFound(res);
    const hours = req.query.hours === undefined ? 24 : Number(req.query.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }
    const rows = await telemetryModel.getRouteForTurtle(turtle.turtle_id, hours);
    return res.status(200).json({ ok: true, points: rows.map(shapeTrackPoint).filter(Boolean) });
  } catch (error) {
    return serverError(res, 'track', error);
  }
};

// GET /api/app/v2/turtles/:id/journeys/:journey_id/track
export const getJourneyTrack = async (req, res) => {
  try {
    const turtle = await turtleFor(req);
    if (!turtle) return notFound(res);
    const journeyId = Number(req.params.journey_id);
    if (!Number.isInteger(journeyId) || journeyId <= 0) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }
    const rows = await telemetryModel.getJourneyTrackForTurtle(turtle.turtle_id, journeyId);
    const points = rows
      .map(shapeTrackPoint)
      .filter(Boolean)
      .map(({ journey_id: _omit, ...p }) => p);
    return res.status(200).json({ ok: true, journey_id: journeyId, points });
  } catch (error) {
    return serverError(res, 'journey track', error);
  }
};

export default {
  postSession,
  deleteSession,
  getMe,
  getTurtles,
  getTurtleLatest,
  getTurtleTrack,
  getJourneyTrack
};
