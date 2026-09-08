"""Sail apparatus object (top sail bar, four battens, bottom sail bars, joint
strengtheners, C end pieces and the two sails).

The .scad output comes straight from the standalone reference generator
generator/generate_sails.py (build_scad()), the same delegation pattern as
objects/back_fin.py -> back_fin_generator.py. This module adds the
JSON-manifest/job-folder contract the dispatcher and Node expect.

**SCAD only for now.** Unlike the fin and ballast objects there are no
SVG/DXF/PDF carpenter-sheet writers yet, so any other requested format is
reported back in the manifest's ``unsupported_formats`` list instead of
failing the job (generator/SYNC_PLAN.md item S-3's remaining piece).

Upstream contract: every default below mirrors a ``p_*()`` function in
../turtle_body/lib/params.scad (named in the comments). Do not change a
value here without checking upstream first - see CLAUDE.md "Turtle
Generator".
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from common import DESIGN_VERSION, LICENSE_ID, GeneratedFile, _to_float, _slugify
import generate_sails as _sails

OBJECT_TYPE = "sails"

# Formats this object can actually write. Everything else is skipped and
# listed under "unsupported_formats" in the manifest.
SUPPORTED_FORMATS: Tuple[str, ...] = ("scad",)

# Counted from generate_sails.SCAD_TEMPLATE's *_native_assembly modules.
PART_QUANTITIES = {
    "Top Sail Bar": 1,
    "Sail Batten": 2,
    "Non-sail Batten": 2,
    "Bottom Sail Bar": 2,
    "Joint Strengthener": 2,
    "C End Piece": 2,
    "Sail": 2,
}

# Form-driven inputs (Panels 2-3 of /ecojoiners/generate, the same fields
# "fin"/"ballast" reuse). All are real inputs to generate_sails.build_scad().
#                                       upstream (turtle_body/lib/params.scad)
DEFAULTS = {
    "wood_thickness": 12.0,               # p_wood_t()
    "bottle_diameter": 82.0,              # p_bottle_d()
    "bottle_height": 305.0,               # p_bottle_h()
    "cap_diameter": 31.0,                 # p_bottle_cap_d()
    "cap_height": 17.0,                   # p_bottle_cap_h()
    "collar_diameter": 34.0,              # p_collar_d()
    "top_dome_height": 62.0,              # p_top_dome_h() (form's "top tapper")
    "bottom_dome_height": 25.0,           # p_bottom_dome_h() (form's "bottom tapper")
}

# Fixed joinery/tuning values, not exposed on the form (same tier as the fin
# object's TUNING).
TUNING = {
    "side_batten_height": 205.0,          # p_side_batten_h()
    "cage_mount_hole_diameter": 3.2,      # p_cage_mount_hole_d()
}

# Values the template fixes internally; reported so the preview can show them.
TOP_SAIL_BAR_WIDTH = 22.0                 # p_top_crossbar_w()
SIDE_BATTEN_WIDTH = 20.0                  # p_side_batten_w()
CAGE_MOUNT_PITCH = 32.0                   # p_cage_mount_pitch()


@dataclass(frozen=True)
class SailsInputs:
    wood_thickness: float = DEFAULTS["wood_thickness"]
    bottle_diameter: float = DEFAULTS["bottle_diameter"]
    bottle_height: float = DEFAULTS["bottle_height"]
    cap_diameter: float = DEFAULTS["cap_diameter"]
    cap_height: float = DEFAULTS["cap_height"]
    collar_diameter: float = DEFAULTS["collar_diameter"]
    top_dome_height: float = DEFAULTS["top_dome_height"]
    bottom_dome_height: float = DEFAULTS["bottom_dome_height"]
    side_batten_height: float = TUNING["side_batten_height"]
    cage_mount_hole_diameter: float = TUNING["cage_mount_hole_diameter"]

    bottle_brand: str = "generic"
    formats: Tuple[str, ...] = ("scad",)
    job_id: str = ""
    lang: str = "en"


@dataclass(frozen=True)
class SailsDerived:
    top_sail_bar_length: float
    top_sail_bar_width: float
    bottom_sail_bar_length: float
    side_batten_height: float
    side_batten_width: float
    cage_mount_hole_diameter: float
    cage_mount_pitch: float
    cage_mount_upper_from_batten_top: float
    cage_mount_lower_from_batten_top: float


def parse_inputs_from_dict(data: Dict[str, object]) -> SailsInputs:
    """Parse the JSON payload Node sends (snake_case keys, see
    utils/ecojoinerGenerator.js::mapSailsFields)."""

    def get(name, default=None):
        return data[name] if name in data else default

    raw_formats = get("formats", ("scad",))
    if isinstance(raw_formats, str):
        formats = tuple(x.strip().lower() for x in raw_formats.split(",") if x.strip())
    elif isinstance(raw_formats, (list, tuple)):
        formats = tuple(str(x).strip().lower() for x in raw_formats if str(x).strip())
    else:
        formats = ("scad",)

    kwargs = {}
    for key, default in DEFAULTS.items():
        kwargs[key] = _to_float(get(key), default)
    for key, default in TUNING.items():
        kwargs[key] = _to_float(get(key), default)

    return SailsInputs(
        **kwargs,
        bottle_brand=str(get("bottle_brand", "generic") or "generic"),
        formats=formats,
        job_id=str(get("job_id", "") or ""),
        lang=str(get("lang", "en") or "en").lower(),
    )


def derive_dimensions(inputs: SailsInputs) -> SailsDerived:
    t = inputs.wood_thickness
    bd = inputs.bottle_diameter
    # Cage-mount hole centres measured from the batten top: the template puts
    # the lower hole at cage roof 50 + board + 15 end margin + 10, the upper
    # one a pitch above it (55 / 87 at 12 mm stock).
    lower = 75.0 + t
    return SailsDerived(
        top_sail_bar_length=6 * bd,                 # p_top_crossbar_len() = 6 * p_bottle_d()
        top_sail_bar_width=TOP_SAIL_BAR_WIDTH,
        bottom_sail_bar_length=3 * bd,              # p_bottom_rail_len() = 3 * p_bottle_d()
        side_batten_height=inputs.side_batten_height,
        side_batten_width=SIDE_BATTEN_WIDTH,
        cage_mount_hole_diameter=inputs.cage_mount_hole_diameter,
        cage_mount_pitch=CAGE_MOUNT_PITCH,
        cage_mount_upper_from_batten_top=lower - CAGE_MOUNT_PITCH,
        cage_mount_lower_from_batten_top=lower,
    )


def validate_inputs(inputs: SailsInputs) -> List[str]:
    errors: List[str] = []
    for value, label in (
        (inputs.wood_thickness, "Wood thickness"),
        (inputs.bottle_diameter, "Bottle diameter"),
        (inputs.bottle_height, "Bottle height"),
        (inputs.cap_diameter, "Cap diameter"),
        (inputs.cap_height, "Cap height"),
        (inputs.collar_diameter, "Collar diameter"),
        (inputs.top_dome_height, "Top dome height"),
        (inputs.bottom_dome_height, "Bottom dome height"),
        (inputs.side_batten_height, "Batten height"),
        (inputs.cage_mount_hole_diameter, "Cage mount hole diameter"),
    ):
        if value is None or value <= 0:
            errors.append(f"{label} must be greater than 0.")
    if errors:
        return errors

    # The reference generator owns the geometric rules; surface its
    # ValueErrors as ordinary validation messages.
    try:
        _sails.build_scad(
            inputs.wood_thickness,
            inputs.side_batten_height,
            inputs.cage_mount_hole_diameter,
            "assembly",
            bottle_diameter=inputs.bottle_diameter,
            bottle_height=inputs.bottle_height,
            cap_diameter=inputs.cap_diameter,
            cap_height=inputs.cap_height,
            collar_diameter=inputs.collar_diameter,
            top_dome_height=inputs.top_dome_height,
            bottom_dome_height=inputs.bottom_dome_height,
        )
    except ValueError as exc:
        errors.append(str(exc))
    return errors


def notices(inputs: SailsInputs) -> List[str]:
    out: List[str] = []
    unsupported = [f for f in inputs.formats if f not in SUPPORTED_FORMATS]
    if unsupported:
        out.append(
            "The sail frame currently exports OpenSCAD only; "
            + ", ".join(f.upper() for f in unsupported)
            + " will be skipped."
        )
    return out


def make_job_slug(inputs: SailsInputs, derived: SailsDerived) -> str:
    brand = _slugify(inputs.bottle_brand)
    job_id = _slugify(inputs.job_id or uuid.uuid4().hex[:8], fallback=uuid.uuid4().hex[:8])
    return f"sails_{brand}_{round(derived.top_sail_bar_length):g}x{round(derived.side_batten_height):g}_{job_id}"


def write_scad(path: Path, inputs: SailsInputs, d: SailsDerived) -> None:
    path.write_text(
        _sails.build_scad(
            inputs.wood_thickness,
            inputs.side_batten_height,
            inputs.cage_mount_hole_diameter,
            "assembly",
            bottle_diameter=inputs.bottle_diameter,
            bottle_height=inputs.bottle_height,
            cap_diameter=inputs.cap_diameter,
            cap_height=inputs.cap_height,
            collar_diameter=inputs.collar_diameter,
            top_dome_height=inputs.top_dome_height,
            bottom_dome_height=inputs.bottom_dome_height,
        ),
        encoding="utf-8",
    )


def generate(
    inputs: SailsInputs,
    output_root: Path,
    public_url_prefix: str = "/ecojoiner_exports",
    font_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Validate and write the requested files. Same manifest contract as
    back_fin.generate(); `font_dir` is accepted for signature parity only."""

    errors = validate_inputs(inputs)
    if errors:
        return {"ok": False, "errors": errors}

    d = derive_dimensions(inputs)
    slug = make_job_slug(inputs, d)
    unsupported = [f for f in inputs.formats if f not in SUPPORTED_FORMATS]
    common = {
        "ok": True,
        "object_type": OBJECT_TYPE,
        "design_version": DESIGN_VERSION,
        "license": LICENSE_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_slug": slug,
        "inputs": asdict(inputs),
        "derived": asdict(d),
        "part_quantities": PART_QUANTITIES,
        "unsupported_formats": unsupported,
        "notices": notices(inputs),
    }

    if dry_run:
        return {**common, "dry_run": True, "files": []}

    job_dir = output_root / slug
    job_dir.mkdir(parents=True, exist_ok=True)

    files: List[GeneratedFile] = []
    if "scad" in inputs.formats:
        scad_path = job_dir / f"{slug}.scad"
        write_scad(scad_path, inputs, d)
        files.append(GeneratedFile("scad", "OpenSCAD source", str(scad_path), f"{public_url_prefix}/{slug}/{scad_path.name}"))

    manifest = {**common, "files": [asdict(f) for f in files]}
    manifest_path = job_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(manifest_path)
    manifest["manifest_url"] = f"{public_url_prefix}/{slug}/manifest.json"
    return manifest
