import crypto from 'crypto';
import { query } from '../config/db.js';
import { sha256Hex } from '../utils/deviceCrypto.js';

// Device responses always use the turtleOS wire shape ({ ok: ... }),
// never the site's { success: ... } shape.
const readHeader = (req, name) => {
  const raw = req.get(name);
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
};

const hashesMatch = (incomingHex, storedHex) => {
  const a = Buffer.from(incomingHex, 'utf8');
  const b = Buffer.from(String(storedHex), 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
};

// turtleOS sends X-Device-Id (the numeric turtle_id as a string) and
// X-Device-Key (the plaintext turtle secret). turtles_tb.secret_hash
// already stores SHA-256(secret), so devices authenticate directly
// against the turtle record. Any turtle status is accepted — newly
// launched turtles are 'awaiting_serial' and connecting is how they
// come online.
export const deviceAuth = async (req, res, next) => {
  const deviceId = readHeader(req, 'X-Device-Id');
  const deviceKey = readHeader(req, 'X-Device-Key');

  if (!deviceId || !deviceKey) {
    return res.status(401).json({ ok: false, error: 'missing_device_auth' });
  }

  const turtleId = Number(deviceId);
  if (!Number.isInteger(turtleId) || turtleId <= 0) {
    return res.status(401).json({ ok: false, error: 'unknown_device' });
  }

  try {
    const rows = await query(
      `SELECT turtle_id, name, status, secret_hash,
              control_battery_capacity_ah, battery_soc_pct, battery_soc_updated_at
       FROM turtles_tb WHERE turtle_id = ? LIMIT 1`,
      [turtleId]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: 'unknown_device' });
    }

    const turtle = rows[0];
    if (!turtle.secret_hash || !hashesMatch(sha256Hex(deviceKey), turtle.secret_hash)) {
      return res.status(401).json({ ok: false, error: 'invalid_device_key' });
    }

    req.turtle = {
      turtle_id: turtle.turtle_id,
      name: turtle.name,
      status: turtle.status,
      control_battery_capacity_ah: turtle.control_battery_capacity_ah,
      battery_soc_pct: turtle.battery_soc_pct,
      battery_soc_updated_at: turtle.battery_soc_updated_at
    };
    return next();
  } catch (error) {
    console.error('deviceAuth error:', error?.stack || error?.message || error);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};

export default deviceAuth;
