# July 2026 — Task Queue

Work identified but not yet started. Each entry states the problem, why the current
schema/code can't express it, and the shape of the fix....

---

## 1. Schema: track successfully found bottles

**Status:** agreed, not started.

**Problem:** There is no way to record *which bottle* was recovered. `success_tb` links a
find to a `turtle_id` only (`hopeturtle_schema_v1.1.sql:152`, unchanged in
`docs/hopeturtles_db_v1.3.sql:214`) — there is no `bottle_id` FK. And `bottles_tb` has no
lifecycle state: its only status-ish column is `verified TINYINT(1)`, which means "packing
was verified," not "the bottle was found."

**Consequences today:**

- Cannot answer "which of turtle 12's bottles are still aboard vs. recovered."
- `SELECT COUNT(*) FROM bottles_tb WHERE turtle_id = ?` returns *bottles ever assigned*,
  not *bottles currently aboard* — so any `bottle_count` we expose to devices or the UI is
  subtly wrong the moment a bottle is recovered.
- A single find event that recovers several bottles cannot be represented at all.
- `bottles_turtle_fk` is `ON DELETE SET NULL`, so deleting a turtle orphans its bottles to
  `turtle_id = NULL` rather than preserving the historical link.

**Proposed fix (decide between two shapes):**

- **A — FK on `success_tb`:** add `bottle_id BIGINT UNSIGNED NULL` + FK + index. Simple,
  but models one bottle per success row; multi-bottle finds need multiple rows sharing a
  find event.
- **B — join table `success_bottles_tb`:** `(success_id, bottle_id)` composite PK. Handles
  a beachcomber finding a turtle with six bottles as one success event. Preferred if
  multi-bottle recovery is realistic.

Either way, also add lifecycle state to `bottles_tb` so cargo counts are answerable
without joining:

```sql
ALTER TABLE bottles_tb
  ADD COLUMN status ENUM('packed','aboard','recovered','lost')
    NOT NULL DEFAULT 'packed' AFTER verified;
```

Then "bottles currently aboard turtle N" is `WHERE turtle_id = N AND status = 'aboard'`.

**Blocks:** exposing a trustworthy `bottle_count` on the device API (task 2).

---

## 2. Device API: drop the airOS fields (no mode split)

**Status:** DONE 2026-07-24 — option C. No split. One endpoint, hopeturtles fields only.

Shipped: `home_name` → `hub_name`, `room_name` / `community_name` / `timezone_offset_min`
deleted, `bottle_count` added. Verified against turtleOS at `~/PycharmProjects/turtleOS`
before deleting — all four consumers use `.get()` with blank defaults, so missing keys
degrade to empty rather than faulting, and `time.py` already falls back from
`timezone_offset_min` to `tz_offset_min`. No firmware change required.

**Decision:** airOS-mode devices have their own server at `air2.earthen.io` and never call
hopeturtles.org. So there is no second audience to serve: `home_name`, `room_name` and
`community_name` get deleted outright rather than split into a second endpoint. See the
rationale below for what those fields actually were.

**Problem:** `GET /api/v1/device` returns one flat payload serving two unrelated firmware
modes. The airOS-heritage fields (`home_name`, `room_name`, `community_name`) are
meaningless in turtle mode; the turtle fields (mission, and the proposed bottle count) are
meaningless in airOS mode. Every device pays the bytes for both.

**Worse — two of those fields aren't real data in this database:**

| Field | Backed by | Reality |
|---|---|---|
| `home_name` | `hubs_tb.name` | a *hub* (launch site) renamed to "home" for wire compatibility |
| `room_name` | `missions_tb.full_name` | a *mission* renamed to "room"; duplicates `mission_full_name` |
| `community_name` | nothing | hardcoded constant `'Hope Turtles'` in `controllers/deviceApiController.js:9` |

There is no communities table and no rooms table in this schema. `users_tb.community_id`
exists but arrives from Buwana and has no local name to resolve against. So the airOS
vocabulary is a translation layer over hub/mission, plus one literal.

