# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**HopeTurtles.org** is the mission-control web platform for the Hope Turtle Project — a regenerative humanitarian initiative that deploys solar-powered marine drones (Hope Turtles) to deliver aid across oceans. This platform handles mission planning, turtle tracking, bottle registry, success logging, Buwana-authenticated user accounts, and (increasingly) the financial side of the project — contributions, turtle commissioning, and radically transparent open-book accounting. See [Contributions, Commissioning & OpenBooks](#contributions-commissioning--openbooks) below.

The **big active project** is wiring up device telemetry ingestion so that physical turtle devices (running `turtleOS`) can POST their GPS/sensor/battery readings directly to this server, the same way they currently do to `air2.earthen.io` (the turtleAPI project). See [Telemetry Ingestion Project](#telemetry-ingestion-project) below.

## Commands

```bash
npm install          # install dependencies
npm run dev          # development server (nodemon, auto-restart on file change)
npm start            # production start
npm run generator:setup  # one-time: python venv + reportlab/ezdxf for the turtle generator
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

## Turtle Generator (`generator/`)

`/ecojoiners/generate` produces carpentry files for the **wooden parts of a full Hope Turtle**
from a visitor's bottle, board and solar-panel measurements. The 6FC Ecojoiner is the central
part of that turtle, not the whole product — the directory was renamed from `ecojoiner/` to
`generator/` on 2026-09-08 to reflect this. Run `npm run generator:setup` once — it creates
`generator/.venv` with reportlab + ezdxf (system python3 is PEP-668 externally-managed, so a
global `pip install` will not work).

### Upstream contract — turtle_body is the source of truth

The geometry here is **downstream of the sibling repository `../turtle_body`**
(`~/WebstormProjects/turtle_body`, [github](https://github.com/h2h-project/turtle_body)). Its
`lib/params.scad` (every shared dimension as a `function p_*()`) and the wooden-component modules
`lib/ecojoiner.scad`, `lib/rear_fin.scad`, `lib/ballast_fin.scad`, `lib/sail_frame.scad` are
authoritative. When a value or formula here differs from upstream, **the generator is wrong.**

Rules:

- **Never change a geometry default, formula or part list in `generator/` on its own.** Check the
  upstream `p_*()` / `rf_*` / `bl_*` / `eco_*` definition first and cite its name in a comment next
  to the generator constant (see `generator/objects/sails.py` for the pattern).
- **When `../turtle_body/VERSION.json` changes**, read its `changelog` entry and turtle_body's
  `CLAUDE.md` §19 (the mapping table + propagation rule), update the affected generator, and add
  or close an entry in `generator/SYNC_LOG.md`. A minor or major upstream bump almost always
  touches a generator; a patch bump to a PLA part (cap, cage, axle, mold) never does.
- **The drift table below and `generator/SYNC_PLAN.md` are the backlog.** Work items S-1…S-6
  there are ordered; S-5 (a `params.json` export from turtle_body + a vendored-bundle sync script
  here) is the mechanism that stops this drifting again.

All recorded drift (rear fin, ballast, sails and 6FC) was fixed 2026-09-08 — see
`generator/SYNC_LOG.md` for the full history. No open drift remains; only S-5 (the automatic
sync mechanism) and S-6 (hygiene) are deferred, per `generator/SYNC_PLAN.md`.

**Resolved 2026-09-08:** rear fin's `shaft_hole_diameter` (6.0 → 6.4) and fixed
`shaft_hole_from_front` (now derived via TB-07, not a constant); ballast's defaults
(15/320/35 → 12/305/31), slat-height formula (4.5·t → 6·t), a **missing M6 mount hole**
(the core slat had none at all), and a latent bug where the shoulder-cut position read
`port_length` instead of `bottle_diameter` (numerically equal only at the reference
bottle's defaults); sails' bottle diameter and cap/collar/dome heights (the SCAD module
already accepted them — only the Python wrapper never threaded them through) **plus**
SVG/DXF/PDF carpenter-sheet writers for all 7 sail part shapes, added from scratch and
verified against real OpenSCAD-rendered bounding boxes; 6FC's part list (Master John ×1 +
Little John ×5 → six Little Johns, no Master John), `cap_diameter` 32→31, `collar_diameter`
32→34, `port_height` 85→82, `screw_diameter` 4.5 (pilot)→6.4 (M6 clearance) — `objects/six_fc.py`
renamed `objects/ecojoiner_6fc.py` in the same pass (internal only; `object_type`, job-slug
prefix and every public identifier are unchanged). `bottom_fin_raw.py` deleted. Full detail in
`generator/SYNC_PLAN.md`'s "Resolved" section and `SYNC_LOG.md`.

**Port length is not drift** (resolved 2026-09-08, turtle_body v1.7.2). The generators derive
`port_length = taper_height + port_allowance` (20); lib had flattened that to a constant 82 and
was corrected to `p_port_length() = p_top_dome_h() + p_port_allowance()`. The form's **top
tapper** field is the builder's measurement of `p_top_dome_h()`. This is the precedent for the
sync: "lib wins" means lib owns the *rule*; when a generator carries a parametric rule that lib
has hardcoded, lift the rule upstream instead of flattening the generator.

### Layout and contract

| Path | Role |
|---|---|
| `generator/generate_exports.py` | CLI dispatcher — the only script Node runs. `OBJECT_MODULES` maps `object_type` (`6fc`, `fin`, `ballast`, `sails`) to an object module. No geometry. |
| `generator/common.py` | Shared SVG/DXF/PDF primitives, fonts, slugify, `GeneratedFile`, `DESIGN_VERSION`. |
| `generator/objects/ecojoiner_6fc.py` | 6FC Ecojoiner core (Long John ×6, Little John ×6, Final Key ×4, Presser ×12 — no Master John). Self-contained SCAD writer + SVG/DXF/PDF (en/id/tr). |
| `generator/objects/back_fin.py` + `generator/back_fin_generator.py` | Rear fin ×1, bottle-holder shaft ×2, solar-panel holder ×1. The reference script owns `build_scad()`; the object module adds manifest + 2D writers. |
| `generator/objects/ballast.py` + `generator/bottom_ballast_fin_generator.py` | Core slat ×2, ballast bottom board ×1, lock foot ×2, ballast fin ×1. Same split. |
| `generator/objects/sails.py` + `generator/generate_sails.py` | Top sail bar ×1, battens ×4, bottom bars ×2, strengtheners ×2, C end pieces ×2, sails ×2. Full SCAD/SVG/DXF/PDF, same as the other objects. |
| `generator/SYNC_PLAN.md` / `generator/SYNC_LOG.md` | The upstream-sync assessment and its running log. |
| `generator/claude_code_ecojoiner_backend_prompt_v3_2.md` | Historical: the original brief for the 6FC backend. Not current documentation. |

Every object module exposes the same contract: `parse_inputs_from_dict(data)`,
`validate_inputs(inputs) -> [errors]`, `derive_dimensions(inputs)`, `make_job_slug(...)`,
`PART_QUANTITIES`, and `generate(inputs, output_root, public_url_prefix, font_dir, dry_run)`
returning the JSON manifest (`ok`, `object_type`, `job_slug`, `inputs`, `derived`, `files`).
`validate_inputs()` owns every dimensional rule and `derive_dimensions()` every formula — do
**not** re-encode those numbers in JS; `PART_QUANTITIES_BY_TYPE` in `utils/ecojoinerGenerator.js`
is the one deliberate mirror (for the confirmation screen) and must be kept equal.

Flow:

| Piece | Role |
|---|---|
| `public/js/ecojoiner-generate.js` | inline field validation, type cards, POST validate → preview → POST generate → downloads |
| `routes/api/ecojoiner.js` | `POST /api/ecojoiner/validate` (dry run) and `/generate`, both rate-limited via `middleware/rateLimit.js` |
| `controllers/ecojoinerController.js` | thin wrapper; validation failures answer `422` with `errors[]` |
| `utils/ecojoinerGenerator.js` | one `map*Fields` per `ecojoinerType` → snake_case inputs, `execFile` invocation, path containment |
| `utils/ecojoinerCleanup.js` | deletes job folders (`ecojoiner_*`, `backfin_*`, `ballast_*`, `sails_*`) older than `ECOJOINER_JOB_TTL_DAYS` |

Field mapping worth remembering: the form's **volume is in millilitres** and is divided by 1000;
bottle **diameter** becomes `port_height` for 6FC and `bottle_diameter` for the others; the
**top tapper** becomes `taper_height` (port length = taper + 20 mm allowance, the same rule as
upstream `p_port_length()` since v1.7.2); the DXF checkbox produces a real 1:1 DXF via each object's `write_dxf()`
(pure Python, `ezdxf` — no OpenSCAD CLI dependency).

**Legacy names that intentionally stay** (public URLs, deployed `.env`, DB columns):
`/api/ecojoiner/*`, `public/ecojoiner_exports` + `/ecojoiner_exports`, the `ECOJOINER_*` env
vars, `config.ecojoiner`, the `utils/ecojoiner*.js` module names, `ecojoiner_designs_tb` and
the `ecojoiner_` job-slug prefix of the 6FC object. Only the source directory and the npm script
were renamed.

**Backlog (low priority): STL export.** Not yet implemented. Harder than DXF was: STL needs an
actual watertight solid per part — outer profile with holes subtracted, extruded to board
thickness, triangulated. Preferred approach: pure Python via `shapely` + `trimesh`, not the
OpenSCAD CLI (not installed on this server, not worth a system dependency for this).

Safety rules: user values are passed only inside a temp JSON file (`--json`), never as argv, and
never through a shell. Output is confined to `public/ecojoiner_exports/<jobSlug>/` (served at
`/ecojoiner_exports`); the trusted `generator/` source directory is never a write target.

## Contributions, Commissioning & OpenBooks

Beyond mission/turtle/bottle logistics, the platform is expanding into the project's financial
side. This is a philosophy commitment as much as a feature: the Hope Turtle Project intends to
run on **radical financial transparency** — every dollar in and out should eventually be visible
to anyone, not just admins. Three user-facing entry points anchor this on `/dashboard` (right-hand
action sidebar, `views/dashboard.ejs`):

1. **Make a Contribution** — a modal (`#contributeDialog`) where a user picks/enters a USD amount
   and hits Contribute. Eventually this redirects to Stripe checkout and records the pledge.
2. **Manifest a Turtle** (`/commission`) — a from-scratch turtle "build your own" flow, styled like
   `/ecojoiners/generate`: the user steps through component panels (hull, power, navigation,
   payload, ...), each with photo/price/description/availability, and commissions a turtle built
   to spec.
3. **Our OpenBooks** (`/openbooks`) — a public ledger page showing every transaction behind the
   project (contributions in, expenses out), in the open. Not gated behind login — this is meant
   to be visible to anyone as an accountability mechanism.

### Current state (placeholder stage)

All three entry points exist today as **UI-only placeholders** — no money moves yet:
- `views/commission.ejs` (route `/commission`, `ensureAuth`) — "coming soon" panel, styled with the
  same `.generate-page` / `.eco-panel` / `.eco-dev-notice` classes as the Ecojoiner generator.
- `views/openbooks.ejs` (route `/openbooks`, public) — "coming soon" notice. The dashboard's
  OpenBooks button (`data-openbooks-notice` in `public/js/dashboard.js`) currently intercepts the
  click and shows `alert('Sorry! Our entire financial system is still in development.')` instead
  of navigating, since there's nothing to show yet — remove that intercept once the ledger is real.
- The Contribute modal's submit handler (`public/js/dashboard.js`) just shows an inline "thanks,
  check back soon" message — no Stripe call, no DB write.

### Schema draft: `sql/migrations/20260731_commissioning_transactions.sql`

The tables below are **drafted, not yet applied** — the migration is written but hasn't been run
against `hopeturtle_db`, and no model/controller code reads or writes them yet. `/commission`
still runs entirely on the hardcoded sample data in `views/commission.ejs` /
`public/js/commission.js` (foodstuffs, engraving messages, turtle types, add-on pricing).

- **`components_tb`** — single catalog for everything a turtle can be built from, distinguished by
  `category` (`turtle_base`, `foodstuff`, `electronics_addon`, `engraving`) with a stable
  `key_name` slug per category. Foodstuffs were deliberately **not** split into their own
  `foodstuffs_tb` — they're structurally identical to the other buildable options (photo, price,
  description, availability), so one table keeps catalog/admin logic in one place. The migration
  seeds it with the exact sample options + ballpark prices currently hardcoded in the commission
  page, so swapping the front end from mock data to a real query should be a drop-in change.
- **`commissions_tb`** — one row per user's saved/submitted turtle build (backs both the "Save"
  and "Commission" buttons on `/commission`). Header row only — mission, deployment type, turtle
  base component, engraving component, status (`draft` → `submitted` → `in_production` →
  `fulfilled`/`cancelled`), and a snapshotted cost estimate. Links to `turtles_tb.turtle_id` once
  the build is actually launched.
- **`commission_items_tb`** — line items against `components_tb` for a commission's foodstuff
  picks (one row per food bottle, via `bottle_slot`) and electronics add-ons (`bottle_slot` NULL).
  Kept as real rows rather than a JSON column so per-component reporting (e.g. "how many coffee
  bottles shipped this month") stays a plain query.
- **`transactions_tb`** — the OpenBooks ledger. Every contribution, commission payment, expense,
  and refund is a row here, typed via `type`/`direction`. The FK points from `transactions_tb` to
  `commissions_tb` (not the reverse) since one commission can have several transactions — a
  deposit, a balance payment, a refund.

### What still needs to be built

- **Run the migration** against `hopeturtle_db` and write the corresponding models
  (`models/componentsModel.js`, `models/commissionsModel.js`, `models/transactionsModel.js`) plus
  controllers/routes to read/write them.
- **Stripe integration** — the Contribute modal and the Commission flow both need a real checkout
  session created server-side (never trust a client-supplied amount straight to a charge) and a
  webhook that confirms payment before writing a `completed` row to `transactions_tb`.
- **Wire `/commission` to the catalog** — replace the hardcoded options in `views/commission.ejs` /
  `public/js/commission.js` with a `components_tb` query, and make Save/Commission actually persist
  a `commissions_tb` row (+ `commission_items_tb` lines) instead of the current client-only mockup.
- **OpenBooks real ledger** — `/openbooks` should eventually query `transactions_tb` (filtered to
  `is_public = 1`, donor identity anonymized at the display layer) and render a genuinely public,
  filterable transaction list — this is the accountability payoff of the whole feature, so don't
  let it regress back to a placeholder once the table exists.



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
ECOJOINER_PYTHON=          # optional; defaults to generator/.venv/bin/python3
ECOJOINER_JOB_TTL_DAYS=7
ECOJOINER_TIMEOUT_MS=30000
```
