# Front/rear fin calibration rulers — turtle_body 6.6.0

Both broad fin faces carry shallow 0.3 mm engraving. Zero is the horizontal
bottle-axis height, not the middle of the fin outline. Signed millimetres increase
physically upward in the installed turtle. Minor ticks: 1 mm; intermediate: 5 mm;
labels: 10 mm. Marks/labels are omitted when they cannot fit inside exposed wood.
Ruler columns follow the half-lap ends when stock dimensions change.

No new visitor inputs or format options are required. Existing SCAD/SVG/DXF/PDF
requests get the ruler automatically. A build that cannot fit the zero tick is
rejected with a dimensional error rather than exporting an unusable ruler.

- SCAD: head fin uses the upstream bundle; rear fin retains its existing template
  and fit/shaft overrides but embeds the ruler definitions verbatim from the
  vendored bundle. Both carve 0.3 mm recesses on both faces.
- Main DXFs: existing CUT/MARK/LABEL entities are retained. Only the new ENGRAVE
  layer is machining engraving. It contains closed vector stroke footprints;
  overlapping strokes belong to the same engraving operation, not multiple cuts.
- Additional `_fin_face_b_engrave_1to1.dxf`: opposite-face ENGRAVE geometry only.
  Flip the blank about fin-local X=0 (the vertical Y axis in the 2D file); retain
  the main sheet's Y=10 mm datum. Do not auto-centre or independently nest either
  face. This file is for the fin alone, not its slats. All DXFs use millimetres.
- SVGs: native-up transforms keep ruler signs/glyphs upright with the cut outline.
  The separately identified `engrave` group is filled brown and carries engraving
  operation/depth attributes. It is not a cut path.
- PDFs: rulers are drawn on the fin reference diagrams; the sheet states zero,
  sign/units and two-face depth. PDFs remain scaled reference sheets, not templates.
- Manifest: `derived.ruler` records zero, sign, units, depth, range and reference X.

Review CAM operations and face registration before fabrication. These exporters
have been checked geometrically; no claim of physical fabrication validation is made.

## Source and verification

`fin_rulers.py` is the single downstream Python implementation used by both
fin objects and all 2D formats. Its fit/glyph rules mirror upstream
`lib/fin_ruler.scad`. The rear SCAD definitions are extracted directly from the
vendored bundle. `verify_fin_rulers.py` compares both faces' complete geometric
footprints to generated OpenSCAD paths (scan-line unions, no Shapely dependency),
including non-default dimensions, clearance and positive/negative fit offsets.
It also generates all formats, checks units and two-face registration, and tests
invalid inputs. This is a developer check; the website runtime still needs only
its existing Python packages and never invokes OpenSCAD.

```bash
generator/.venv/bin/python generator/verify_fin_rulers.py
python3 generator/check_params_sync.py
```

## turtle_body checkout

Upstream is `/home/russs/PycharmProjects/turtle_body` (moved out of WebstormProjects on
2026-11-12). `sync_from_turtle_body.py` finds it by default, then falls back to a sibling
`../turtle_body`. `--turtle-body` or `TURTLE_BODY_DIR` overrides both:

```bash
python3 generator/sync_from_turtle_body.py            # or: npm run generator:sync
python3 generator/sync_from_turtle_body.py --check
python3 generator/check_params_sync.py
```

The stale clone `/home/russs/WebstormProjects/turtle_body_OLD- nov11` must not be synced from.
Do not edit vendored bundles directly or sync from the older checkout by accident.