**Resulting response shape** (`ok` kept — firmware may check it explicitly; any 2xx is
treated as success):

```json
{
  "ok": true,
  "device_id": "12",
  "device_name": "Ketut",
  "mission_short_name": "Bali Run",
  "mission_full_name": "Bali → Lombok Aid Run, July 2026",
  "hub_name": "Sanur Launch Hub",
  "time_zone": "Asia/Makassar",
  "tz_offset_min": 480,
  "ts": 1784880000000,
  "server_now": 1784880000
}
```

Notes on the remaining fields:

- `hub_name` replaces `home_name` — same `hubs_tb.name` value, honest name. Keep it: a hub
  is a real hopeturtles entity, unlike "home".
- `timezone_offset_min` is dropped as a duplicate of `tz_offset_min`.
- `ts` (epoch **ms**) and `server_now` (epoch **s**) both stay — `ts` drives sub-second
  RTC drift, `server_now` matches the telemetry endpoints.
- `bottle_count` joins this list once task 1 lands.

**Rollout risk — the one thing to get right.** Removing keys is a breaking change for
firmware already deployed, and a turtle at sea cannot be reflashed. Before deleting
anything, confirm in the turtleOS source how the device-info parser handles a *missing*
key: if it tolerates absence (null/skip), deletion is safe; if it hard-faults or blocks
time sync on a missing `room_name`/`community_name`, a turtle mid-mission could lose RTC
sync. Safe sequence if unverified:

1. Rename `home_name` → `hub_name` but keep `home_name` as an alias for one release.
2. Ship firmware that reads the new names.
3. Delete the legacy keys only once the fleet has confirmed in on the new build.

The turtleOS source is not checked out on this machine — `../turtleAPI` referenced in
`CLAUDE.md` is absent — so this was not verifiable at write time.

---

## 3. Device API: `?compact=1`

**Status:** LIKELY DROPPED — superseded by task 2's decision.

With the airOS fields gone, the full response is already close to what compact mode would
have returned; the remaining savings are ~40 bytes of mission long-name. Not worth a second
code path. Keep the query param *tolerated but ignored* so the firmware that already sends
`?compact=1` doesn't need changing. Revisit only if payload size becomes a real satellite
cost.

Original design, for the record:

turtleOS already sends `?compact=1`; the handler ignores `req.query` entirely, so it is
currently a no-op. Intended behaviour: return a strict *subset* of the full response —
never renamed or restructured — dropping what the device can derive, duplicate, or already
knows from `config.json`:

- drop `room_name` (legacy alias), `timezone_offset_min` (byte-identical duplicate of
  `tz_offset_min`), `community_name` (constant), `mission_full_name` (keep the short
  name), `device_name` and `home_name` (device knows its own name; hub unused on-device)
- keep `ok`, `device_id`, `mission_short_name`, `time_zone`, `tz_offset_min`, `ts`,
  `server_now`

~350 bytes → ~110. Keep both `ts` (epoch **ms**, drives sub-second RTC drift) and
`server_now` (epoch **s**). Accept `compact=1` and `compact=true`; bare `?compact` with an
empty value should *not* count as on — too easy a firmware typo to silently reshape the
response.

If task 2 lands as option A or C, most of the compact win is already gone and this may not
be worth building.

---

## 4. Device API: expose bottle count

**Status:** SHIPPED 2026-07-24, but semantically incomplete until task 1.

Added to `getDeviceInfo` (`models/turtlesModel.js`) as a correlated subquery on the
existing `turtle_id` index — no extra round trip. Exposed as `bottle_count`.

**Caveat that remains open:** this counts bottles *assigned* to the turtle, not bottles
*aboard*. Until task 1 adds lifecycle state, a recovered bottle still counts, so the number
overstates cargo after any successful find. Firmware does not display it yet — nothing
reads `bottle_count` in turtleOS today, so the wrong-after-recovery value is not currently
user-visible. Fix task 1 before putting it on the OLED.
