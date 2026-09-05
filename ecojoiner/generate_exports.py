#!/usr/bin/env python3
"""
Ecojoiner export generator - CLI dispatcher
============================================

This is the single entry point Node's utils/ecojoinerGenerator.js invokes
(config.ecojoiner.script). It no longer contains any object-specific
geometry itself - each flatpack object type (the six-panel "6FC" ecojoiner,
the back fin attachment, and future additions) lives in its own module
under ecojoiner/objects/, sharing common drawing/font/manifest helpers from
ecojoiner/common.py. See ecojoiner/objects/six_fc.py and
ecojoiner/objects/back_fin.py for the actual generators.

Object selection: the JSON payload passed via --json may include an
"object_type" key ("6fc" or "fin"); it defaults to "6fc" for back-compat
with any caller that omits it (including this script's own manual CLI
flags below, which only ever build 6FC inputs).

Expected backend usage:
  1. Receive POST fields from /ecojoiners/generate.
  2. Node maps them into the object-specific input shape (see
     utils/ecojoinerGenerator.js::mapFormFields) and writes them to a temp
     JSON file.
  3. Pass that file via --json. Files are saved under
     public/ecojoiner_exports/<job-slug>/.
  4. Return download URLs to the frontend from the printed JSON manifest.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional, Sequence

from objects import six_fc, back_fin


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Generate Ecojoiner flatpack exports (PDF, SCAD, SVG, DXF).")
    # Manual/CLI-only flags below build 6FC inputs directly, for ad-hoc use
    # without a --json payload. The web app always supplies --json.
    p.add_argument("--slat-thickness", type=float, default=12.0, help="Wood thickness in mm.")
    p.add_argument("--cap-diameter", type=float, default=32.0, help="Bottle cap diameter in mm.")
    p.add_argument("--collar-diameter", type=float, default=32.0, help="Bottle collar diameter in mm.")
    p.add_argument("--taper-height", type=float, default=60.0, help="Bottle taper height in mm. Used with port allowance.")
    p.add_argument("--port-length", type=float, default=None, help="Optional direct port length in mm. Overrides taper height.")
    p.add_argument("--port-allowance", type=float, default=20.0, help="Extra seating allowance added to taper height.")
    p.add_argument("--port-height", type=float, default=85.0, help="Bottle diameter / port height in mm.")
    p.add_argument("--port-fit-mm", type=float, default=0.0, help="Connection fit offset in mm, added to port height (negative = tighter).")
    p.add_argument("--bottle-volume-l", type=float, default=1.5, help="Bottle volume in litres, used for naming/stats.")
    p.add_argument("--bottle-brand", type=str, default="generic", help="Bottle brand, used for naming/stats.")
    p.add_argument("--screw-diameter", type=float, default=4.5, help="M6 pilot-hole cut diameter in mm.")
    p.add_argument("--fit-clearance", type=float, default=0.20, help="Slot clearance in mm.")
    p.add_argument("--formats", type=str, default="pdf,scad,svg", help="Comma-separated formats: pdf,scad,svg,dxf.")
    p.add_argument("--job-id", type=str, default="", help="Optional job id for stable file naming.")
    p.add_argument("--output-dir", type=Path, default=Path("public/ecojoiner_exports"), help="Output directory root.")
    p.add_argument("--public-url-prefix", type=str, default="/ecojoiner_exports", help="URL prefix matching Express static routing.")
    p.add_argument("--font-dir", type=Path, default=None, help="Optional directory containing Arvo/Mulish fonts.")
    p.add_argument("--json", type=Path, default=None, help="JSON file containing input fields from the frontend. The web app always supplies this.")
    p.add_argument("--dry-run", action="store_true", help="Validate and derive dimensions without writing any files.")
    return p


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_arg_parser().parse_args(argv)

    if args.json:
        data = json.loads(args.json.read_text(encoding="utf-8"))
        object_type = str(data.get("object_type") or "6fc")
        module = back_fin if object_type in ("fin", "back_fin") else six_fc
        inputs = module.parse_inputs_from_dict(data)
    else:
        module = six_fc
        inputs = six_fc.EcojoinerInputs(
            slat_thickness=args.slat_thickness,
            cap_diameter=args.cap_diameter,
            collar_diameter=args.collar_diameter,
            taper_height=args.taper_height,
            port_length=args.port_length,
            port_allowance=args.port_allowance,
            port_height=args.port_height + args.port_fit_mm,
            bottle_volume_l=args.bottle_volume_l,
            bottle_brand=args.bottle_brand,
            screw_diameter=args.screw_diameter,
            fit_clearance=args.fit_clearance,
            formats=tuple(x.strip().lower() for x in args.formats.split(",") if x.strip()),
            job_id=args.job_id,
        )

    result = module.generate(
        inputs,
        output_root=args.output_dir,
        public_url_prefix=args.public_url_prefix.rstrip("/"),
        font_dir=args.font_dir,
        dry_run=args.dry_run,
    )

    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
