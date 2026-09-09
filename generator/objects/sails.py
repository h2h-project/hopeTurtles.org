"""Sail apparatus object (top sail bar, four battens, bottom sail bars, joint
strengtheners and C end pieces).

The .scad output comes straight from the standalone reference generator
generator/generate_sails.py (build_scad()), the same delegation pattern as
objects/back_fin.py -> back_fin_generator.py. This module adds the
JSON-manifest/job-folder contract the dispatcher and Node expect, plus
SVG/DXF/PDF carpenter-file writers for the assembly's 6 flat wooden part
shapes (generator/SYNC_PLAN.md item S-3, completed 2026-09-08).

The sail itself is soft goods (mylar/fabric), not a sawn wooden part, so it
is deliberately left off every 2D carpenter export - the .scad assembly
still renders it for context, and a dedicated sail generator is planned.

Upstream contract: every default below mirrors a ``p_*()`` function in
../turtle_body/lib/params.scad (named in the comments). The FIXED constants
below (batten width, notch depths, cage geometry that positions the batten
holes, etc.) are ported directly from generate_sails.py's SCAD_TEMPLATE,
which is itself downstream of lib/sail_frame.scad and lib/control_cage.scad
-- they are not exposed as generator inputs because the SCAD template does
not expose them either. Do not change a value here without checking
upstream first - see CLAUDE.md "Turtle Generator".
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from common import (
    DESIGN_VERSION,
    LICENSE_ID,
    GeneratedFile,
    _to_float,
    _slugify,
    _ceil_mm,
    _svg_header,
    _rect,
    _circle,
    _label,
    DXF_CUT_LAYER,
    _dxf_setup,
    _dxf_rect,
    _dxf_circle,
    _dxf_label,
    _register_fonts,
    _draw_dimension_line,
    _rounded_rect_text,
    _rot_point,
    _rect_open,
    _draw_edges,
    _draw_open_path,
    colors,
    landscape,
    letter,
    canvas,
    ezdxf,
)
import generate_sails as _sails

OBJECT_TYPE = "sails"

SUPPORTED_FORMATS: Tuple[str, ...] = ("scad", "svg", "dxf", "pdf")

# Counted from generate_sails.SCAD_TEMPLATE's *_native_assembly modules.
# The Sail (x2) is soft goods, not a wooden cut part, so it is not listed
# here or drawn on any 2D export - keep this equal to PART_QUANTITIES_BY_TYPE
# ['sails'] in utils/ecojoinerGenerator.js.
PART_QUANTITIES = {
    "Top Sail Bar": 1,
    "Sail Batten": 2,
    "Non-sail Batten": 2,
    "Bottom Sail Bar": 2,
    "Joint Strengthener": 2,
    "C End Piece": 2,
}

# Form-driven inputs.                       upstream (turtle_body/lib/params.scad)
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

# ---------------------------------------------------------------------------
# Fixed constants ported from generate_sails.py's SCAD_TEMPLATE. None of
# these are generator inputs -- the SCAD module doesn't expose them as
# sail_apparatus() parameters either, so there is nothing to thread through.
# ---------------------------------------------------------------------------
TOP_BAR_WIDTH = 22.0                  # p_top_crossbar_w()
TOP_BAR_SLOT_WIDTH = 10.0             # == BATTEN_THICKNESS
TOP_BAR_SLOT_DEPTH = 11.0
TOP_BAR_AXLE_HOLE_D = 12.0            # p_sail_bar_axle_hole_d()

BATTEN_WIDTH = 20.0                   # p_side_batten_w()
BATTEN_THICKNESS = 10.0
BATTEN_NOTCH_DEPTH = BATTEN_WIDTH / 2  # 10
BATTEN_END_MARGIN = 15.0
CAGE_MOUNT_PITCH = 32.0               # p_cage_mount_pitch()

BOTTOM_BAR_WIDTH = TOP_BAR_WIDTH      # 22
BOTTOM_BAR_SLOT_WIDTH = BATTEN_THICKNESS   # 10
BOTTOM_BAR_SLOT_DEPTH = BOTTOM_BAR_WIDTH / 2  # 11
BOTTLE_CLEARANCE = 1.0

C_PIECE_WIDTH = BOTTOM_BAR_WIDTH      # 22
C_PIECE_OUTER_EXTENSION = 15.0

STRENGTHENER_WIDTH = 24.0
STRENGTHENER_ABOVE_BAR = 24.0
STRENGTHENER_BELOW_BAR = 15.0
STRENGTHENER_SLOT_DEPTH = 12.0

BATTEN_CAGE_M6_HOLE_D = 6.4           # p_m6_clearance_d() -- the strengthener/batten M6 joint

# Cage geometry that only matters here to place the batten/strengthener M6 and
# M3 holes correctly -- these are downstream of lib/control_cage.scad and are
# NOT affected by cap_diameter/collar_diameter/dome heights (only by
# bottle_diameter, through the cage's own bottle-clearance chain).
CAGE_TOTAL_HEIGHT = 50.0              # p_cage_total_h() native
CAGE_SURFACE_THICKNESS = 6.0          # p_cage_roof_t()
CAGE_PEAK_EXTENSION = 20.0            # p_cage_peak_extension()
CAGE_LOWER_HOLE_FROM_TIP = 10.0       # p_cage_lower_hole_from_tip()
CAGE_NOTCH_DEPTH = 3.7                # p_cage_notch_depth()
CAGE_SIDE_WALL_THICKNESS = 6.5        # p_cage_wall_t()
CAGE_CAP_CLEARANCE = 2.0              # control_cap_to_cage_diametral_clearance
INSERT_SHAFT_TO_CAP_STEP = 21.0       # insert_shaft_to_top_disk_diameter_step
BOTTLE_WALL_T = 0.5
INSERT_SHAFT_RADIAL_CLEARANCE = 1.0


def _cage_notch_root_radius(bd: float) -> float:
    """Radius of the cage's sine-wall notch root, which every top/bottom
    sail-bar and C-piece radial offset is referenced from. Depends only on
    bottle_diameter (see generate_sails.py's CAP TOP/CAGE derivation chain --
    cap/collar diameters do not feed into this)."""
    insert_shaft_diameter = bd - 2 * BOTTLE_WALL_T - 2 * INSERT_SHAFT_RADIAL_CLEARANCE
    control_cap_diameter = insert_shaft_diameter + INSERT_SHAFT_TO_CAP_STEP
    cage_inner_cavity_diameter = control_cap_diameter + CAGE_CAP_CLEARANCE
    cage_outer_diameter = cage_inner_cavity_diameter + 2 * CAGE_SIDE_WALL_THICKNESS
    return cage_outer_diameter / 2 - CAGE_NOTCH_DEPTH


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
    formats: Tuple[str, ...] = ("pdf", "scad", "svg")
    job_id: str = ""
    lang: str = "en"


@dataclass(frozen=True)
class SailsDerived:
    top_bar_length: float
    top_bar_width: float
    top_bar_slot_width: float
    top_bar_slot_depth: float
    top_bar_slot_centre_radius: float
    top_bar_axle_hole_d: float

    batten_width: float
    batten_height: float
    batten_notch_depth: float
    batten_notch_height: float
    batten_end_margin: float
    cage_mount_hole_diameter: float
    cage_mount_pitch: float
    cage_mount_upper_from_batten_top: float
    cage_mount_lower_from_batten_top: float
    cage_mount_upper_from_bottom: float
    cage_mount_lower_from_bottom: float
    batten_strengthener_hole_from_bottom: float

    bottom_bar_length: float
    bottom_bar_width: float
    bottom_bar_slot_width: float
    bottom_bar_slot_depth: float
    bottom_bar_inner_overhang: float
    strengthener_rail_slot_offset: float

    strengthener_width: float
    strengthener_height: float
    strengthener_slot_width: float
    strengthener_slot_depth: float
    strengthener_slot_height: float
    strengthener_m6_z: float

    c_piece_length: float
    c_piece_width: float
    c_piece_slot_width: float
    c_piece_slot_depth: float

    sail_inner_radius: float
    sail_top_outer_radius: float
    sail_bottom_outer_radius: float
    sail_height: float


def parse_inputs_from_dict(data: Dict[str, object]) -> SailsInputs:
    """Parse the JSON payload Node sends (snake_case keys, see
    utils/ecojoinerGenerator.js::mapSailsFields)."""

    def get(name, default=None):
        return data[name] if name in data else default

    raw_formats = get("formats", ("pdf", "scad", "svg"))
    if isinstance(raw_formats, str):
        formats = tuple(x.strip().lower() for x in raw_formats.split(",") if x.strip())
    elif isinstance(raw_formats, (list, tuple)):
        formats = tuple(str(x).strip().lower() for x in raw_formats if str(x).strip())
    else:
        formats = ("pdf", "scad", "svg")

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
    sbh = inputs.side_batten_height

    notch_root_r = _cage_notch_root_radius(bd)

    # ---- top sail bar -----------------------------------------------
    top_bar_length = 6 * bd
    top_bar_slot_centre_radius = notch_root_r + TOP_BAR_SLOT_WIDTH / 2

    # ---- batten native Z datums (see generate_sails.py lines ~441-465) ----
    # (side_batten_notch_height - top_sail_bar_thickness)/2 == 0 since both == t.
    batten_top_z = CAGE_TOTAL_HEIGHT + t + BATTEN_END_MARGIN
    batten_bottom_z = batten_top_z - sbh
    cage_surface_under_z = CAGE_TOTAL_HEIGHT - CAGE_SURFACE_THICKNESS   # 44
    cage_slot_vertical_centre_z = cage_surface_under_z / 2              # 22
    cage_wall_tip_z = -CAGE_PEAK_EXTENSION                              # -20
    cage_lower_mount_z = cage_wall_tip_z + CAGE_LOWER_HOLE_FROM_TIP     # -10
    cage_mount_upper_from_bottom = cage_slot_vertical_centre_z - batten_bottom_z
    cage_mount_lower_from_bottom = cage_lower_mount_z - batten_bottom_z
    batten_strengthener_hole_from_bottom = BATTEN_END_MARGIN + t + STRENGTHENER_ABOVE_BAR / 2  # 27+t

    # ---- bottom sail bar / strengthener / C piece radial offsets ----
    bottom_bar_inner_radius = bd / 2 + BOTTLE_CLEARANCE
    bottom_bar_inner_overhang = notch_root_r - bottom_bar_inner_radius
    strengthener_rail_slot_offset = bottom_bar_inner_overhang + BATTEN_THICKNESS
    c_piece_length = bottom_bar_inner_overhang + BATTEN_THICKNESS + C_PIECE_OUTER_EXTENSION
    bottom_bar_length = 3 * bd

    # ---- joint strengthener ----
    strengthener_height = STRENGTHENER_ABOVE_BAR + t + STRENGTHENER_BELOW_BAR  # 39+t
    strengthener_m6_z = STRENGTHENER_BELOW_BAR + t + STRENGTHENER_ABOVE_BAR / 2  # 27+t

    # ---- sail (fabric/mylar) outline ----
    bottom_bar_z = batten_bottom_z + BATTEN_END_MARGIN
    sail_bottom_z = bottom_bar_z + t
    sail_top_z = CAGE_TOTAL_HEIGHT
    sail_inner_radius = top_bar_slot_centre_radius + BATTEN_THICKNESS / 2 + t
    sail_top_outer_radius = 3 * bd
    sail_bottom_outer_radius = bottom_bar_inner_radius + bottom_bar_length

    return SailsDerived(
        top_bar_length=top_bar_length,
        top_bar_width=TOP_BAR_WIDTH,
        top_bar_slot_width=TOP_BAR_SLOT_WIDTH,
        top_bar_slot_depth=TOP_BAR_SLOT_DEPTH,
        top_bar_slot_centre_radius=top_bar_slot_centre_radius,
        top_bar_axle_hole_d=TOP_BAR_AXLE_HOLE_D,
        batten_width=BATTEN_WIDTH,
        batten_height=sbh,
        batten_notch_depth=BATTEN_NOTCH_DEPTH,
        batten_notch_height=t,
        batten_end_margin=BATTEN_END_MARGIN,
        cage_mount_hole_diameter=inputs.cage_mount_hole_diameter,
        cage_mount_pitch=CAGE_MOUNT_PITCH,
        cage_mount_upper_from_batten_top=sbh - cage_mount_upper_from_bottom,
        cage_mount_lower_from_batten_top=sbh - cage_mount_lower_from_bottom,
        cage_mount_upper_from_bottom=cage_mount_upper_from_bottom,
        cage_mount_lower_from_bottom=cage_mount_lower_from_bottom,
        batten_strengthener_hole_from_bottom=batten_strengthener_hole_from_bottom,
        bottom_bar_length=bottom_bar_length,
        bottom_bar_width=BOTTOM_BAR_WIDTH,
        bottom_bar_slot_width=BOTTOM_BAR_SLOT_WIDTH,
        bottom_bar_slot_depth=BOTTOM_BAR_SLOT_DEPTH,
        bottom_bar_inner_overhang=bottom_bar_inner_overhang,
        strengthener_rail_slot_offset=strengthener_rail_slot_offset,
        strengthener_width=STRENGTHENER_WIDTH,
        strengthener_height=strengthener_height,
        strengthener_slot_width=t,
        strengthener_slot_depth=STRENGTHENER_SLOT_DEPTH,
        strengthener_slot_height=t,
        strengthener_m6_z=strengthener_m6_z,
        c_piece_length=c_piece_length,
        c_piece_width=C_PIECE_WIDTH,
        c_piece_slot_width=BATTEN_THICKNESS,
        c_piece_slot_depth=BOTTOM_BAR_SLOT_DEPTH,
        sail_inner_radius=sail_inner_radius,
        sail_top_outer_radius=sail_top_outer_radius,
        sail_bottom_outer_radius=sail_bottom_outer_radius,
        sail_height=sail_top_z - sail_bottom_z,
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

    d = derive_dimensions(inputs)
    checks = [
        (d.bottom_bar_inner_overhang > 0, "Bottle diameter is too large for the cage's radial clearance to the bottom sail bars."),
        (d.sail_top_outer_radius > d.sail_inner_radius, "The top rail leaves no width for the sail."),
        (d.sail_bottom_outer_radius > d.sail_top_outer_radius, "The lower sail rail must extend beyond the upper rail."),
        (d.sail_height > 0, "The sail rails leave no vertical space for the sail - try a taller batten."),
        (
            d.cage_mount_hole_diameter / 2 < d.cage_mount_lower_from_bottom
            and d.cage_mount_upper_from_bottom < d.batten_height - d.cage_mount_hole_diameter / 2,
            "The batten is too short to contain both cage mounting holes.",
        ),
    ]
    for ok, message in checks:
        if not ok:
            errors.append(message)
    return errors


def notices(inputs: SailsInputs) -> List[str]:
    return []


def make_job_slug(inputs: SailsInputs, derived: SailsDerived) -> str:
    brand = _slugify(inputs.bottle_brand)
    job_id = _slugify(inputs.job_id or uuid.uuid4().hex[:8], fallback=uuid.uuid4().hex[:8])
    return f"sails_{brand}_{round(derived.top_bar_length):g}x{round(derived.batten_height):g}_{job_id}"


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


# ---------------------------------------------------------------------------
# Shared 2D profile geometry (used by SVG, DXF and PDF writers alike). Each
# part's "flat" 2D plane matches how it would sit on a saw table: the board
# thickness (wood_thickness, or the fixed 10 mm batten/top-bar-slot
# thickness) is always the part's short/extrusion axis and is NOT one of the
# two drawn dimensions. Where a real part is one of a mirrored pair (both
# battens, both C pieces, both strengtheners, both bottom bars, both sails),
# only one orientation is drawn -- the second is a mirror image, noted in the
# label.
# ---------------------------------------------------------------------------

def _top_bar_outline(d: SailsDerived):
    return (0, 0), (d.top_bar_length, d.top_bar_width)


def _top_bar_notches(d: SailsDerived):
    cx = d.top_bar_length / 2
    return (
        (cx - d.top_bar_slot_centre_radius - d.top_bar_slot_width / 2, 0, d.top_bar_slot_width, d.top_bar_slot_depth),
        (cx + d.top_bar_slot_centre_radius - d.top_bar_slot_width / 2, d.top_bar_width - d.top_bar_slot_depth, d.top_bar_slot_width, d.top_bar_slot_depth),
    )


def _batten_outline(d: SailsDerived):
    return (0, 0), (d.batten_width, d.batten_height)


def _batten_notches(d: SailsDerived, *, sail_type: bool):
    x0 = d.batten_width - d.batten_notch_depth
    notches = [
        (x0, d.batten_end_margin, d.batten_notch_depth, d.batten_notch_height),
    ]
    if sail_type:
        notches.append(
            (x0, d.batten_height - d.batten_end_margin - d.batten_notch_height, d.batten_notch_depth, d.batten_notch_height)
        )
    return notches


def _batten_circles(d: SailsDerived, *, sail_type: bool):
    cx = d.batten_width / 2
    circles = [
        (cx, d.cage_mount_lower_from_bottom, d.cage_mount_hole_diameter),
        (cx, d.cage_mount_upper_from_bottom, d.cage_mount_hole_diameter),
    ]
    if sail_type:
        circles.append((cx, d.batten_strengthener_hole_from_bottom, BATTEN_CAGE_M6_HOLE_D))
    return circles


def _bottom_bar_outline(d: SailsDerived):
    return (0, 0), (d.bottom_bar_length, d.bottom_bar_width)


def _bottom_bar_notches(d: SailsDerived):
    y0 = d.bottom_bar_width - d.bottom_bar_slot_depth
    return (
        (d.bottom_bar_inner_overhang, y0, d.bottom_bar_slot_width, d.bottom_bar_slot_depth),
        (d.strengthener_rail_slot_offset, y0, d.strengthener_slot_width, d.bottom_bar_slot_depth),
    )


def _strengthener_outline(d: SailsDerived):
    return (0, 0), (d.strengthener_width, d.strengthener_height)


def _strengthener_notches(d: SailsDerived):
    return ((0, STRENGTHENER_BELOW_BAR, d.strengthener_slot_depth, d.strengthener_slot_height),)


def _strengthener_circles(d: SailsDerived):
    return ((d.strengthener_width / 2, d.strengthener_m6_z, BATTEN_CAGE_M6_HOLE_D),)


def _c_piece_outline(d: SailsDerived):
    return (0, 0), (d.c_piece_length, d.c_piece_width)


def _c_piece_notches(d: SailsDerived):
    y0 = d.c_piece_width - d.c_piece_slot_depth
    return ((d.bottom_bar_inner_overhang, y0, d.c_piece_slot_width, d.c_piece_slot_depth),)


# The sail itself (a soft-goods trapezoid) is intentionally not drawn on any
# 2D carpenter export - see the module docstring. Its dimensions still live
# in SailsDerived / the manifest for a future dedicated sail generator.


# ---------------------------------------------------------------------------
# SVG
# ---------------------------------------------------------------------------

def write_svg(path: Path, inputs: SailsInputs, d: SailsDerived, *, full_set: bool = True) -> None:
    """Write a 1:1 SVG cutting file for the assembly's 7 part shapes.

    full_set=True draws all physical quantities. full_set=False draws one of
    each shape, quantities noted in the label - same convention as
    back_fin.write_svg()/ballast.write_svg()."""

    margin = 10.0
    gap = 14.0
    widest = max(
        d.top_bar_length, d.bottom_bar_length, d.c_piece_length,
        d.batten_height, d.strengthener_height,
    )
    width = margin * 2 + widest

    def group(y, name, body):
        out = f'  <g id="{name.lower().replace(" ", "_").replace("(", "").replace(")", "")}" transform="translate({margin:.3f} {y:.3f})">\n'
        out += body
        out += _label(0, -3, name)
        out += "  </g>\n"
        return out

    def top_bar_group(y, name):
        body = _rect(0, 0, d.top_bar_length, d.top_bar_width)
        for nx, ny, nw, nh in _top_bar_notches(d):
            body += _rect(nx, ny, nw, nh)
        body += _circle(d.top_bar_length / 2, d.top_bar_width / 2, d.top_bar_axle_hole_d)
        return group(y, name, body)

    def batten_group(y, name, *, sail_type):
        body = _rect(0, 0, d.batten_width, d.batten_height)
        for nx, ny, nw, nh in _batten_notches(d, sail_type=sail_type):
            body += _rect(nx, ny, nw, nh)
        for cx, cy, dia in _batten_circles(d, sail_type=sail_type):
            body += _circle(cx, cy, dia)
        return group(y, name, body)

    def bottom_bar_group(y, name):
        body = _rect(0, 0, d.bottom_bar_length, d.bottom_bar_width)
        for nx, ny, nw, nh in _bottom_bar_notches(d):
            body += _rect(nx, ny, nw, nh)
        return group(y, name, body)

    def strengthener_group(y, name):
        body = _rect(0, 0, d.strengthener_width, d.strengthener_height)
        for nx, ny, nw, nh in _strengthener_notches(d):
            body += _rect(nx, ny, nw, nh)
        for cx, cy, dia in _strengthener_circles(d):
            body += _circle(cx, cy, dia)
        return group(y, name, body)

    def c_piece_group(y, name):
        body = _rect(0, 0, d.c_piece_length, d.c_piece_width)
        for nx, ny, nw, nh in _c_piece_notches(d):
            body += _rect(nx, ny, nw, nh)
        return group(y, name, body)

    # Bars and battens first, longest to shortest; the small joinery parts
    # last. The sail is soft goods and is not exported.
    rows_full = [
        (d.top_bar_width, lambda y: top_bar_group(y, "Top Sail Bar")),
        (d.bottom_bar_width, lambda y: bottom_bar_group(y, "Bottom Sail Bar 1")),
        (d.bottom_bar_width, lambda y: bottom_bar_group(y, "Bottom Sail Bar 2")),
        (d.batten_height, lambda y: batten_group(y, "Sail Batten 1", sail_type=True)),
        (d.batten_height, lambda y: batten_group(y, "Sail Batten 2", sail_type=True)),
        (d.batten_height, lambda y: batten_group(y, "Non-sail Batten 1", sail_type=False)),
        (d.batten_height, lambda y: batten_group(y, "Non-sail Batten 2", sail_type=False)),
        (d.strengthener_height, lambda y: strengthener_group(y, "Joint Strengthener 1")),
        (d.strengthener_height, lambda y: strengthener_group(y, "Joint Strengthener 2")),
        (d.c_piece_width, lambda y: c_piece_group(y, "C End Piece 1")),
        (d.c_piece_width, lambda y: c_piece_group(y, "C End Piece 2")),
    ]
    rows_preview = [
        (d.top_bar_width, lambda y: top_bar_group(y, "Top Sail Bar x1")),
        (d.bottom_bar_width, lambda y: bottom_bar_group(y, "Bottom Sail Bar x2")),
        (d.batten_height, lambda y: batten_group(y, "Sail Batten x2", sail_type=True)),
        (d.batten_height, lambda y: batten_group(y, "Non-sail Batten x2", sail_type=False)),
        (d.strengthener_height, lambda y: strengthener_group(y, "Joint Strengthener x2")),
        (d.c_piece_width, lambda y: c_piece_group(y, "C End Piece x2")),
    ]
    rows = rows_full if full_set else rows_preview

    height = margin + sum(h + gap for h, _ in rows)
    out = _svg_header(width, height, desc=f"Flatpack Sail Apparatus v{DESIGN_VERSION}, 1:1 millimetre geometry")
    out += f'  <metadata>{json.dumps({"version": DESIGN_VERSION, "license": LICENSE_ID})}</metadata>\n'
    y = margin
    for row_h, draw in rows:
        out += draw(y)
        y += row_h + gap
    out += "</svg>\n"
    path.write_text(out, encoding="utf-8")


# ---------------------------------------------------------------------------
# DXF
# ---------------------------------------------------------------------------

def write_dxf(path: Path, inputs: SailsInputs, d: SailsDerived, *, full_set: bool = True) -> None:
    """DXF equivalent of write_svg() - same row layout, DXF entities instead
    of SVG element strings."""
    if ezdxf is None:
        raise RuntimeError("ezdxf is not installed. Install with: pip install ezdxf")

    doc = ezdxf.new(dxfversion="R2010")
    doc.units = ezdxf.units.MM
    _dxf_setup(doc)
    msp = doc.modelspace()

    margin = 10.0
    gap = 14.0

    def top_bar_group(y, name):
        _dxf_rect(msp, 0, y, d.top_bar_length, d.top_bar_width, DXF_CUT_LAYER)
        for nx, ny, nw, nh in _top_bar_notches(d):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        _dxf_circle(msp, d.top_bar_length / 2, y + d.top_bar_width / 2, d.top_bar_axle_hole_d, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def batten_group(y, name, *, sail_type):
        _dxf_rect(msp, 0, y, d.batten_width, d.batten_height, DXF_CUT_LAYER)
        for nx, ny, nw, nh in _batten_notches(d, sail_type=sail_type):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        for cx, cy, dia in _batten_circles(d, sail_type=sail_type):
            _dxf_circle(msp, cx, y + cy, dia, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def bottom_bar_group(y, name):
        _dxf_rect(msp, 0, y, d.bottom_bar_length, d.bottom_bar_width, DXF_CUT_LAYER)
        for nx, ny, nw, nh in _bottom_bar_notches(d):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def strengthener_group(y, name):
        _dxf_rect(msp, 0, y, d.strengthener_width, d.strengthener_height, DXF_CUT_LAYER)
        for nx, ny, nw, nh in _strengthener_notches(d):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        for cx, cy, dia in _strengthener_circles(d):
            _dxf_circle(msp, cx, y + cy, dia, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def c_piece_group(y, name):
        _dxf_rect(msp, 0, y, d.c_piece_length, d.c_piece_width, DXF_CUT_LAYER)
        for nx, ny, nw, nh in _c_piece_notches(d):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    # Bars and battens first, longest to shortest; the small joinery parts
    # last. The sail is soft goods and is not exported.
    rows_full = [
        (d.top_bar_width, lambda y: top_bar_group(y, "Top Sail Bar")),
        (d.bottom_bar_width, lambda y: bottom_bar_group(y, "Bottom Sail Bar 1")),
        (d.bottom_bar_width, lambda y: bottom_bar_group(y, "Bottom Sail Bar 2")),
        (d.batten_height, lambda y: batten_group(y, "Sail Batten 1", sail_type=True)),
        (d.batten_height, lambda y: batten_group(y, "Sail Batten 2", sail_type=True)),
        (d.batten_height, lambda y: batten_group(y, "Non-sail Batten 1", sail_type=False)),
        (d.batten_height, lambda y: batten_group(y, "Non-sail Batten 2", sail_type=False)),
        (d.strengthener_height, lambda y: strengthener_group(y, "Joint Strengthener 1")),
        (d.strengthener_height, lambda y: strengthener_group(y, "Joint Strengthener 2")),
        (d.c_piece_width, lambda y: c_piece_group(y, "C End Piece 1")),
        (d.c_piece_width, lambda y: c_piece_group(y, "C End Piece 2")),
    ]
    rows_preview = [
        (d.top_bar_width, lambda y: top_bar_group(y, "Top Sail Bar x1")),
        (d.bottom_bar_width, lambda y: bottom_bar_group(y, "Bottom Sail Bar x2")),
        (d.batten_height, lambda y: batten_group(y, "Sail Batten x2", sail_type=True)),
        (d.batten_height, lambda y: batten_group(y, "Non-sail Batten x2", sail_type=False)),
        (d.strengthener_height, lambda y: strengthener_group(y, "Joint Strengthener x2")),
        (d.c_piece_width, lambda y: c_piece_group(y, "C End Piece x2")),
    ]
    rows = rows_full if full_set else rows_preview

    y = margin
    for row_h, draw in rows:
        draw(y)
        y += row_h + gap

    doc.saveas(str(path))


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def write_pdf(path: Path, inputs: SailsInputs, d: SailsDerived, *, font_dir: Optional[Path] = None) -> None:
    """One-page Letter landscape carpenter reference for the assembly's 6
    wooden part shapes (the sail is soft goods and is not drawn).

    Every part is rendered at ONE shared scale so thicknesses stay directly
    comparable across the sheet. The bars and battens run horizontally in a
    left-hand column, longest at the top and shortest at the bottom; the two
    small joinery parts (Joint Strengthener, C End Piece) and the derived
    dimensions box sit stacked in the bottom-right corner."""
    if canvas is None:
        raise RuntimeError("ReportLab is not installed. Install with: pip install reportlab")

    title_font, body_font, _mono_font = _register_fonts(font_dir)

    page_w, page_h = landscape(letter)
    c = canvas.Canvas(str(path), pagesize=landscape(letter))
    c.setTitle(f"Flatpack Sail Apparatus v{DESIGN_VERSION}")

    margin = 24
    title_y = page_h - 30
    c.setFont(title_font, 16)
    c.setFillColor(colors.HexColor("#111111"))
    c.drawString(margin, title_y, f"Flatpack Sail Apparatus v{DESIGN_VERSION}")
    c.setFont(body_font, 8)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(margin, title_y - 13, "Reference only - the SVG/DXF exports are the 1:1 cut files. One shared scale; mirrored parts drawn once. The sail is soft goods and is not on this sheet.")

    draw_left = margin
    draw_right = page_w - margin
    draw_top = title_y - 40
    draw_bottom = margin + 6

    # ---- part outline / notch / hole geometry (mm, part-local) -------------
    tb_n1, tb_n2 = _top_bar_notches(d)
    w1, g1 = _rect_open(*tb_n1, "bottom")
    w2, g2 = _rect_open(*tb_n2, "top")
    p0, p1, p2, p3 = (0, 0), (d.top_bar_length, 0), (d.top_bar_length, d.top_bar_width), (0, d.top_bar_width)
    top_bar_edges = [(p0, p1, [g1]), (p1, p2, []), (p2, p3, [g2]), (p3, p0, [])]
    top_bar_walls = [w1, w2]

    def batten_edges_walls(sail_type):
        notches = _batten_notches(d, sail_type=sail_type)
        w_mm, h_mm = d.batten_width, d.batten_height
        p0, p1, p2, p3 = (0, 0), (w_mm, 0), (w_mm, h_mm), (0, h_mm)
        gaps_right, walls = [], []
        for n in notches:
            wall, gap = _rect_open(*n, "right")
            walls.append(wall)
            gaps_right.append(gap)
        edges = [(p0, p1, []), (p1, p2, gaps_right), (p2, p3, []), (p3, p0, [])]
        return edges, walls

    def bottom_bar_edges_walls():
        notches = _bottom_bar_notches(d)
        w_mm, h_mm = d.bottom_bar_length, d.bottom_bar_width
        p0, p1, p2, p3 = (0, 0), (w_mm, 0), (w_mm, h_mm), (0, h_mm)
        walls, gaps_top = [], []
        for n in notches:
            wall, gap = _rect_open(*n, "top")
            walls.append(wall)
            gaps_top.append(gap)
        edges = [(p0, p1, []), (p1, p2, []), (p2, p3, gaps_top), (p3, p0, [])]
        return edges, walls

    def strengthener_edges_walls():
        notches = _strengthener_notches(d)
        w_mm, h_mm = d.strengthener_width, d.strengthener_height
        p0, p1, p2, p3 = (0, 0), (w_mm, 0), (w_mm, h_mm), (0, h_mm)
        walls, gaps_left = [], []
        for n in notches:
            wall, gap = _rect_open(*n, "left")
            walls.append(wall)
            gaps_left.append(gap)
        edges = [(p0, p1, []), (p1, p2, []), (p2, p3, []), (p3, p0, gaps_left)]
        return edges, walls

    def c_piece_edges_walls():
        notches = _c_piece_notches(d)
        w_mm, h_mm = d.c_piece_length, d.c_piece_width
        p0, p1, p2, p3 = (0, 0), (w_mm, 0), (w_mm, h_mm), (0, h_mm)
        walls, gaps_top = [], []
        for n in notches:
            wall, gap = _rect_open(*n, "top")
            walls.append(wall)
            gaps_top.append(gap)
        edges = [(p0, p1, []), (p1, p2, []), (p2, p3, gaps_top), (p3, p0, [])]
        return edges, walls

    sail_batten_edges, sail_batten_walls = batten_edges_walls(True)
    non_sail_batten_edges, non_sail_batten_walls = batten_edges_walls(False)
    bottom_bar_edges, bottom_bar_walls = bottom_bar_edges_walls()
    strengthener_edges, strengthener_walls = strengthener_edges_walls()
    c_piece_edges, c_piece_walls = c_piece_edges_walls()

    # The battens are drawn rotated 90deg so their length runs across the
    # page like the bars; w_mm/h_mm below are still the part-local axes and
    # prepare() applies the rotation.
    top_bar = {
        "name": "Top Sail Bar (x1)", "w_mm": d.top_bar_length, "h_mm": d.top_bar_width, "rotate": False,
        "edges": top_bar_edges, "notches": top_bar_walls,
        "circles": [(d.top_bar_length / 2, d.top_bar_width / 2, d.top_bar_axle_hole_d)],
    }
    bottom_bar = {
        "name": "Bottom Sail Bar (x2)", "w_mm": d.bottom_bar_length, "h_mm": d.bottom_bar_width, "rotate": False,
        "edges": bottom_bar_edges, "notches": bottom_bar_walls, "circles": [],
    }
    sail_batten = {
        "name": "Sail Batten (x2)", "w_mm": d.batten_width, "h_mm": d.batten_height, "rotate": True,
        "edges": sail_batten_edges, "notches": sail_batten_walls,
        "circles": _batten_circles(d, sail_type=True),
    }
    non_sail_batten = {
        "name": "Non-sail Batten (x2)", "w_mm": d.batten_width, "h_mm": d.batten_height, "rotate": True,
        "edges": non_sail_batten_edges, "notches": non_sail_batten_walls,
        "circles": _batten_circles(d, sail_type=False),
    }
    strengthener = {
        "name": "Joint Strengthener (x2)", "w_mm": d.strengthener_width, "h_mm": d.strengthener_height, "rotate": False,
        "edges": strengthener_edges, "notches": strengthener_walls, "circles": list(_strengthener_circles(d)),
    }
    c_piece = {
        "name": "C End Piece (x2)", "w_mm": d.c_piece_length, "h_mm": d.c_piece_width, "rotate": False,
        "edges": c_piece_edges, "notches": c_piece_walls, "circles": [],
    }

    def prepare(part):
        h_mm = part["h_mm"]
        rotate = part["rotate"]

        def r(p):
            return _rot_point(p[0], p[1], h_mm) if rotate else p

        return {
            **part,
            "eff_w": h_mm if rotate else part["w_mm"],
            "eff_h": part["w_mm"] if rotate else h_mm,
            "edges": [(r(p1), r(p2), [(r(g1), r(g2)) for g1, g2 in gaps]) for p1, p2, gaps in part["edges"]],
            "notches": [[r(p) for p in wall] for wall in part["notches"]],
            "circles": [(*r((cx, cy)), dia) for cx, cy, dia in part["circles"]],
        }

    # Column of horizontal bars/battens, longest effective width first.
    column = sorted(
        (prepare(top_bar), prepare(bottom_bar), prepare(sail_batten), prepare(non_sail_batten)),
        key=lambda p: p["eff_w"], reverse=True,
    )
    corner = [prepare(strengthener), prepare(c_piece)]

    label_h = 12       # part title, above the shape
    dim_h = 15         # dimension line + label, below the shape
    row_gap = 14       # minimum vertical gap between stacked parts
    left_pad = 34      # clearance for the left (height) dimension line
    box_w, box_h = 250.0, 106.0

    # ---- one shared mm -> pt scale --------------------------------------
    # Width-limited by the longest part (the top bar); every part is then
    # drawn at that same scale so board thicknesses stay comparable.
    avail_w = draw_right - draw_left - left_pad - 6
    avail_h = draw_top - draw_bottom
    scale = avail_w / max(p["eff_w"] for p in column)

    # Safety clamp: the bottom-right stack (Strengthener over C End Piece
    # over the derived-dimensions box) must still fit the page height.
    corner_fixed = box_h + 2 * row_gap + 2 * (label_h + dim_h)
    corner_var = sum(p["eff_h"] for p in corner)
    if corner_var * scale + corner_fixed > avail_h:
        scale = min(scale, (avail_h - corner_fixed) / corner_var)

    def draw_part(part, ox, oy):
        c.setFont(title_font, 6.5)
        c.setFillColor(colors.HexColor("#222222"))
        c.drawString(ox, oy + part["eff_h"] * scale + 5, part["name"])
        _draw_edges(c, part["edges"], ox, oy, scale, stroke_color=colors.HexColor("#333333"), line_width=0.7)
        for wall in part["notches"]:
            _draw_open_path(c, wall, ox, oy, scale, stroke_color=colors.HexColor("#999999"), line_width=0.5)
        for cx, cy, dia in part["circles"]:
            c.setStrokeColor(colors.HexColor("#999999"))
            c.setLineWidth(0.5)
            c.circle(ox + cx * scale, oy + cy * scale, (dia / 2) * scale, stroke=1, fill=0)
        _draw_dimension_line(
            c, ox, oy - 11, ox + part["eff_w"] * scale, oy - 11,
            f"{_ceil_mm(part['eff_w'])}mm", font=body_font, size=5,
        )
        _draw_dimension_line(
            c, ox - 8, oy, ox - 8, oy + part["eff_h"] * scale,
            f"{_ceil_mm(part['eff_h'])}mm", font=body_font, size=5, label_side="left", rotate_label=True,
        )

    # Left-hand column of bars/battens, spread evenly down the page. The
    # footer strip at the bottom is kept clear.
    ox = draw_left + left_pad
    col_bottom = draw_bottom + 22
    natural = sum(label_h + p["eff_h"] * scale + dim_h for p in column)
    slack = (draw_top - col_bottom) - natural
    gap_between = max(row_gap, slack / max(1, len(column) - 1))
    y = draw_top
    for n, part in enumerate(column):
        oy = y - label_h - part["eff_h"] * scale
        draw_part(part, ox, oy)
        y = oy - dim_h
        if n < len(column) - 1:
            y -= gap_between

    # Bottom-right corner: Joint Strengthener above C End Piece above the
    # derived-dimensions box, all anchored to the page's bottom-right.
    # `corner` is [strengthener, c_piece]; draw C End Piece nearest the box.
    box_x = draw_right - box_w
    corner_x = box_x + 14
    cy = draw_bottom + box_h + row_gap + dim_h
    for part in (corner[1], corner[0]):
        draw_part(part, corner_x, cy)
        cy += part["eff_h"] * scale + label_h + row_gap + dim_h

    input_lines = [
        f"Wood thickness {_ceil_mm(inputs.wood_thickness)}mm   Bottle Ø {_ceil_mm(inputs.bottle_diameter)}mm",
        f"Batten height {_ceil_mm(d.batten_height)}mm",
        f"Top sail bar {_ceil_mm(d.top_bar_length)} x {_ceil_mm(d.top_bar_width)}mm",
        f"Bottom sail bar {_ceil_mm(d.bottom_bar_length)} x {_ceil_mm(d.bottom_bar_width)}mm",
        f"Joint strengthener {_ceil_mm(d.strengthener_width)} x {_ceil_mm(d.strengthener_height)}mm",
        f"C end piece {_ceil_mm(d.c_piece_length)} x {_ceil_mm(d.c_piece_width)}mm",
        f"Cage holes Ø{_ceil_mm(d.cage_mount_hole_diameter)} @ {_ceil_mm(d.cage_mount_lower_from_bottom)}/{_ceil_mm(d.cage_mount_upper_from_bottom)}mm from foot",
        f"Strengthener/batten M6 Ø{_ceil_mm(BATTEN_CAGE_M6_HOLE_D)}mm",
    ]
    _rounded_rect_text(c, box_x, draw_bottom, box_w, box_h, "Derived dimensions", input_lines, title_font, body_font)

    c.setFont(body_font, 6)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(draw_left, draw_bottom + 4, f"CERN-OHL-S-2.0. Design version {DESIGN_VERSION}. https://hopeturtles.org/turtles/generate")

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def generate(
    inputs: SailsInputs,
    output_root: Path,
    public_url_prefix: str = "/ecojoiner_exports",
    font_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Validate and write the requested files. Same manifest contract as
    back_fin.generate()/ballast.generate()."""

    errors = validate_inputs(inputs)
    if errors:
        return {"ok": False, "errors": errors}

    d = derive_dimensions(inputs)
    slug = make_job_slug(inputs, d)
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

    if "svg" in inputs.formats:
        svg_path = job_dir / f"{slug}_full_set_1to1.svg"
        write_svg(svg_path, inputs, d, full_set=True)
        files.append(GeneratedFile("svg", "1:1 SVG full-set cutting file", str(svg_path), f"{public_url_prefix}/{slug}/{svg_path.name}"))

        preview_svg_path = job_dir / f"{slug}_one_each_1to1.svg"
        write_svg(preview_svg_path, inputs, d, full_set=False)
        files.append(GeneratedFile("svg", "1:1 SVG one-each layout", str(preview_svg_path), f"{public_url_prefix}/{slug}/{preview_svg_path.name}"))

    if "dxf" in inputs.formats:
        dxf_path = job_dir / f"{slug}_full_set_1to1.dxf"
        write_dxf(dxf_path, inputs, d, full_set=True)
        files.append(GeneratedFile("dxf", "1:1 DXF full-set cutting file", str(dxf_path), f"{public_url_prefix}/{slug}/{dxf_path.name}"))

        preview_dxf_path = job_dir / f"{slug}_one_each_1to1.dxf"
        write_dxf(preview_dxf_path, inputs, d, full_set=False)
        files.append(GeneratedFile("dxf", "1:1 DXF one-each layout", str(preview_dxf_path), f"{public_url_prefix}/{slug}/{preview_dxf_path.name}"))

    if "pdf" in inputs.formats:
        pdf_path = job_dir / f"{slug}_carpenter_sheet.pdf"
        write_pdf(pdf_path, inputs, d, font_dir=font_dir)
        files.append(GeneratedFile("pdf", "Letter PDF carpenter sheet", str(pdf_path), f"{public_url_prefix}/{slug}/{pdf_path.name}"))

    manifest = {**common, "files": [asdict(f) for f in files]}
    manifest_path = job_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(manifest_path)
    manifest["manifest_url"] = f"{public_url_prefix}/{slug}/manifest.json"
    return manifest
