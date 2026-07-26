# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HopeTurtles.org** is the mission-control web platform for the Hope Turtle Project — a regenerative humanitarian initiative that deploys solar-powered marine drones (Hope Turtles) to deliver aid across oceans. This platform handles mission planning, turtle tracking, bottle registry, success logging, and Buwana-authenticated user accounts.

The **big active project** is wiring up device telemetry ingestion so that physical turtle devices (running `turtleOS`) can POST their GPS/sensor/battery readings directly to this server, the same way they currently do to `air2.earthen.io` (the turtleAPI project). See [Telemetry Ingestion Project](#telemetry-ingestion-project) below.

## Commands

```bash
npm install          # install dependencies
npm run dev          # development server (nodemon, auto-restart on file change)
npm start            # production start
npm run ecojoiner:setup  # one-time: python venv + reportlab for the Ecojoiner generator
npm run lint         # ESLint
npm run format       # Prettier --write
```

Server listens on `http://localhost:3000`. Requires a `.env` copied from `.env.example`.

## Architecture

**Entry point:** `server.js` — configures Express, session store, global template locals, mounts all routers, and calls `start()` which pings the DB before listening.

**Config:** `config/env.js` exports a typed `config` object assembled from `process.env`. Warns on startup if required vars are missing. `config/db.js` exports a mysql2 connection pool.

**Routing:**

| File | Mounts at | Handles |
|------|-----------|---------|
| `routes/web.js` | `/` | HTML page routes → EJS views |
| `routes/api/index.js` | `/api` | Mounts all JSON API sub-routers |
| `routes/api/auth.js` | `/auth` | Buwana OIDC flow (login, callback, logout) |

**MVC pattern:**
- `models/` — SQL via `mysql2`. `models/baseModel.js` exports `createModel(tableName, primaryKey)` — a factory that returns standard `getAll(filters)`, `getById`, `create`, `update`, `delete` methods. Other models extend this.
- `controllers/` — business logic, calls models, renders views or returns JSON.
- `views/` — EJS templates. Partials in `views/partials/`.

**Middleware:**
- `middleware/auth.js` — `ensureAuth`, `ensureAdmin`, `ensureAdminOrFounder` session guards.
- `middleware/localization.js` — locale detection from cookie, falls back to `DEFAULT_LANG`.
- `middleware/theme.js` — `light`/`dark` theme from cookie.

**i18n:** Locale strings in `locales/{en,ms,id,he,ar,de,zh,tr}.json`. Set via `POST /language`.
Views read them as `t.some_key` (`res.locals.t`, set by `middleware/localization.js`).
`getTranslations()` layers the chosen language over English, so a key that exists only in
`en.json` renders its English wording rather than `undefined` — add new copy to `en.json` first,
then translate. Client-side strings follow the same source of truth: the view serializes the
relevant keys into a `<script type="application/json">` block that the page script reads (see
`#eco-i18n` in `views/generate.ejs`).

**File uploads:** Multer → `public/uploads/`. Profile pictures use `multer.diskStorage`.

## Domain Entities & Schema

Full schema: `hopeturtle_schema_v1.1.sql`. Migrations: `sql/migrations/`. All tables use `_tb` suffix.

```
users_tb       — Buwana-authenticated users (PK: buwana_id int)
missions_tb    — Aid deployment campaigns (target GPS, status lifecycle)
hubs_tb        — Launch locations with coordinators
boats_tb       — Vessels that carry turtles
turtles_tb     — Individual solar-powered drone units
bottles_tb     — Serialized cargo units (serial_number UNIQUE) carried in turtles
telemetry_tb   — GPS / sensor / battery readings from turtles
success_tb     — Found-bottle/turtle confirmations (photos, messages)
alerts_tb      — Platform-wide notices
photos_tb      — Photos linked to turtles, bottles, missions, hubs, or successes
```

`telemetry_tb` columns: `telemetry_id`, `turtle_id`, `timestamp`, `latitude`, `longitude`, `battery_voltage`, `temp_c`, `connection ENUM('wifi','gsm','satellite')`, `raw_data JSON`, `recorded_at`.

## Authentication

### Buwana OIDC (user auth)
- PKCE flow via `routes/api/auth.js` — redirects to `buwana.ecobricks.org/authorize.php`.
- Callback validates JWT via JWKS (`BUWANA_JWKS_URI`), upserts user in `users_tb`, creates session.
- Session cookie: `ht.sid` — httpOnly, secure, `sameSite: none` (required for cross-origin OAuth redirect), 15-min max-age.
- `req.session.user` holds the authenticated user; `res.locals.currentUser` set globally in `server.js`.
- Guards: `ensureAuth` / `ensureAdmin` / `ensureAdminOrFounder` in `middleware/auth.js`.

### Device auth (not yet implemented — see below)
Physical turtle devices authenticate with `X-Device-Id` + `X-Device-Key` headers. This system still needs to be built.

## Key Conventions

- **ES modules throughout** — `"type": "module"` in `package.json`; use `import`/`export`.
- **`buwana_id` (int) is the user PK** — not an auto-increment `id`.
- **Global template locals** injected in `server.js`: `currentUser`, `theme`, `mapboxToken`, `brand`, `currentPath`.
- **Web route responses** call `res.render(view, { pageTitle, ...data })`.
- **API success responses:** `{ success: true, data: ... }`.
- **API error responses:** `{ success: false, message: '...' }`.

## Style Guide (from `HopeTurtle_Style_Guide.md`)

```css
--color-primary: #017919;   /* turtle green */
--color-accent:  #23B053;   /* leaf accent / hover */
--color-forest:  #1F3B22;   /* deep forest text */
--color-mist:    #F2F9F3;   /* page background */
--color-mint:    #C0E3CB;   /* soft surface / captions */
```

Font: **Mulish** (300 / 400 / 600), served locally from `/fonts/`. ASCII turtle motifs (`───🐢───`) used as section dividers. Responsive typography via CSS variables.

---

## Telemetry Ingestion Project

The goal is to let turtleOS devices POST telemetry directly to **hopeturtles.org** instead of the AirBuddy API at `air2.earthen.io`. The turtleAPI project (`../turtleAPI`) is the reference implementation — its `CLAUDE.md` documents the complete working system.

### What turtleOS sends

turtleOS POSTs to `POST /api/v1/telemetry` (and `POST /api/v1/telemetry/batch` for queued readings) with these headers and body:

```http
POST /api/v1/telemetry
X-Device-Id: <device UID string>
X-Device-Key: <plaintext key>
Content-Type: application/json

{
  "recorded_at": 1700000000,     // Unix seconds (required)
  "values": {
    // turtle navigation / power (turtle_mode = true)
    "ina_bus_v":      3.85,      // battery bus voltage
    "ina_batt_pct":   65,        // estimated battery %
    "ina_current_ma": 120.5,
    "ina_power_mw":   463.9,
    "rtc_temp":       26.0,      // DS3231 onboard temp

    // air quality (turtle_mode = false / airOS mode)
    "ens_eco2": 812, "ens_tvoc": 100, "ens_aqi": 2,
    "aht_temp": 26.8, "aht_humidity": 68.5,
    "bme_temp": 27.0, "bme_humidity": 65.0, "bme_pressure": 1013.2
  },
  "lat": -7.716,                 // GPS latitude (optional, omitted when no fix)
  "lon": 114.008,                // GPS longitude (optional)
  "flags": { "auto_log": true },
  "confidence": { "sensor_confidence": 90 }  // optional
}
```

The batch endpoint receives an array of the above objects.

**Expected response** (device parses this):
```json
{ "ok": true, "server_now": 1700000042 }
```
- `server_now` (Unix seconds) lets the device calculate clock drift.
- `202 Accepted` + `{ "ok": true, "ignored": true, "reason": "..." }` for boot-garbage readings the server decides not to store.

### What needs to be built

**1. Device authentication** (no DB table or middleware exists yet)

Following the turtleAPI pattern:

- New DB table `device_keys_tb` (see `../turtleAPI/AB_db_schema.sql` for reference):
  - `id`, `device_uid` (matches `X-Device-Id`), `key_hash` (SHA256), `turtle_id` FK, `created_at`, `revoked_at`
- New `middleware/deviceAuth.js` — SHA256-hash the incoming `X-Device-Key`, look up by `device_uid` and `key_hash` WHERE `revoked_at IS NULL`, attach `req.device = { device_uid, turtle_id }`.
- Devices authenticate against turtles, not users — the device key maps directly to a `turtle_id`.

**2. `POST /api/v1/telemetry` endpoint** (`routes/api/telemetry.js`)

- Accept the payload above. Apply deviceAuth middleware.
- Validate `recorded_at` is plausible Unix seconds (year 2000–2100).
- Filter boot-garbage: if GPS is 0,0 and no battery voltage and no sensor values → return `202 { ignored: true }`.
- Map turtleOS fields → `telemetry_tb` columns:
  - `turtle_id` from `req.device.turtle_id`
  - `timestamp` = `FROM_UNIXTIME(recorded_at)`
  - `latitude` / `longitude` from `lat` / `lon`
  - `battery_voltage` from `values.ina_bus_v`
  - `temp_c` from `values.aht_temp` or `values.bme_temp`
  - `connection` = `'wifi'` (always, for now)
  - `raw_data` = full `values` JSON
- Handle duplicate `(turtle_id, timestamp)` silently (unique constraint or INSERT IGNORE).
- Update `turtles_tb.last_lat`, `last_lng`, `last_update` on success.
- Return `{ ok: true, server_now: <unix seconds now> }`.

**3. `POST /api/v1/telemetry/batch` endpoint**

- Accept an array of readings, process each with the same logic.
- Return `{ ok: true, accepted: N, message: "..." }`.

**4. Device registration** (admin UI or script)

- A way to register a turtle's device UID and get back a plaintext key (stored as SHA256 hash).
- The `device_id` and `device_key` go into the turtle's `config.json` on the device.
- See turtleAPI's `POST /api/devices/register` for the key-generation pattern.

**5. turtleOS config change**

- On the device, set `api_base` in `config.json` to `https://hopeturtles.org`.
- The telemetry client auto-resolves the endpoint to `/api/v1/telemetry`.

### Reference: turtleOS firmware (the client)

The turtleOS firmware lives at **`~/PycharmProjects/turtleOS`** on this machine. Live
source is `device/`; `.tmp_xiao_sync/stage/` is a build staging copy — edit `device/`.

Files that consume this server's device API:
- `device/src/ui/flows.py` — `_fetch_device_info()` + `_normalize()`; `_DEVICE_PATH_TURTLE`
  holds the URL. In `turtle_mode` the normalizer returns early after `device_name` and
  `mission_full_name` and never parses home/room/community.
- `device/src/ui/screens/device.py` — renders Name / Mission / ID in turtle mode.
- `device/src/ui/screens/time.py` — RTC + timezone sync; reads `ts` (epoch **ms**) and
  `timezone_offset_min`, falling back to `tz_offset_min`.
- `device/main.py` — boot-time API lookup; requires `ok` to be truthy.

All four read fields with `.get()` and `or ""` defaults, so **missing keys are safe** —
absent fields degrade to blank, never a KeyError. `ok`, `ts` and a tz-offset field are the
only ones anything actually depends on.

### Reference: turtleAPI implementation

The turtleAPI project (`../turtleAPI/src/`, not checked out on this machine) is the
system the telemetry endpoints were mirrored from:
- `src/middleware/deviceAuth.js` — device auth middleware
- `src/routes/v1/telemetry.js` — ingestion endpoint with all filtering/validation logic
- `src/utils/crypto.js` — `sha256Hex(str)` helper
- `AB_db_schema.sql` — full schema including `device_keys_tb`

The key differences for hopeTurtles.org:
- Device keys map to `turtle_id` (not `home_id`/`room_id` as in turtleAPI)
- `telemetry_tb` already exists but may need a `UNIQUE KEY` on `(turtle_id, timestamp)` to handle duplicates
- The response shape uses `{ success: true }` not `{ ok: true }` in most existing routes — use `{ ok: true, server_now: N }` for the telemetry endpoint specifically since turtleOS parses `ok` and `server_now` by name

---

## Ecojoiner Generator

`/ecojoiners/generate` produces Ecojoiner **v3.2** carpentry files from a visitor's bottle and
board measurements. Run `npm run ecojoiner:setup` once — it creates `ecojoiner/.venv` with
reportlab (system python3 is PEP-668 externally-managed, so a global `pip install` will not work).

**All geometry, ranges and file writing live in `ecojoiner/generate_exports.py`.** It is the single
source of truth: `validate_inputs()` owns every dimensional rule, `derive_dimensions()` owns the
formulas, `PART_QUANTITIES` owns the v3.2 part list (Long John ×6, Little John ×5, Master John ×1,
Final Key ×4, Presser ×12 — Saddlers were removed in v3.2). Do **not** re-encode those numbers in
JS; extend the Python script instead.

Flow:

| Piece | Role |
|---|---|
| `public/js/ecojoiner-generate.js` | inline field validation, then POST validate → preview → POST generate → downloads |
| `routes/api/ecojoiner.js` | `POST /api/ecojoiner/validate` (dry run) and `/generate`, both rate-limited via `middleware/rateLimit.js` |
| `controllers/ecojoinerController.js` | thin wrapper; validation failures answer `422` with `errors[]` |
| `utils/ecojoinerGenerator.js` | form→script field mapping, `execFile` invocation, path containment |
| `utils/ecojoinerCleanup.js` | deletes job folders older than `ECOJOINER_JOB_TTL_DAYS` |

Field mapping worth remembering: the form's **volume is in millilitres** and is divided by 1000;
bottle **diameter** becomes `port_height`; the **top tapper** becomes `taper_height` (port length =
taper + allowance); the DXF checkbox yields the `.scad` plus a notice, since DXF/STL still need the
OpenSCAD CLI.

Safety rules: user values are passed only inside a temp JSON file (`--json`), never as argv, and
never through a shell. Output is confined to `public/ecojoiner_exports/<jobSlug>/` (served at
`/ecojoiner_exports`); the trusted `ecojoiner/` source directory is never a write target.

## Environment Variables

```bash
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
DB_HOST=  DB_USER=  DB_PASS=  DB_NAME=
SESSION_SECRET=
BUWANA_CLIENT_ID=hope_8fc3caabded4
BUWANA_CLIENT_SECRET=
BUWANA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----..."
BUWANA_AUTHORIZE_URL=https://buwana.ecobricks.org/authorize.php
BUWANA_TOKEN_URL=https://buwana.ecobricks.org/token.php
BUWANA_JWKS_URI=https://buwana.ecobricks.org/.well-known/jwks.php
BUWANA_REDIRECT_URI=https://hopeturtles.org/auth/callback
BUWANA_SCOPE=openid buwana:basic buwana:profile buwana:community buwana:bioregion
MAPBOX_TOKEN=
DEFAULT_THEME=light
DEFAULT_LANG=en
SUPPORTED_LANGS=en,ms,id,he,ar,de,zh
ECOJOINER_PYTHON=          # optional; defaults to ecojoiner/.venv/bin/python3
ECOJOINER_JOB_TTL_DAYS=7
ECOJOINER_TIMEOUT_MS=30000
```
