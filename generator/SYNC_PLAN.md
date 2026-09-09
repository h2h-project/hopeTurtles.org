# Syncing the turtle generators to `turtle_body`

**Status (2026-09-08, turtle_body v1.8.1):** all recorded drift is fixed and the
sync *mechanism* (S-5) is built. Value-level drift is now caught automatically;
structural changes still need a manual propagation pass. Remaining backlog: S-5b
and S-6 (below), plus the larger "automatic structural propagation" work, which
is scoped but not started.

Running record of every upstream change and how it was carried: `SYNC_LOG.md`.

---

## 1. Ground rule

`../turtle_body/lib/params.scad` and the wooden component modules
(`lib/ecojoiner.scad`, `lib/rear_fin.scad`, `lib/ballast_fin.scad`,
`lib/sail_frame.scad`) are the authoritative geometry. The generators in
`generator/` are downstream consumers. **When a value or rule differs, the
generator is wrong** — with one nuance:

> **"Lib wins" means lib owns the *rule*, not just the number.** If a generator
> carries a parametric rule that lib has flattened to a constant, lift the rule
> *into* `lib/params.scad`, don't flatten the generator. Precedents: `p_port_length()`
> (v1.7.2, lib had the constant 82; the generators' `taper_height + port_allowance`
> was the real rule) and `eco_master_slot_depth()` (v1.8.1, the Master John's
> deeper slot — the generator always had it, lib never modelled it).

---

## 2. Why drift happens — the three copies

Each generator carries **three copies** of every part's geometry:

1. the upstream `lib/<module>.scad` — the source of truth;
2. the generator's **embedded SCAD** (`objects/ecojoiner_6fc.py`'s f-string,
   `back_fin_generator.py` / `bottom_ballast_fin_generator.py` `SCAD_BODY`,
   `generate_sails.py`'s `str.replace` template);
3. the generator's **Python `derive_dimensions()` + 2D writers** that re-derive
   each flat part's outline/holes/slots for SVG, DXF and PDF.

Nothing mechanically links them. S-5 (below) links copy 1 to a machine-readable
snapshot and checks that copies 2–3 *agree on the shared scalars*. It does not
remove copies 2–3 — that is what section 5 is about.

---

## 3. The mechanism (S-5) — built 2026-09-08

| Piece | Repo | What it does |
|---|---|---|
| `build/export_params.py` → `build/params.json` | turtle_body | Renders every `p_*()` and writes them as JSON (values + version). Run by `build/build.py`; a stale snapshot fails `build/lint.py --check`. |
| `generator/sync_from_turtle_body.py` | here | Pure copy of `params.json` + the four `v1.0 SCADs/*.scad` bundles into `generator/turtle_body/` (`params.json`, `scad/`, `VERSION`). `--check` reports staleness. |
| `generator/check_params_sync.py` | here | 39 assertions: every generator's shared-**input** default vs the vendored snapshot (`slat_thickness`/`wood_thickness` ↔ `p_wood_t`, `cap_diameter` ↔ `p_bottle_cap_d`, `screw_diameter`/`shaft_hole_diameter`/`MOUNT_HOLE_DIAMETER` ↔ `p_m6_clearance_d`, solar panel dims, dome heights, …). Exit 1 + a `DRIFT` table on any mismatch. Runs in `npm run lint`. |

`npm run generator:sync` = copy + check. `npm run generator:sync-check` is the
release gate (needs `../turtle_body`). `npm run generator:check` runs the checker
alone against the committed snapshot (no sibling checkout needed).

**What the checker covers:** the ~39 shared scalar inputs. A changed `p_*()`
value cannot slip through un-noticed.

**What it does not cover:** new parameters, formula/rule changes inside the
wooden `lib/*.scad` modules (`derive_dimensions()` layer), new or removed parts,
geometry restructuring. Those are silent to the checker.

---

## 4. Standing procedure after a turtle_body release

```bash
# in ../turtle_body
git pull && python3 build/build.py            # refreshes build/params.json

# in hopeTurtles.org
npm run generator:sync                        # vendor snapshot + bundles, run the checker
git diff generator/turtle_body/              # read the contract change
```

Then, by change type:

- **Value tweak** (a shared scalar moved, no formula/structure change): the
  checker names the stale literals. Edit them (cite the `p_*()` name in a
  comment), commit. Minutes.
- **Structural change** (formula, part list, new hole, new part, joint change):
  the checker stays green but you must **budget a propagation pass** — for each
  affected generator:
  1. Read the `VERSION.json` changelog entry and the `lib/<module>.scad` diff.
  2. In the generator's object module, find all three copies of the changed
     geometry (section 2) and update them consistently.
  3. Verify:
     - `generator/.venv/bin/python3 generator/generate_exports.py --json <payload> --dry-run`
       → `"ok": true` for `6fc`, `fin`, `ballast`, `sails`;
     - generated `.scad` customizer block == the matching
       `generator/turtle_body/scad/*.scad` bundle at default inputs;
     - manifest `derived` values == the `p_*()` snapshot and the `eco_*`/`rf_*`/`bl_*`
       lib functions.
  4. Record it in `SYNC_LOG.md`.

