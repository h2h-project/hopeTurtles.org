# Syncing the turtle generators to `turtle_body/lib/params.scad`

Assessment written 2026-09-08 against turtle_body **v1.7.1** (`lib/params.scad`) and the
generator sources in this directory as they stood after the `ecojoiner/` → `generator/`
rename. Open items are tracked in `SYNC_LOG.md`; this file explains the work and the order.

## Ground rule

`../turtle_body/lib/params.scad` (plus `lib/ecojoiner.scad`, `lib/rear_fin.scad`,
`lib/ballast_fin.scad`, `lib/sail_frame.scad`) is the authoritative geometry. The generators
here are downstream consumers. When a value differs, the generator is wrong.

## Why the drift keeps happening

Every generator carries **three copies** of each formula:

1. the upstream `lib/` module,
2. the generator's embedded SCAD body (`SCAD_BODY` / `SCAD_TEMPLATE` / the 6FC f-string),
3. the generator's Python `derive_dimensions()` that re-derives 2D outlines for SVG/DXF/PDF.

Nothing links them. turtle_body already ships what copy 2 needs: self-contained bundles in
`turtle_body/v1.0 SCADs/*.scad`, each with a customizer block at the top, regenerated from
`lib/` by `build/build.py`. Copy 3 has no mechanical fix; it is what the CLAUDE.md rule guards.

## Current drift (lib wins)

**S-1, S-2, S-3 and S-4 are all done (2026-09-08) — see the "Resolved" entries below and
`SYNC_LOG.md`.** Only S-5 (the automatic sync mechanism) and S-6 (hygiene) remain, both
deliberately deferred. Cap, cage, axle and mold are printed PLA parts with no generator; they
never need syncing.

### Resolved: rear fin, ballast, sails (2026-09-08)

**Rear fin (S-1).** `shaft_hole_diameter` 6.0 → 6.4 (`p_m6_clearance_d()`). `shaft_hole_from_front` was a fixed TUNING default (50); it is now `None` by default, meaning "derive via TB-07" (`default_shaft_hole_from_front()` in `back_fin_generator.py`, reducing to `(2/3)*(fin_board_width−2t) − 25 + bottle_diameter` = 103 at defaults) — still overridable for deliberate testing. `objects/back_fin.py` threads the resolved value through `derive_dimensions()`/SVG/DXF/PDF instead of reading `inputs.shaft_hole_from_front` directly, and the PDF now shows it as a derived dimension.

**Ballast (S-2).** Defaults 15/320/35 → 12/305/31. Slat height `bh−ch+4.5·t` → `bh−ch+6·t` (360 at defaults). **Two things beyond simple constant drift, found while implementing:** (a) the standalone generator's core slat had **no M6 mount hole at all** — the whole bolt-to-Ecojoiner feature was missing from the SCAD, SVG, DXF and PDF outputs; added, matching `lib/ballast_fin.scad bl_mount_hole_*()` exactly (69 mm from top, Ø6.4, centred on the slat width). (b) the slat's shoulder-cut position (`upper_diagonal_start_z`) was computed from `port_length` (the axial insertion depth) instead of `bottle_diameter`/port **height** (the opening the slat passes through) — a latent bug masked only because the two happen to be numerically equal at the reference bottle's defaults (both 82); a non-default taper would have silently mis-cut the shoulder. Fixed to use `bottle_diameter`, matching `lib/ballast_fin.scad bl_upper_diag_start()`. Also fixed `ballast_fin_upper_cut_depth` (bare `bottle_diameter` → `bottle_diameter + wood_thickness`, the "+1 stock thickness so the bottle clears" correction lib already has). `bottom_fin_raw.py` (the orphan, closer-to-lib variant) is now genuinely superseded and was deleted.

**Sails (S-3, complete).** *Dimensions:* `generate_sails.py`'s `sail_apparatus()` module already accepted `bottle_diameter`, `cap_diameter`, `collar_diameter`, `bottle_height`, `cap_height`, `top_dome_height`, `bottom_dome_height` as real SCAD parameters matching lib exactly — the gap was that `build_scad()`'s Python wrapper only ever overrode `wood_thickness`/`side_batten_height`/`cage_mount_hole_diameter` via its `str.replace()` mechanism, leaving every bottle-shape value pinned at the template's hardcoded default regardless of the caller's input. Extended the replace-list and the top-of-template customizer block to cover all seven bottle-shape values; `objects/sails.py`'s `SailsInputs`/`DEFAULTS` now carry them as real form-driven inputs (mirroring what `mapBallastFields` already collects), and `utils/ecojoinerGenerator.js::mapSailsFields` forwards cap/collar/height/capHeight/topTapper/bottomTapper alongside diameter. Verified end to end: a 90 mm bottle_diameter override produces a 540 mm top sail bar (6×90) rather than the old fixed 492.

