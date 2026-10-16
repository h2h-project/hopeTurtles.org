# Turtle Wrangler docs — moved to turtleOS

The Wrangler engineering docs live in the **turtleOS** repo, next to the
firmware and the Bluetooth contract they define:

- `turtleOS/docs/wrangler/` (on this machine: `~/PycharmProjects/turtleOS/docs/wrangler/`)
- https://github.com/h2h-project/turtleOS/tree/main/docs/wrangler

| File | What |
|---|---|
| `README.md` | The GATT contract (the source of truth for the Bluetooth wire format) |
| `01_firmware_ble.md` | Firmware plan |
| `02_android_app.md` | Android app plan |
| `03_v2_plan.md` | Turtle data model v2: one set of names for Bluetooth, telemetry JSON and the app API |

Edit them there, not here. This server repo keeps only the stakeholder
proposal, `vision.html` (also served at `/wrangler/vision.html` from
`public/wrangler/`).

The server's side of the shared data (telemetry ingest, the planned app
API) follows the turtleOS data dictionary. See `CLAUDE.md` → "Battery
current sign" for the one rule most easily got wrong.
