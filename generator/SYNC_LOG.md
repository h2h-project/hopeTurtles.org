# Generator ⇄ turtle_body sync log

One entry per upstream change that affects a generator. Append at the top. An agent working in
turtle_body that changes `lib/params.scad` or a wooden-component lib module and does **not**
update the generator in the same task must add an `open` entry here (see turtle_body
`CLAUDE.md` §19). Close an entry by changing its status and naming the commit that synced it.

Format: `- YYYY-MM-DD · turtle_body vX.Y.Z · <component> · <what changed upstream> · status: open | synced (<commit>)`

## Entries

- 2026-09-08 · v1.8.1 · 6FC Ecojoiner · **upstream lift, reverse direction**: the v1.7.1 6FC sync (below) had also deleted the **Master John** — one of the six cross-slats, cut with deeper top slots (`master_slot_depth = min(floor(port_height/2), floor(john_height·0.6))`) so it can be dropped in last, past the already-seated Johns of the almost-closed frame. That was wrong: the Master John is a real assembly feature the generator had always carried and lib merely lacked. Lifted the rule into `lib/ecojoiner.scad` (`eco_master_slot_depth()`, `eco_master_john_2d()`, `eco_master_john()`; `eco_ecojoiner_only()` flags one of its three rectangles) and restored the generator side. Part list back to Long ×6 + Little ×5 + Master ×1 + Final Key ×4 + Presser ×12 · status: synced (turtle_body v1.8.1 + `objects/ecojoiner_6fc.py` restored from `0cb0de8^` with the v1.7.1 param changes kept, `PART_QUANTITIES_BY_TYPE['6fc']`, `gen_part_master_john` locale key)
- 2026-09-08 · v1.8.0 · Rear fin · `src/Full_Turtle.scad` gained a genuine cross-check assert for the shaft/John M6 hole alignment (Y axis); no dimension changed, geometry confirmed already correct. No generator change needed · status: synced (turtle_body v1.8.0)
- 2026-09-08 · v1.7.1 · Sails · SVG/DXF/PDF carpenter-sheet writers added for all 7 part shapes (were missing, SCAD only); every outline verified against real OpenSCAD-rendered bounding boxes. SYNC_PLAN S-3 (remainder) · status: synced (hand-fixed directly, `objects/sails.py` + `mapSailsFields` + `public/js/ecojoiner-generate.js`)
- 2026-09-08 · v1.7.1 · 6FC Ecojoiner · `six_fc.py` predated the lib contract: Master John + 5 Little Johns, cap 32, collar 32, port height 85, screw 4.5 (lib: 6 Little Johns, 31, 34, 82, Ø6.4). SYNC_PLAN S-4 · status: synced (hand-fixed directly, `objects/six_fc.py` renamed `objects/ecojoiner_6fc.py` + `generate_exports.py` + `PART_QUANTITIES_BY_TYPE['6fc']` + 10 locale files; object_type/job-slug unchanged)
- 2026-09-08 · v1.7.2 · Ecojoiner + Ballast · **upstream fix, reverse direction**: lib's `p_port_length()` was a constant 82; now `p_top_dome_h() + p_port_allowance()`, matching the generators' `taper_height + port_allowance`. No generator change needed · status: synced (turtle_body v1.7.2)
- 2026-09-08 · v1.7.1 · Ballast · defaults 15/320/35 (lib 12/305/31); slat height 4.5·t (lib 6·t); core slat had no M6 mount hole at all; shoulder position used port_length instead of bottle_diameter (latent bug). SYNC_PLAN S-2 · status: synced (hand-fixed directly, `bottom_ballast_fin_generator.py` + `objects/ballast.py`; `bottom_fin_raw.py` deleted)
- 2026-09-08 · v1.7.1 · Rear fin · `shaft_hole_diameter` 6.0 (lib 6.4); `shaft_hole_from_front` 50 (lib TB-07 formula = 103, now derived not fixed). SYNC_PLAN S-1 · status: synced (hand-fixed directly, `back_fin_generator.py` + `objects/back_fin.py`)
- 2026-09-08 · v1.7.1 · Sails · bottle diameter (+ cap/collar/dome) hardcoded, form values not applied even though `sail_apparatus()` already accepted them. SYNC_PLAN S-3 (drift portion) · status: synced (hand-fixed directly, `generate_sails.py` + `objects/sails.py` + `mapSailsFields`)
