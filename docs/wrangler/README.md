# Turtle Wrangler — development plan

Turtle Wrangler is an Android app that talks to a turtle directly over
Bluetooth Low Energy (BLE) from a few metres away — a full-screen
replacement for standing over the hull clicking through the OLED carousel
(`device/src/ui/flows.py`) one gesture at a time. It does **not** replace
the shore telemetry pipeline to `hopeturtles.org`; that keeps running
exactly as it does today. Wrangler is a near-field field-ops and
diagnostics tool, not a remote-control link — the turtle still closes its
own navigation loop onboard regardless of whether a phone is anywhere
nearby.

For the non-technical, stakeholder-facing version of this pitch (why it's
worth building, what it looks like, no acronyms), see the proposal
circulated separately to the team. This folder is the engineering plan
that sits underneath it.

The work splits into two independent streams that meet at one shared
contract:

- **[01_firmware_ble.md](01_firmware_ble.md)** — the turtleOS side: a new
  BLE peripheral role on the XIAO ESP32-S3, built in phases alongside the
  existing WiFi telemetry client rather than replacing anything.
- **[02_android_app.md](02_android_app.md)** — the Wrangler app itself:
  scan/connect, then the four screens (Dashboard, Navigate, Diagnostics,
  Settings) sketched during design.

Both streams build against the GATT contract below. **Treat it as the
interface boundary** — either side can iterate on its own implementation
freely as long as the wire format doesn't drift out from under the other.
If a characteristic's shape needs to change, update it here first.

---

## The GATT contract

Custom 128-bit UUIDs, short form shown (`6f5a00xx-0000-1000-8000-00805f9b34fb`).
All multi-byte fields are little-endian, matching MicroPython's default
`struct` packing — the Android side must set
`ByteBuffer.order(ByteOrder.LITTLE_ENDIAN)` to match.

### Telemetry service — `6f5a0001` (notify + read)

| Characteristic | UUID | Format | Bytes | Firmware source |
|---|---|---|---|---|
| Position | `6f5a0011` | `<ii BB>` lat_e7, lon_e7, sats, fix_type | 10 | `src/nav/gpsfix.py` |
| Heading/nav | `6f5a0012` | `<HHh>` heading×10, bearing_to_dest×10, xte×10 | 6 | `src/nav/heading.py`, `src/nav/bearing.py` |
| Sail | `6f5a0013` | `<hhB>` servo_angle×10, wind_angle×10, confidence% | 5 | `src/ui/screens/servo.py`, `src/nav/luff.py` |
| Power | `6f5a0014` | `<Hhb>` voltage_mV, current_mA, soc% | 5 | `src/drivers/ina219.py` |
| IMU | `6f5a0015` | `<hh>` pitch×10, roll×10 | 4 | `src/drivers/gy87.py` |
| Status flags | `6f5a0016` | `<B>` bit0 wifi_ok · bit1 api_ok · bit2 gps_fixed · bit3 journey_active · bit4 telemetry_enabled | 1 | `src/app/main.py` status dict |
| Shore sync meta | `6f5a0017` | `<II>` last_shore_sync_epoch, journey_id (0=none) | 8 | `src/app/telemetry_state.py`, `src/app/journey.py` |

### Command service — `6f5a0002` (write)

| Characteristic | UUID | Format | Effect |
|---|---|---|---|
| Set destination | `6f5a0021` | `<ii>` lat_e7, lon_e7 | writes `set_destination`, mirrors the Destination screen's here-stamp |
| Journey control | `6f5a0022` | `<B>` 0=end, 1=start | drives `src/app/journey.py` open/close |
| Servo sweep trigger | `6f5a0023` | `<B>` any nonzero | runs `src/ui/screens/wind_finder.py`'s luff sweep |
| WiFi SSID | `6f5a0024` | UTF-8 string | staged, not applied |
| WiFi password | `6f5a0025` | UTF-8 string | staged, not applied |
| WiFi apply | `6f5a0026` | `<B>` any nonzero | commits staged SSID/password to `config.json`, reconnects |
| Telemetry interval | `6f5a0027` | `<H>` seconds | writes `telemetry_post_every_s` (min 10, per existing config rule) |