*2D writers (the remaining S-3 item, now done too):* added SVG/DXF/PDF for all 7 shapes (Top Sail Bar, Sail Batten, Non-sail Batten, Bottom Sail Bar, Joint Strengthener, C End Piece, Sail). Every outline, notch and hole position in `objects/sails.py` was derived algebraically from `generate_sails.py`'s SCAD formulas (`_cage_notch_root_radius()` etc.) and then verified against real OpenSCAD-rendered bounding boxes for `bottom_bars`/`c_end_pieces`/`strengtheners`/`sails`/`sail_batten`/`non_sail_batten`/`top_bar` — every dimension matched exactly, and the batten cage-mount-hole positions (55/87mm from top, 150/118mm from bottom) match CLAUDE.md section 10's independently-documented values exactly too. The PDF needed a genuinely different layout from the other three objects: putting the 492mm top bar in the same shared-scale row as 20mm battens collapsed the scale to near-nothing, so `write_pdf()` groups the 7 shapes into three independent rows (top bar alone; bottom bar + sail; the four small parts), each with its own scale — visually verified by rendering the PDF to PNG and inspecting it. `SUPPORTED_FORMATS` is now `(scad, svg, dxf, pdf)`; the form's fabrication-toggle restriction to 3D-only was removed from `public/js/ecojoiner-generate.js` and `mapSailsFields` now honours all four checkboxes like fin/ballast.

**6FC Ecojoiner (S-4).** Re-based `objects/six_fc.py` (renamed `objects/ecojoiner_6fc.py`) on
`lib/ecojoiner.scad`: `PART_QUANTITIES` is now Long John ×6, Little John ×6 (was ×5 + Master
John ×1, removed entirely), `cap_diameter` 32→31, `collar_diameter` 32→34, `port_height` 85→82,
`screw_diameter` 4.5 (pilot hole)→6.4 (M6 clearance hole, matching how the ballast/rear-fin
actually bolt to the Ecojoiner). `EcojoinerDerived.master_slot_depth` and every
`master_john_2d()`/`master_john()` SCAD module, PDF row, SVG/DXF group and layout slot were
removed rather than repurposed — the sixth John now shares `little_john_2d()`/`standard_slot_depth`
like the other five. The PDF's John-drawing area went from 3 rows to 2 (`n_rows`), gaining more
vertical space per row rather than leaving a blank gap. `presser_source_note` (en/id/tr) no
longer mentions Master John. Front-end: `PART_QUANTITIES_BY_TYPE['6fc']` and the
`gen_dim_slot_depth_master`/`gen_part_master_john` keys removed from all 10 locale files and
the JS fallback dict. Verified end to end at defaults: `john_length` 294, `john_height` 58,
`standard_slot_depth` 29, `presser_diameter` 30, `final_key_length/width` 130/24,
`screw_side_offset` 25 — all match `lib/ecojoiner.scad`'s `eco_*()` functions exactly; all four
formats (SCAD/SVG/DXF/PDF) generate without error and the SCAD parses clean in OpenSCAD. Object
type, job-slug prefix (`ecojoiner_`), and the public API contract are unchanged — only the
Python file/module name changed, per the 2026-09-08 scope decision.

**Corrected 2026-09-08 (turtle_body v1.8.1) — Master John restored.** Removing the Master
John in S-4 was the one wrong call in that pass. The Master John is a real assembly
feature: one of the six cross-slats is fitted *last*, into an almost-closed frame, and
its two top slots must be cut deeper (`master_slot_depth = min(floor(port_height/2),
floor(john_height·0.6))` — 34 vs the standard 29 at reference params) or it physically
cannot be sprung into place. The generator had always carried this rule; `lib/ecojoiner.scad`
simply never modelled it. Per the "lib owns the rule" precedent (port-length case below),
the rule was **lifted upstream**: turtle_body v1.8.1 adds `eco_master_slot_depth()`,
`eco_master_john_2d()`, `eco_master_john()`, and an `is_master`/`master_first_john` flag
threaded from `eco_ecojoiner_only()` through one of its three rectangles (the full-turtle
assembly is untouched). The generator was then restored from `0cb0de8^:ecojoiner/objects/six_fc.py`
with the S-4 param changes (cap 31 / collar 34 / port 82 / Ø6.4) kept — so
`PART_QUANTITIES` is back to Long ×6 + Little ×5 + Master ×1 + Final Key ×4 + Presser ×12,
`EcojoinerDerived.master_slot_depth` and the `master_john` SCAD/SVG/DXF/PDF paths return,
`n_rows` is 3 again, and `PART_QUANTITIES_BY_TYPE['6fc']` + `gen_part_master_john` are
back on the front end. Verified: dry run at defaults gives `standard_slot_depth` 29 /
`master_slot_depth` 34, matching v1.8.1's `eco_slot_depth()` / `eco_master_slot_depth()`;
all four formats generate clean and the Master John part renders in OpenSCAD (`part="master_john"`).

### Resolved: port length (2026-09-08, turtle_body v1.7.2)

