# Part 2 — Turtle Wrangler Android app

This is the phone-side half of Turtle Wrangler — a new Android app, built
from scratch, that scans for a turtle over BLE and presents the four
screens sketched during design: Dashboard, Navigate, Diagnostics,
Settings. It builds against the GATT contract in
[README.md](README.md); the phases below assume that contract is stable,
but early phases here can develop in parallel with the firmware side —
Phase 1 only needs *a* BLE peripheral advertising the right service UUID
to test against, not the finished firmware.

Recommended stack: **Kotlin + Jetpack Compose**, MVVM — a
`StateFlow<TurtleTelemetry>` feeding straight into composables matches
the tab-switching, card-based layout already sketched, and avoids
hand-rolling view lifecycle management around a connection that's
constantly emitting updates.

---

## Phase 0 — decisions to make before scaffolding

Two open questions worth settling before Phase 1, since they shape the
project setup:

- **Map provider for the Navigate screen's destination picker.** Google
  Maps SDK is the default choice but pulls in Google Play Services — a
  dependency worth questioning for a field tool that may be used in
  low-connectivity or Play-Services-restricted environments. MapLibre
  (open-source, no Play Services dependency) is the likely alternative.
  Decide before Phase 3, since retrofitting the map widget later touches
  every screen that references a coordinate.
- **Distribution.** Internal tool, not a public release — sideloaded APK
  via a direct build, or an internal track (Play Console's internal
  testing, or a simple hosted APK) rather than a public Play Store
  listing. Affects signing setup in Phase 0's scaffold.

---

## Phase 1 — project scaffold and BLE core

- New Android Studio project, Kotlin, Jetpack Compose. `minSdk` choice
  matters for the permission model: Android 12 (API 31) split
  `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` out of the old
  `ACCESS_FINE_LOCATION`-gated model — decide whether to support
  pre-Android-12 devices (extra permission-handling branch) or set
  `minSdk = 31` and skip that entirely. Given this is an internal tool
  with a small, controllable device fleet, `minSdk = 31` is the simpler
  default unless a specific older phone needs supporting.
- `TurtleUuids` object, `TurtleScanner` (filtered `BluetoothLeScanner` on
  the Telemetry service UUID, `neverForLocation` scan flag), and
  `TurtleConnection` (the `BluetoothGatt` wrapper exposing
  `StateFlow<TurtleTelemetry>` and `StateFlow<ConnectionState>`) — the
  skeleton for these already exists from design sketches and can be
  dropped in largely as-is.
- **Serial GATT operation queue.** Android's `BluetoothGatt` allows
  exactly one outstanding operation at a time — a second
  `writeCharacteristic` call before the previous one's callback fires
  silently fails. Every later phase that writes more than one
  characteristic in sequence (WiFi push in Phase 5 is the worst case:
  three writes back to back) depends on this queue existing first. Build
  it here, not when Phase 5 hits the bug.
- MTU negotiation (`requestMtu(185)`) on connect, so later long writes
  (WiFi password) don't require the three-characteristic split to be load
  bearing on every phone — belt and suspenders with the split itself.
- Connect/scan screen: device list, connection state (scanning →
  connecting → connected → disconnected), manual retry.

Deliverable: an app that finds a turtle (or a Phase-1 firmware stub),
connects, and shows "Connected" — no real telemetry rendering yet.

---

## Phase 2 — Dashboard screen

- Decode the seven Telemetry characteristics into `TurtleTelemetry`
  (binary `ByteBuffer` parsing, little-endian — matches the firmware's
  `struct` packing from the GATT contract).
- Wire the Dashboard composable to the live `StateFlow` — heading, bearing
  and cross-track, battery, sail angle, GPS fix, distance to target.
- **Shore-sync fallback.** When not BLE-connected, the Dashboard shouldn't
  just go blank — fall back to the last value from `GET /v1/device` /
  `/v1/telemetry` on `hopeturtles.org` (the existing REST API, unrelated
  to BLE) and label it clearly as "last known" rather than live. This is
  a separate, ordinary HTTP client sub-track, not part of the BLE work —
  can be built independently and merged into the Dashboard screen
  whenever convenient.

---

## Phase 3 — Navigate screen

- Destination picker using the Phase 0 map choice; "set here" (device's
  current GPS) and "use mission target" (mirrors the OLED Destination
  screen's menu) both write to the Set destination characteristic.
- Journey start/end button wired to the Journey control characteristic,
  reflecting `journeyActive` from the Status flags characteristic for its
  current state.
- Cross-track error gauge from the Heading/nav characteristic.

---

## Phase 4 — Diagnostics screen

- Servo sweep trigger button → writes Servo sweep trigger; result
  (wind angle, confidence) reads back through the existing Sail
  characteristic notification — no extra plumbing needed here, this
  phase is mostly UI.
- Sensor health checklist decoded from the Status flags characteristic
  (and, if useful, presence/absence of recent notifications per
  characteristic as a lightweight liveness signal).

---

## Phase 5 — Settings screen

- WiFi push flow: SSID field → Password field → Apply button, issued
  through the Phase 1 operation queue as three sequential writes.
- Telemetry interval slider (10s floor, matching firmware's enforced
  minimum) writing to the Telemetry interval characteristic.
- Device Information read (firmware revision, serial number) from the
  standard `0x180A` service — simple one-time read on connect, no queue
  concerns since these aren't notify characteristics.

---

## Phase 6 — resilience, polish, and bonding

- Auto-reconnect with backoff on unexpected disconnect (distinct from a
  user-initiated disconnect, which shouldn't auto-retry).
- **Bonding/pairing UX.** Must land together with turtleOS firmware
  Phase 6 — once the peripheral requires bonding to accept writes, the
  app needs the matching pairing flow (Android's system pairing dialog,
  triggered on first command write to a new device). Coordinate the two
  before shipping either side; a firmware update that starts requiring
  bonding will silently break command writes from an app that doesn't
  expect it.
- Empty/error states: no turtles found, connection dropped mid-write,
  malformed data from an unexpected firmware version.
- Branding pass matching the proposal's visual language (same palette,
  same four-tab structure already validated with stakeholders).
- No persistent foreground service planned for v1 — the near-field,
  stand-next-to-the-turtle use case doesn't need BLE to survive the app
  being backgrounded. Revisit only if a real use case for
  background-connected monitoring shows up.

---

## Phase 7 — field testing and release

- Pair Phase 6 of both plans on real hardware — first end-to-end test of
  bonded connect, full command set, and reconnection behavior together.
- Internal distribution per the Phase 0 decision.
- Feed field issues back into whichever side (firmware or app) they
  actually belong to — most will be one or the other, not both, once the
  GATT contract has held steady through Phase 6.

---

## Out of scope for v1

- iOS. Not requested; BLE central APIs differ enough (Core Bluetooth)
  that it would be close to a separate app, not a port.
- Ubuntu Touch. Raised early in scoping this project and deprioritized —
  UBports' Qt Bluetooth / BlueZ D-Bus BLE support is thinner and less
  documented than Android's, and there's no near-term need driving it.
- Offline map tile caching. Useful for genuinely remote deployments, but
  adds real scope to Phase 3 — worth a follow-up pass once the core app
  is in the field, not before.
- Multi-turtle fleet view. Wrangler as designed connects to one turtle at
  a time; managing a fleet from one screen is a different app.
