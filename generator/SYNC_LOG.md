# Generator ⇄ turtle_body sync log

One entry per upstream change that affects a generator. Append at the top. An agent working in
turtle_body that changes `lib/params.scad` or a wooden-component lib module and does **not**
update the generator in the same task must add an `open` entry here (see turtle_body
`CLAUDE.md` §19). Close an entry by changing its status and naming the commit that synced it.

Format: `- YYYY-MM-DD · turtle_body vX.Y.Z · <component> · <what changed upstream> · status: open | synced (<commit>)`

## Entries

- 2026-09-08 · v1.8.0 · Rear fin · `src/Full_Turtle.scad` gained a genuine cross-check assert for the shaft/John M6 hole alignment (Y axis); no dimension changed, geometry confirmed already correct. No generator change needed · status: synced (turtle_body v1.8.0)
- 2026-09-08 · v1.7.1 · Sails · SVG/DXF/PDF carpenter-sheet writers still missing (SCAD only). SYNC_PLAN S-3 (remainder) · status: open
- 2026-09-08 · v1.7.1 · 6FC Ecojoiner · `six_fc.py` predated the lib contract: Master John + 5 Little Johns, cap 32, collar 32, port height 85, screw 4.5 (lib: 6 Little Johns, 31, 34, 82, Ø6.4). SYNC_PLAN S-4 · status: synced (hand-fixed directly, `objects/six_fc.py` renamed `objects/ecojoiner_6fc.py` + `generate_exports.py` + `PART_QUANTITIES_BY_TYPE['6fc']` + 10 locale files; object_type/job-slug unchanged)
- 2026-09-08 · v1.7.2 · Ecojoiner + Ballast · **upstream fix, reverse direction**: lib's `p_port_length()` was a constant 82; now `p_top_dome_h() + p_port_allowance()`, matching the generators' `taper_height + port_allowance`. No generator change needed · status: synced (turtle_body v1.7.2)
- 2026-09-08 · v1.7.1 · Ballast · defaults 15/320/35 (lib 12/305/31); slat height 4.5·t (lib 6·t); core slat had no M6 mount hole at all; shoulder position used port_length instead of bottle_diameter (latent bug). SYNC_PLAN S-2 · status: synced (hand-fixed directly, `bottom_ballast_fin_generator.py` + `objects/ballast.py`; `bottom_fin_raw.py` deleted)
- 2026-09-08 · v1.7.1 · Rear fin · `shaft_hole_diameter` 6.0 (lib 6.4); `shaft_hole_from_front` 50 (lib TB-07 formula = 103, now derived not fixed). SYNC_PLAN S-1 · status: synced (hand-fixed directly, `back_fin_generator.py` + `objects/back_fin.py`)
- 2026-09-08 · v1.7.1 · Sails · bottle diameter (+ cap/collar/dome) hardcoded, form values not applied even though `sail_apparatus()` already accepted them. SYNC_PLAN S-3 (drift portion) · status: synced (hand-fixed directly, `generate_sails.py` + `objects/sails.py` + `mapSailsFields`)