The first drift table listed `port_length` (generators: `taper_height + port_allowance`; lib:
constant 82) as generator drift. It was the reverse. lib had flattened the rule to its value
for the reference bottle (top dome 62 + 20 = 82), which silently broke it for any other bottle.
`lib/params.scad` now defines `p_port_allowance() = 20` and
`p_port_length() = p_top_dome_h() + p_port_allowance()`; the default value is unchanged so no
geometry moved. The generators were already right and need no change here; when S-1…S-4 map
form fields to `p_*()` names, the form's **top tapper** is `p_top_dome_h()` and the hidden
`port_allowance` override is `p_port_allowance()`.

**Lesson for every item below:** "lib wins" means lib owns the *rule*. Before flattening a
generator to a lib number, check whether the generator's formula is the rule lib should have
had. Candidates to inspect the same way: the ballast `port_length`-dependent neck shoulder
(same rule, now consistent) and the 6FC `port_length` override path.

## Proposed mechanism (recommended before doing S-1…S-4 by hand)

1. **turtle_body: `build/export_params.py`.** Generate a throwaway `.scad` that `echo()`s every
   `p_*()` function, run it headless (`openscad -o /dev/null`), parse the `ECHO:` lines, and
   write `build/params.json` as `{ "p_bottle_d": 82, ... , "version": "1.7.1" }`. Hook it into
   `build/build.py` so it is regenerated with the bundles and committed.
2. **hopeTurtles.org: `generator/sync_from_turtle_body.py`.** Copy
   `../turtle_body/build/params.json` → `generator/turtle_params.json` and the four wooden
   bundles (`Turtle_Core_Ecojoiner_v1.scad`, `Turtle_Rear_Fin_v1.scad`,
   `Turtle_Bottom_Ballast_Fin_v1.scad`, `Turtle_Sail_Apparatus_v1.scad`) →
   `generator/scad/`; write `generator/TURTLE_BODY_VERSION`. Generators then load their
   DEFAULTS/TUNING from `turtle_params.json` instead of literals, and `build_scad()` does
   customizer-line replacement on the vendored bundle instead of an embedded template.
3. After that, a turtle_body release is synced by running one script and reviewing the diff;
   only `derive_dimensions()` (the 2D outlines) still needs a human check against `lib/`.

## Work items, in order

| Id | Item | Size | Status |
|---|---|---|---|
| S-1 | Rear fin | small (~1 h) | **Done 2026-09-08**, hand-fixed directly (S-5 not built first). |
| S-2 | Ballast | medium (~½ day) | **Done 2026-09-08**, hand-fixed directly; also fixed a missing mount hole and a latent port_length/bottle_diameter conflation (see above). |
| S-3 | Sails | medium | **Done 2026-09-08**, hand-fixed directly. Bottle-shape dimensions are real inputs, and SVG/DXF/PDF writers exist for all 7 part shapes — the form's fabrication toggles are un-restricted. |
| S-4 | 6FC Ecojoiner | large (~2 days) | **Done 2026-09-08**, hand-fixed directly. `objects/six_fc.py` renamed `objects/ecojoiner_6fc.py`; cap 31, collar 34, port 82 × 82, Ø6.4 clearance. **Master John restored 2026-09-08 (turtle_body v1.8.1)** — its removal in this pass was wrong; the rule was lifted upstream (`eco_master_slot_depth()`) and the generator re-based on `0cb0de8^` keeping the param changes. Part list: Long ×6 + Little ×5 + Master ×1 + Final Key ×4 + Presser ×12. See the "Corrected 2026-09-08" note above. object_type ("6fc"), job-slug prefix, and every other public identifier unchanged. |
| S-5 | Mechanism | medium | **Deferred.** S-1/S-2/S-3/S-4 were hand-fixed directly instead (2026-09-08 scope decision) — correct today, but the next turtle_body release will need the same manual comparison again since nothing here is generated from `lib/` automatically. Worth building before the next drift review. |
| S-6 | Hygiene | small | **Partly done.** `bottom_fin_raw.py` deleted (folded into the S-2 fix). `common.DESIGN_VERSION` ("3.2") turned out to be the 6FC object's own revision marker, not a whole-suite version — left alone pending S-4, not tied to anything here. `claude_code_ecojoiner_backend_prompt_v3_2.md` still holds unique implementation detail (validation ranges, job-slug format) not fully folded into CLAUDE.md yet — not deleted. |

## Verification for any sync item

- `generator/.venv/bin/python3 generator/generate_exports.py --json <payload> --dry-run` for
  every `object_type` (`6fc`, `fin`, `ballast`, `sails`) → `"ok": true`.
- Compare the generated `.scad` against the matching `turtle_body/v1.0 SCADs/*.scad` bundle at
  default inputs (the customizer values must be identical; ideally the geometry too).
- Compare `derived` in the manifest against the `p_*()` values / `rf_*`, `bl_*`, `eco_*`
  functions in the lib module.
- Record the turtle_body version synced against in `SYNC_LOG.md`.