If a propagation pass is out of scope for the task at hand, append an `open`
entry to `SYNC_LOG.md` and say so — never leave a `lib/` change unrecorded here.

---

## 5. What automatic structural propagation would take

Goal: a `lib/` change to a part's *shape* (not just a dimension) reaches the
generator's SCAD/SVG/DXF/PDF output without a hand-edit. This means collapsing
copies 2 and 3 (section 2) so they are *derived from* copy 1, not re-authored.
Four levels, increasing cost; each is independently shippable.

### Level 0 — shared scalars (done: S-5)

`params.json` + `check_params_sync.py`. A value change is a named checker failure
plus a one-line edit.

### Level 1 — generators *load* scalar defaults from the snapshot (S-5b)

Replace each `DEFAULTS = { "wood_thickness": 12.0, ... }` and the named constants
(`SCREW_SIDE_OFFSET`, `MOUNT_HOLE_DIAMETER`, `DEFAULT_PORT_ALLOWANCE_MM`, …) with
reads from `generator/turtle_body/params.json` via a small
`generator/turtle_params.py` loader (`p("p_wood_t")`).

- **Effect:** value changes need *zero* generator edits after `sync`.
- **Effort:** small (~½ day). One loader + ~30 call-site edits across 4 objects
  and their reference scripts.
- **Risk:** a wrong *key* (`p("p_fin_board_w")` where `p("p_wood_t")` was meant)
  feeds a real upstream value into the wrong slot — silent. Mitigation: keep
  `check_params_sync.py` as the mapping guard (it independently declares the same
  form-field ↔ `p_*()` pairing), and have it read the loader's output so the two
  can't diverge.
- **Dependency:** none. Purely local.

### Level 2 — generate the SCAD from the vendored bundle, not an embedded template

turtle_body already ships self-contained `v1.0 SCADs/*.scad` bundles with a
customizer block at the top. Replace each generator's embedded SCAD (copy 2)
with: take `generator/turtle_body/scad/Turtle_<part>_v1.scad`, rewrite the
customizer-block assignments to the user's inputs, set the `part=` selector,
return it.

- **Effect:** the SCAD output is upstream-current *by construction* — a new
  module, a changed formula, a new part in the lib all appear with no edit.
  Copy 2 is deleted.
- **Effort:** medium (~1 day per generator). Per part: a form-input →
  customizer-variable map (~10 names), customizer-block rewriting (regex on
  `name = value;` lines — `back_fin_generator.py` / `generate_sails.py` already do
  a cruder version of this), and `part=` / `assembly_view` handling so the
  generator can ask for `layout` / `full_set` / one part.
- **Risk:** brittle if the bundle's customizer block isn't cleanly parseable or
  its variable names drift. Mitigation below.
- **Dependency (turtle_body):** a **stable customizer contract** — every wooden
  bundle exposes the same top-of-file block, one `name = value;` per line, names
  that don't churn between releases. Worth adding a `build/lint.py` check upstream
  that the customizer names for a bundle match a checked-in list. Small upstream
  task; makes Level 2 safe.

### Level 3 — derive the 2D carpenter files from the geometry, not a Python re-implementation

Copy 3 (`derive_dimensions()` + `write_svg` / `write_dxf` / `write_pdf`) exists
because the cut files need exact per-part outlines-with-holes, today re-derived
in Python from the same formulas. To make these propagate, the 2D profile of
each flat part has to come *from* the upstream geometry. Three ways, pick one:

- **3a — OpenSCAD `projection()` per part.** For each part, CLI-render
  `projection()` of its extruded 2D profile to DXF, convert DXF→SVG, lay out the
  PDF from the DXF.
  - *Pro:* outlines are exactly upstream; no Python geometry at all.
  - *Con:* needs **OpenSCAD on the server** (currently avoided by design — see
    the STL-export note in `CLAUDE.md`); a render per request; the PDF still needs
    a separate annotation pass (dimension lines, labels, part names) that isn't in
    a DXF.
  - *Effort:* medium, but the server-dependency decision is the real gate.

- **3b — a parts manifest emitted by the lib modules.** turtle_body's wooden
  modules `echo()` a structured description of every flat part — outline polygon,
  hole list, slot list, label, suggested layout — the same way `params.json` is
  an `echo()` dump. `build/export_params.py` grows a sibling `export_parts.py` →
  `build/parts.json`. The generator vendors it and renders SVG/DXF/PDF with **one
  generic renderer** replacing the four hand-written ones.
  - *Pro:* no OpenSCAD on the server; outlines are upstream-authored; 4 writers
    collapse to 1; the manifest is diffable like `params.json`.
  - *Con:* turtle_body must add and *maintain* the `echo()` part descriptions in
    every wooden module (real ongoing upstream work), and the schema has to cover
    arcs, chamfers and text placement, not just line segments.
  - *Effort:* large. ~1 week upstream to describe all ~20 flat parts + schema;
    ~1 week here for the generic renderer + PDF layout engine.
  - *This is the recommended end state* — it removes copy 3 without a server
    dependency and keeps geometry authorship in one place.

