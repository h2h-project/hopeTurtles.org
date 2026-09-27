# Part 1 — turtleOS firmware: BLE peripheral

This is the turtle-side half of Turtle Wrangler. It adds a BLE GATT
peripheral role to turtleOS — the XIAO ESP32-S3 advertises, a phone
connects, telemetry flows out as notifications, commands flow in as
writes. Nothing about the existing WiFi telemetry pipeline
(`src/net/telemetry_client.py`, `src/app/telemetry_scheduler.py`) changes;
BLE is an additional, independent interface, not a replacement for it.

See [README.md](README.md) for the GATT characteristic table this plan
builds against — that table is the contract; this document is the build
order.

There is currently **no Bluetooth code anywhere in the tree** — this is
new ground, not an extension of an existing module. `device/src/net/`
today holds only outbound HTTP clients (`urequests.py`-based); nothing
listens for inbound connections of any kind.

---

## Phase 0 — feasibility spike (no app-visible output)

Before committing to the phased build below, two things need to be
confirmed on real hardware, because either one failing changes the plan:

1. **BLE stack availability on the current build.** Confirm the
   MicroPython firmware actually deployed to the XIAO
   (`resources/ESP32_GENERIC_S3-SPIRAM_OCT-*.bin`) has `bluetooth` module
   support compiled in, and check whether `aioble` (the coroutine-based
   wrapper most current MicroPython BLE examples use) is vendored or
   needs installing via `mip`. If it's missing, decide between installing
   it into `src/lib/` (matching how `urequests.py` is already vendored)
   or writing directly against the lower-level `bluetooth` module.
2. **WiFi/BLE radio coexistence.** The ESP32-S3 has one 2.4 GHz radio
   shared between WiFi and BLE — the two are time-multiplexed, not
   simultaneous. Run a turtle with WiFi telemetry active
   (`telemetry_post_every_s` at its normal interval) *and* a BLE
   connection open at the same time, and measure whether telemetry POST
   latency or the offline-queue drain rate degrades. This determines
   whether Phase 1 onward needs any coexistence throttling (e.g. pausing
   BLE advertising during a telemetry POST) or whether it's a non-issue
   in practice.

Deliverable: a short go/no-go note appended to this file, not code. If
coexistence turns out to be a real problem, it reshapes Phase 1's
architecture, so this has to resolve first.

---

## Phase 1 — peripheral skeleton

Get a turtle advertising and accepting a connection, with no real data
yet — proves the plumbing before wiring in sensors.

- New module: `device/src/net/ble_service.py`. Owns the peripheral
  lifecycle (advertise, accept connection, track connected/disconnected
  state) and exposes a non-blocking `tick()` — same shape as
  `telemetry_scheduler.tick()`, called from the main loop, never
  blocking.
- Advertise the Telemetry service UUID (`6f5a0001`) so `TurtleScanner` on
  the Android side (Part 2, Phase 1) can filter on it without a name
  match.
- Wire `ble.tick()` into `src/app/main.py`'s `run()` loop alongside the
  existing `telemetry_scheduler.tick(...)` call — same iteration, no new
  blocking point.
- Build the `BleService` instance in `step_init_runtime()`
  (`device/main.py`, boot step 8) next to where `wifi_manager`,
  `nav_controller`, and the rest of the runtime objects are already
  constructed, so `run()` receives it as a kwarg the same way it receives
  `imu` — consistent with gotcha #18 (inject, don't re-probe).
- No characteristics with real data yet. Connect/disconnect only, visible
  via a generic BLE scanner app (nRF Connect or similar) — no need to
  wait for the Android app to exist to validate this phase.

---

## Phase 2 — telemetry characteristics (read-only)

Wire the seven Telemetry service characteristics from the GATT table to
the runtime objects that already hold this data — nothing here computes
anything new, it packs existing state into `struct` and notifies.

| Characteristic | Reads from |
|---|---|
| Position | `src/nav/gpsfix.py` published fix |
| Heading/nav | `nav_controller`'s `HeadingSource` + active waypoint bearing |
| Sail | `AS5600` sail-angle encoder + last `wind_finder.py` sweep result |
| Power | the shared `ina_dev` (INA219) |
| IMU | the single `_rt_imu` (`GY87`) instance — do not re-probe |
| Status flags | the `status` dict already maintained in `run()` |
| Shore sync meta | `telemetry_state.py`'s last-successful-POST timestamp, `journey.py`'s active journey id |