### Device Information service — `0x180A` (standard, read-only)

Bluetooth SIG standard service, not custom — Manufacturer Name String,
Firmware Revision String, Serial Number String. Reused instead of
reinvented so any generic BLE scanner (and Android's own APIs) can read it
without knowing anything about turtleOS.

### Open question carried into Phase 6 of both plans

The command service can move a turtle's destination or push new WiFi
credentials mid-deployment. Neither is high-stakes on its own, but both
deserve BLE bonding/pairing rather than an open connection — cheap to add
now, disruptive to retrofit once the app is in daily field use. Firmware
Phase 6 and App Phase 6 both carry a task for this; they must land
together, since a bonded peripheral needs a bonding-aware central.

---

## Visual identity

Wrangler's palette and type are pulled directly from `hopeturtles.org`
(`public/css/main.css`'s `:root` block and `views/partials/header.ejs`'s
font `<link>`), not invented fresh — the app should read as the same
project as the shore dashboard, not a separate product. `wrangler.html`
in this folder is the reference implementation; treat it as the source of
truth once Part 2 gets to a real Android theme, not this table in
isolation.

| Role | Token | Hex | Notes |
|---|---|---|---|
| Primary | `--color-primary` | `#017919` | Buttons, links, active states |
| Accent | `--color-accent` | `#23b053` | Secondary green, lighter emphasis |
| Dark | `--color-dark` | `#1f3b22` | Hero/header backgrounds, heading text |
| Light | `--color-light` | `#c0e3cb` | Tints on dark backgrounds |
| Background | `--color-background` | `#f2f9f3` | Alternating section backgrounds |
| Text | `--color-text` | `#1f2521` | Body copy |
| Text muted | `--color-text-muted` | `#6b7280` | Grey — captions, secondary copy |
| Pink | `--color-pink` | `#ec8fc0` | Ghost-button borders/text, single points of emphasis |
| Pink (dark) | `--color-pink-dark` | `#b8508e` | Text on pink-tinted backgrounds |
| Pink (tint) | `--color-pink-tint` | `#fdf1f8` | Light pink fills — pills, badges, ghost-button fills |

**Pink is a spotlight, not a workhorse color** — this mirrors how
`hopeturtles.org` itself uses its fuchsia accent: the site's `:root`
palette is overwhelmingly green, and its one bright fuchsia value
(`#ff00ff`) appears exactly once, as the hover state on the commission
page's single master call-to-action button (`main.css`,
`[data-commission-submit]:hover`). Wrangler uses a softer, lighter pink
throughout rather than that literal hex — easier to read as body text and
borders — but keeps the same restraint: at most one pink element per
screen, and on the app mockups pink never appears as a solid filled
object. It's always a ghost button (white/transparent fill, pink border
and text) or a light tint fill, never a saturated block — the ink should
read as an accent outline, not a shout. If a screen has more than one
pink element, or a pink element with a solid saturated fill, that's a
signal something drifted from this convention, not a reason to add more.

**Typography**: `Aleo` (headings) paired with `Mulish` (body), loaded
from the same Google Fonts request the main site uses:
```
https://fonts.googleapis.com/css2?family=Aleo:wght@400;700&family=Mulish:wght@300;400;500;600&display=swap
```
Fallback stacks match the site's own tokens —
`"Aleo", Georgia, "Times New Roman", serif` for headings,
`"Mulish", "Helvetica Neue", Arial, sans-serif` for body — so a slow or
missing font load degrades the same way on Wrangler as it does on
hopeturtles.org.

When Part 2 reaches a real Android theme (Compose `MaterialTheme` /
`colors.xml`), this table is what gets ported over — the six-color roles
map cleanly onto Material's primary/secondary/background/surface/on-*
slots, with fuchsia reserved for a single accent color, used the same
sparingly.