- **3c — vendor pre-rendered reference files, scale per bottle.** turtle_body
  commits SVG/DXF/PDF for the reference bottle; the generator scales them to the
  user's bottle.
  - *Pro:* cheapest server-side.
  - *Con:* only correct if per-part adjustment is close to uniform scaling — it
    is **not** (slot depths, hole insets, shoulder cuts don't scale with the
    bottle diameter). Rejected for anything but a preview thumbnail.

### Recommended sequence

1. **Level 1 (S-5b)** — cheap, local, do any time.
2. **Level 2** — high value (kills copy 2), needs the small upstream customizer
   contract first.
3. **Level 3b** — the end state (kills copy 3), needs sustained upstream buy-in;
   only worth starting once parts change often enough to pay for it.

### What none of this solves

Form design (which inputs to collect), validation ranges and messages, PDF copy
and i18n, job-slug / retention / rate-limit plumbing, and the front-end — all
genuinely generator-side, all stay hand-maintained. A brand-new *kind* of part
still needs a form field + (Level 3b) a manifest entry + renderer support.

---

## 6. Remaining backlog

| Id | Item | Size | Status |
|---|---|---|---|
| S-5b | Generators load scalar defaults from `turtle_body/params.json` (Level 1 above) | small | **Deferred.** Authoring de-dup, not a drift-protection gap — the checker already enforces agreement. |
| S-6 | Hygiene | small | **Partly done.** `bottom_fin_raw.py` deleted (folded into S-2). `common.DESIGN_VERSION` ("3.2") is the 6FC object's own revision marker, not a suite version — left alone. `claude_code_ecojoiner_backend_prompt_v3_2.md` still holds unique detail (validation ranges, job-slug format) not folded into `CLAUDE.md` — not deleted. |
| Level 2 | SCAD from the vendored bundle | ~1 day/generator + small upstream task | Not started. |
| Level 3b | Lib-emitted parts manifest + one generic 2D renderer | ~2 weeks split upstream/here | Not started; recommended end state. |

---

## 7. History (S-1…S-5, all 2026-09-08)

Fixed by hand, in order, against turtle_body v1.7.1 (S-5 not built first — a
scope call). Full detail per item in `SYNC_LOG.md`.

- **S-1 rear fin.** `shaft_hole_diameter` 6.0 → 6.4 (`p_m6_clearance_d()`).
  `shaft_hole_from_front` 50 (fixed) → `None` = "derive via TB-07"
  (`(2/3)(fin_board_w − 2t) − 25 + bottle_d` = 103 at defaults), still
  overridable. `objects/back_fin.py` threads the resolved value through
  `derive_dimensions()` and the writers.
- **S-2 ballast.** Defaults 15/320/35 → 12/305/31; slat height `bh−ch+4.5t` →
  `bh−ch+6t`. Two bugs found while doing it: (a) the standalone core slat had
  **no M6 mount hole at all** — added, matching `bl_mount_hole_*()`; (b) the
  shoulder-cut position read `port_length` instead of `bottle_diameter`/port
  height (equal only at the reference bottle — a non-default taper would mis-cut).
  `bottom_fin_raw.py` deleted.
- **S-3 sails.** `sail_apparatus()` already accepted the bottle-shape params;
  `build_scad()`'s `str.replace` wrapper only forwarded three of them — extended
  to all seven, `SailsInputs`/`DEFAULTS` and `mapSailsFields` now carry them.
  **Plus** SVG/DXF/PDF writers built from scratch for all 7 shapes, every outline
  verified against real OpenSCAD bounding boxes; `write_pdf()` uses a 3-row
  independent-scale layout; fabrication toggles un-restricted.
- **S-4 6FC.** Re-based on `lib/ecojoiner.scad`: `cap_diameter` 32→31,
  `collar_diameter` 32→34, `port_height` 85→82, `screw_diameter` 4.5→6.4.
  `objects/six_fc.py` → `objects/ecojoiner_6fc.py` (internal only; `object_type`,
  job-slug prefix and public API unchanged). **Master John:** removed here, then
  **restored** when turtle_body v1.8.1 lifted the rule upstream
  (`eco_master_slot_depth()` = `min(floor(port_height/2), floor(john_height·0.6))`,
  34 vs standard 29) — removing it had been the one wrong call in the pass. Part
  list: Long ×6 + Little ×5 + Master ×1 + Final Key ×4 + Presser ×12.
- **S-5 mechanism.** Section 3. Also nudged the 6FC `taper_height` default 60→62
  to match `p_top_dome_h()` and sails (now checker-enforced).

**Not drift — `port_length` (v1.7.2).** The first assessment listed it as
generator drift; it was the reverse. `lib/params.scad` had `p_port_length()`
flattened to the constant 82; it was corrected to
`p_top_dome_h() + p_port_allowance()`, matching the generators' rule. Default
value unchanged, no geometry moved. This is the precedent for the "lib owns the
rule" nuance in section 1.