Notify on change or on a minimum interval, not continuously — matches the
"energy-conservative" posture the rest of the firmware already takes
around telemetry and screen redraws. Exact thresholds (e.g. notify
Position only on a new GPS epoch, Power on >1% SoC change) are a tuning
pass once this is working end-to-end, not a blocker to landing the phase.

---

## Phase 3 — command service: navigation

The three commands that only touch state the firmware already knows how
to write safely:

- **Set destination** (`6f5a0021`) → `config.save_config()` with
  `set_destination`, same path the Destination screen's here-stamp uses.
- **Journey control** (`6f5a0022`) → `src/app/journey.py` `open()` /
  `close()`, same as the Journey screen's toggle.
- **Servo sweep trigger** (`6f5a0023`) → the same entrypoint
  `ServoScreen`'s double-click drives into `wind_finder.py`. The result
  surfaces back through the Phase 2 Sail characteristic — no separate
  "sweep result" characteristic needed.

Each of these already has an existing, tested call path from the OLED UI;
this phase is about calling that same path from a BLE write handler, not
inventing new logic.

---

## Phase 4 — command service: WiFi and telemetry config

Higher-stakes than Phase 3 because these commands mutate connectivity
config, not just navigation state:

- **WiFi SSID / password / apply** (`6f5a0024`–`0026`) — stage SSID and
  password from separate writes (BLE MTU means a long password may not
  fit in one packet without a negotiated MTU — see Part 2, Phase 1 for
  the Android-side MTU request), then commit both to `config.json` and
  trigger a reconnect on the `apply` write. Mirrors what the WiFi screen
  already does on a double-click toggle, just via BLE instead of the
  button.
- **Telemetry interval** (`6f5a0027`) → `telemetry_post_every_s`, same
  10-second floor the config loader already enforces.

This phase is where Phase 0's coexistence finding matters most — pushing
new WiFi credentials over BLE while WiFi itself is mid-reconnect is
exactly the scenario worth deliberately testing, not just hoping works.

---

## Phase 5 — device information service

Add the standard `0x180A` service — Manufacturer Name, Firmware Revision,
Serial Number — as static read-only characteristics. Firmware revision
can pull from wherever the codebase already tracks a version string (or a
new constant if it doesn't yet); serial number from `device_id`. This is
a small, low-risk phase deliberately sequenced after the harder command
work, not before it — nothing else depends on it.

---

## Phase 6 — hardening and field readiness

- **Bonding/pairing.** The command service can redirect a turtle or hand
  it new WiFi credentials — add BLE bonding (`aioble` supports this) so
  an unpaired phone can read telemetry but not write commands. Must land
  together with Part 2's Phase 6 (a bonded peripheral needs a
  bonding-aware central) — coordinate the two before shipping either
  side.
- **Reconnection behavior.** Decide what the peripheral does across a
  dropped connection — keep advertising, or require the app to re-scan.
- **Coexistence under real load.** Re-run the Phase 0 WiFi+BLE test, this
  time with the full characteristic set active and a phone actually
  polling, not a synthetic connection.
- **Error handling for malformed writes.** A write of the wrong length to
  Set destination or Telemetry interval should be rejected, not crash the
  GATT handler mid-connection.
- **Docs.** Fold the finished module into `CLAUDE.md`'s repository layout
  and key-file-locations tables once the shape has settled — premature
  before then, since Phases 1–5 will likely still be moving the file
  layout around inside `src/net/`.

---

## Out of scope for this plan

- Turtle-to-turtle BLE (that's the bale mesh vision in
  `docs/bale_network_vision.md` — a different radio problem at a
  different range).
- Over-the-air firmware updates via BLE. Not requested, meaningfully
  larger scope, and the existing `mpremote`/sync-script deploy path
  already works.
- Removing or changing anything in the WiFi telemetry pipeline. Wrangler
  is additive.
