"""Back Fin (rear-fin + bottle-holder shafts + solar-panel holder) object.

Geometry and validation are ported from the standalone reference script
ecojoiner/back_fin_generator.py, which remains the source of truth for the
.scad output (write_scad() below calls its build_scad() directly). This
module adds the JSON-manifest/job-folder contract the rest of the pipeline
expects (see ecojoiner/objects/six_fc.py for the pattern) plus new SVG/DXF/
PDF carpenter-file writers for the fin's four flat parts, since the
reference script only ever produced a 3D .scad file.
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
    _polygon,
    _label,
    DXF_CUT_LAYER,
    _dxf_setup,
    _dxf_rect,
    _dxf_circle,
    _dxf_polygon,
    _dxf_label,
    _register_fonts,
    _draw_dimension_line,
    _rounded_rect_text,
    _rot_point,
    _rect_open,
    _draw_edge_with_gaps,
    _draw_edges,
    _draw_open_path,
    _rect_edges_with_gaps,
    colors,
    letter,
    canvas,
    ezdxf,
)
from back_fin_generator import DEFAULTS as _BF_DEFAULTS, TUNING as _BF_TUNING, build_scad as _bf_build_scad

PART_QUANTITIES = {
    "Rear Fin": 1,
    "Bottle Holder Shaft": 2,
    "Solar Panel Holder": 1,
}


@dataclass(frozen=True)
class BackFinInputs:
    """Raw values for the back fin, after parsing.

    The first 9 fields come straight from the bottle/board/solar-panel form
    fields (Panels 2-4 of /ecojoiners/generate). The remaining 6 are fixed
    joinery tuning constants from back_fin_generator.TUNING - not exposed in
    the form, same tier as the 6FC object's hidden screw_diameter/
    fit_clearance overrides.
    """

    cap_diameter: float = _BF_DEFAULTS["cap_diameter"]
    wood_thickness: float = _BF_DEFAULTS["wood_thickness"]
    bottle_height: float = _BF_DEFAULTS["bottle_height"]
    cap_height: float = _BF_DEFAULTS["cap_height"]
    bottle_diameter: float = _BF_DEFAULTS["bottle_diameter"]
    solar_panel_width: float = _BF_DEFAULTS["solar_panel_width"]
    solar_panel_height: float = _BF_DEFAULTS["solar_panel_height"]
    solar_panel_thickness: float = _BF_DEFAULTS["solar_panel_thickness"]
    fin_board_width: float = _BF_DEFAULTS["fin_board_width"]

    half_lap_clearance: float = _BF_TUNING["half_lap_clearance"]
    solar_slot_clearance: float = _BF_TUNING["solar_slot_clearance"]
    shaft_width: float = _BF_TUNING["shaft_width"]
    shaft_hole_diameter: float = _BF_TUNING["shaft_hole_diameter"]
    shaft_hole_from_front: float = _BF_TUNING["shaft_hole_from_front"]
    fin_rear_tab_width: float = _BF_TUNING["fin_rear_tab_width"]

    bottle_brand: str = "generic"
    formats: Tuple[str, ...] = ("pdf", "scad", "svg")
    job_id: str = ""
    lang: str = "en"


@dataclass(frozen=True)
class BackFinDerived:
    fin_width: float
    fin_height: float
    fin_diagonal_rise: float
    fin_diagonal_run: float
    shaft_length: float
    shaft_rear_x: float
    shaft_front_x: float
    joint_slot_depth: float
    joint_meet_x: float
    joint_slot_opening: float
    upper_shaft_z0: float
    lower_shaft_z0: float
    solar_holder_length: float
    solar_holder_height: float
    solar_chamfer: float
    solar_slot_depth: float
    solar_meet_z: float
    fin_solar_notch_x0: float
    solar_slot_width: float
    shaft_notch_u0: float
    shaft_notch_width: float
    shaft_notch_v0: float
    shaft_notch_height: float


def parse_inputs_from_dict(data: Dict[str, object]) -> BackFinInputs:
    """Parse the JSON payload Node sends. Node already sends ready-to-use
    snake_case keys (see utils/ecojoinerGenerator.js::mapBackFinFields), so
    unlike six_fc.parse_inputs_from_dict() no camelCase fallback is needed.
    """

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
    for key, default in _BF_DEFAULTS.items():
        kwargs[key] = _to_float(get(key), default)
    for key, default in _BF_TUNING.items():
        kwargs[key] = _to_float(get(key), default)

    return BackFinInputs(
        **kwargs,
        bottle_brand=str(get("bottle_brand", "generic") or "generic"),
        formats=formats,
        job_id=str(get("job_id", "") or ""),
        lang=str(get("lang", "en") or "en").lower(),
    )


def derive_dimensions(inputs: BackFinInputs) -> BackFinDerived:
    t = inputs.wood_thickness
    fin_width = inputs.fin_board_width + inputs.fin_rear_tab_width
    fin_height = 3 * inputs.bottle_diameter
    fin_diagonal_rise = fin_diagonal_run = 2 * inputs.bottle_diameter / 3
    shaft_length = (
        inputs.bottle_height
        + (2 / 3) * (inputs.fin_board_width - 2 * t)
        - inputs.cap_height
    )
    solar_holder_length = inputs.solar_panel_width
    solar_holder_height = 3 * t
    solar_chamfer = 1.5 * t
    solar_slot_depth = solar_holder_height / 2
    fin_solar_notch_x0 = fin_width - 2 * t
    shaft_rear_x = fin_solar_notch_x0
    shaft_front_x = shaft_rear_x - shaft_length
    joint_slot_depth = joint_meet_x = shaft_rear_x / 2
    joint_slot_opening = t + inputs.half_lap_clearance
    upper_shaft_z0 = fin_height - 3 * t
    lower_shaft_z0 = upper_shaft_z0 - inputs.bottle_diameter - t
    solar_meet_z = upper_shaft_z0 + solar_slot_depth
    solar_slot_width = t + inputs.solar_slot_clearance

    # Rear-edge notch on the bottle holder shaft, in shaft-local coordinates
    # (u=0 at the shaft's front edge, v=0 at its bottom edge). See
    # back_fin_generator.py:122-126 for the absolute-coordinate original.
    shaft_notch_width = joint_slot_depth + inputs.half_lap_clearance / 2
    shaft_notch_u0 = shaft_length - shaft_notch_width
    shaft_notch_height = joint_slot_opening
    shaft_notch_v0 = inputs.shaft_width / 2 - joint_slot_opening / 2

    return BackFinDerived(
        fin_width=fin_width,
        fin_height=fin_height,
        fin_diagonal_rise=fin_diagonal_rise,
        fin_diagonal_run=fin_diagonal_run,
        shaft_length=shaft_length,
        shaft_rear_x=shaft_rear_x,
        shaft_front_x=shaft_front_x,
        joint_slot_depth=joint_slot_depth,
        joint_meet_x=joint_meet_x,
        joint_slot_opening=joint_slot_opening,
        upper_shaft_z0=upper_shaft_z0,
        lower_shaft_z0=lower_shaft_z0,
        solar_holder_length=solar_holder_length,
        solar_holder_height=solar_holder_height,
        solar_chamfer=solar_chamfer,
        solar_slot_depth=solar_slot_depth,
        solar_meet_z=solar_meet_z,
        fin_solar_notch_x0=fin_solar_notch_x0,
        solar_slot_width=solar_slot_width,
        shaft_notch_u0=shaft_notch_u0,
        shaft_notch_width=shaft_notch_width,
        shaft_notch_v0=shaft_notch_v0,
        shaft_notch_height=shaft_notch_height,
    )


def validate_inputs(inputs: BackFinInputs) -> List[str]:
    """Real-world/geometric sanity checks. Ported from the reference script's
    validate() (back_fin_generator.py:232-260), which raised on the first
    failure - here every failing check is collected, matching six_fc's
    validate_inputs() contract."""

    errors: List[str] = []

    positive_fields = [
        ("wood_thickness", inputs.wood_thickness, "Wood thickness"),
        ("cap_diameter", inputs.cap_diameter, "Cap diameter"),
        ("bottle_diameter", inputs.bottle_diameter, "Bottle diameter"),
        ("bottle_height", inputs.bottle_height, "Bottle height"),
        ("cap_height", inputs.cap_height, "Cap height"),
        ("fin_board_width", inputs.fin_board_width, "Board width"),
        ("solar_panel_width", inputs.solar_panel_width, "Solar panel width"),
        ("solar_panel_height", inputs.solar_panel_height, "Solar panel height"),
        ("solar_panel_thickness", inputs.solar_panel_thickness, "Solar panel thickness"),
        ("shaft_width", inputs.shaft_width, "Shaft width"),
        ("shaft_hole_diameter", inputs.shaft_hole_diameter, "Shaft hole diameter"),
        ("shaft_hole_from_front", inputs.shaft_hole_from_front, "Shaft hole position"),
        ("fin_rear_tab_width", inputs.fin_rear_tab_width, "Fin rear tab width"),
    ]
    for _, value, label in positive_fields:
        if value is None or value <= 0:
            errors.append(f"{label} must be greater than 0.")
    if inputs.half_lap_clearance < 0:
        errors.append("Joinery clearance must be zero or greater.")
    if inputs.solar_slot_clearance < 0:
        errors.append("Solar slot clearance must be zero or greater.")

    if errors:
        # Downstream geometry (derive_dimensions) assumes every field above
        # is a usable positive number, so stop here rather than risk a
        # ZeroDivisionError or nonsense derived value.
        return errors

    t = inputs.wood_thickness
    c = inputs.half_lap_clearance
    s = inputs.solar_slot_clearance
    d = derive_dimensions(inputs)

    checks = [
        (inputs.bottle_height > inputs.cap_height, "Bottle height must be greater than cap height."),
        (inputs.fin_board_width > 2 * t, "Board width must be greater than twice the wood thickness."),
        (d.shaft_front_x < 0 and d.joint_slot_depth > c / 2, "These measurements don't leave enough joint overlap between the fin and its shafts."),
        (inputs.shaft_width > t + c, "Shaft width must be greater than the wood thickness plus clearance."),
        (c < min(t, inputs.bottle_diameter), "Joinery clearance is too large for this wood thickness."),
        (d.lower_shaft_z0 - c / 2 >= d.fin_diagonal_rise, "The lower shaft joint would land on the fin's diagonal edge - try a larger bottle diameter or board width."),
        (d.fin_width > d.fin_diagonal_run, "Board width is too small for the fin's diagonal edge."),
        (s < t and d.shaft_rear_x > s / 2, "Solar slot clearance leaves too little fin material."),
        (inputs.solar_panel_width > 4 * t + s, "Solar panel width is too narrow for the holder's slot and chamfers."),
        (inputs.shaft_width > inputs.shaft_hole_diameter, "Shaft width must be greater than the shaft hole diameter."),
        (
            inputs.shaft_hole_from_front > inputs.shaft_hole_diameter / 2
            and d.shaft_front_x + inputs.shaft_hole_from_front + inputs.shaft_hole_diameter / 2 < 0,
            "The shaft hole must sit inside the forward, unjointed part of the shaft.",
        ),
    ]
    for ok, message in checks:
        if not ok:
            errors.append(message)
    return errors


def make_job_slug(inputs: BackFinInputs, derived: BackFinDerived) -> str:
    brand = _slugify(inputs.bottle_brand)
    job_id = _slugify(inputs.job_id or uuid.uuid4().hex[:8], fallback=uuid.uuid4().hex[:8])
    return f"backfin_{brand}_{round(derived.fin_width):g}x{round(derived.fin_height):g}_{job_id}"


# ---------------------------------------------------------------------------
# SCAD - delegates straight to the validated reference generator
# ---------------------------------------------------------------------------

def write_scad(path: Path, inputs: BackFinInputs, d: BackFinDerived) -> None:
    overrides = {key: getattr(inputs, key) for key in _BF_DEFAULTS}
    overrides.update({key: getattr(inputs, key) for key in _BF_TUNING})
    path.write_text(_bf_build_scad(overrides), encoding="utf-8")


# ---------------------------------------------------------------------------
# SVG
# ---------------------------------------------------------------------------

def _fin_notches(inputs: BackFinInputs, d: BackFinDerived):
    return [
        (0.0, d.upper_shaft_z0 - inputs.half_lap_clearance / 2, d.joint_meet_x + inputs.half_lap_clearance / 2, d.joint_slot_opening),
        (0.0, d.lower_shaft_z0 - inputs.half_lap_clearance / 2, d.joint_meet_x + inputs.half_lap_clearance / 2, d.joint_slot_opening),
        (d.fin_solar_notch_x0 - inputs.solar_slot_clearance / 2, d.solar_meet_z - inputs.solar_slot_clearance / 2, d.solar_slot_width, d.fin_height - d.solar_meet_z + inputs.solar_slot_clearance / 2),
    ]


def _fin_outline(d: BackFinDerived):
    return [(0, d.fin_diagonal_rise), (d.fin_diagonal_run, 0), (d.fin_width, 0), (d.fin_width, d.fin_height), (0, d.fin_height)]


def write_svg(path: Path, inputs: BackFinInputs, d: BackFinDerived, *, full_set: bool = True) -> None:
    """Write a 1:1 SVG cutting file for the fin's 4 parts.

    full_set=True draws all physical quantities (Rear Fin x1, Bottle Holder
    Shaft x2, Solar Panel Holder x1). full_set=False draws one of each,
    the shaft labeled "x2" - same convention as six_fc.write_svg().
    """
    margin = 10.0
    gap = 14.0
    width = margin * 2 + max(d.fin_width, d.shaft_length, d.solar_holder_length)

    def fin_group(y, name):
        out = f'  <g id="{name.lower().replace(" ", "_")}" transform="translate({margin:.3f} {y:.3f})">\n'
        out += _polygon(_fin_outline(d))
        for nx, ny, nw, nh in _fin_notches(inputs, d):
            out += _rect(nx, ny, nw, nh)
        out += _label(0, -3, name)
        out += "  </g>\n"
        return out

    def shaft_group(y, name):
        out = f'  <g id="{name.lower().replace(" ", "_")}" transform="translate({margin:.3f} {y:.3f})">\n'
        out += _rect(0, 0, d.shaft_length, inputs.shaft_width)
        out += _circle(inputs.shaft_hole_from_front, inputs.shaft_width / 2, inputs.shaft_hole_diameter)
        out += _rect(d.shaft_notch_u0, d.shaft_notch_v0, d.shaft_notch_width, d.shaft_notch_height)
        out += _label(0, -3, name)
        out += "  </g>\n"
        return out

    def solar_group(y, name):
        out = f'  <g id="{name.lower().replace(" ", "_")}" transform="translate({margin:.3f} {y:.3f})">\n'
        out += _rect(0, 0, d.solar_holder_length, d.solar_holder_height)
        out += _polygon([(0, 0), (d.solar_chamfer, 0), (0, d.solar_chamfer)])
        out += _polygon([(d.solar_holder_length, 0), (d.solar_holder_length - d.solar_chamfer, 0), (d.solar_holder_length, d.solar_chamfer)])
        out += _rect((d.solar_holder_length - d.solar_slot_width) / 2, 0, d.solar_slot_width, d.solar_slot_depth + inputs.solar_slot_clearance / 2)
        out += _label(0, -3, name)
        out += "  </g>\n"
        return out

    rows = []
    if full_set:
        rows.append((d.fin_height, lambda y: fin_group(y, "Rear Fin")))
        rows.append((inputs.shaft_width, lambda y: shaft_group(y, "Bottle Holder Shaft 1")))
        rows.append((inputs.shaft_width, lambda y: shaft_group(y, "Bottle Holder Shaft 2")))
        rows.append((d.solar_holder_height, lambda y: solar_group(y, "Solar Panel Holder")))
    else:
        rows.append((d.fin_height, lambda y: fin_group(y, "Rear Fin")))
        rows.append((inputs.shaft_width, lambda y: shaft_group(y, "Bottle Holder Shaft x2")))
        rows.append((d.solar_holder_height, lambda y: solar_group(y, "Solar Panel Holder")))

    height = margin + sum(h + gap for h, _ in rows)

    out = _svg_header(width, height, desc=f"Flatpack Ecojoiner Back Fin v{DESIGN_VERSION}, 1:1 millimetre geometry")
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

def write_dxf(path: Path, inputs: BackFinInputs, d: BackFinDerived, *, full_set: bool = True) -> None:
    """DXF equivalent of write_svg() - same row layout, DXF entities instead
    of SVG element strings. See six_fc.write_dxf() for the same pattern."""
    if ezdxf is None:
        raise RuntimeError("ezdxf is not installed. Install with: pip install ezdxf")

    doc = ezdxf.new(dxfversion="R2010")
    doc.units = ezdxf.units.MM
    _dxf_setup(doc)
    msp = doc.modelspace()

    margin = 10.0
    gap = 14.0

    def fin_group(y, name):
        out_points = [(x, y0 + y) for x, y0 in _fin_outline(d)]
        _dxf_polygon(msp, out_points, DXF_CUT_LAYER)
        for nx, ny, nw, nh in _fin_notches(inputs, d):
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def shaft_group(y, name):
        _dxf_rect(msp, 0, y, d.shaft_length, inputs.shaft_width, DXF_CUT_LAYER)
        _dxf_circle(msp, inputs.shaft_hole_from_front, y + inputs.shaft_width / 2, inputs.shaft_hole_diameter, DXF_CUT_LAYER)
        _dxf_rect(msp, d.shaft_notch_u0, y + d.shaft_notch_v0, d.shaft_notch_width, d.shaft_notch_height, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    def solar_group(y, name):
        _dxf_rect(msp, 0, y, d.solar_holder_length, d.solar_holder_height, DXF_CUT_LAYER)
        _dxf_polygon(msp, [(0, y), (d.solar_chamfer, y), (0, y + d.solar_chamfer)], DXF_CUT_LAYER)
        _dxf_polygon(msp, [(d.solar_holder_length, y), (d.solar_holder_length - d.solar_chamfer, y), (d.solar_holder_length, y + d.solar_chamfer)], DXF_CUT_LAYER)
        _dxf_rect(msp, (d.solar_holder_length - d.solar_slot_width) / 2, y, d.solar_slot_width, d.solar_slot_depth + inputs.solar_slot_clearance / 2, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)

    rows = []
    if full_set:
        rows.append((d.fin_height, lambda y: fin_group(y, "Rear Fin")))
        rows.append((inputs.shaft_width, lambda y: shaft_group(y, "Bottle Holder Shaft 1")))
        rows.append((inputs.shaft_width, lambda y: shaft_group(y, "Bottle Holder Shaft 2")))
        rows.append((d.solar_holder_height, lambda y: solar_group(y, "Solar Panel Holder")))
    else:
        rows.append((d.fin_height, lambda y: fin_group(y, "Rear Fin")))
        rows.append((inputs.shaft_width, lambda y: shaft_group(y, "Bottle Holder Shaft x2")))
        rows.append((d.solar_holder_height, lambda y: solar_group(y, "Solar Panel Holder")))

    y = margin
    for row_h, draw in rows:
        draw(y)
        y += row_h + gap

    doc.saveas(str(path))


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def _fin_edges_with_gaps(inputs: BackFinInputs, d: BackFinDerived):
    notches = list(_fin_notches(inputs, d))
    left_gaps = [_rect_open(*notches[i], "left")[1] for i in (0, 1)]
    top_gaps = [_rect_open(*notches[2], "top")[1]]
    p0, p1, p2, p3, p4 = _fin_outline(d)
    return [(p0, p1, []), (p1, p2, []), (p2, p3, []), (p3, p4, top_gaps), (p4, p0, left_gaps)]


def _solar_edges_with_gaps(inputs: BackFinInputs, d: BackFinDerived):
    """Hexagon outline with the two 45-degree corner chamfers baked in as
    real edges (not a rectangle plus overlapping corner triangles), so the
    chamfer cut reads as one line instead of a line laid over a corner."""
    h0, h1 = (0, d.solar_chamfer), (d.solar_chamfer, 0)
    h2, h3 = (d.solar_holder_length - d.solar_chamfer, 0), (d.solar_holder_length, d.solar_chamfer)
    h4, h5 = (d.solar_holder_length, d.solar_holder_height), (0, d.solar_holder_height)
    notch = (
        (d.solar_holder_length - d.solar_slot_width) / 2, 0,
        d.solar_slot_width, d.solar_slot_depth + inputs.solar_slot_clearance / 2,
    )
    bottom_gap = _rect_open(*notch, "bottom")[1]
    return [(h0, h1, []), (h1, h2, [bottom_gap]), (h2, h3, []), (h3, h4, []), (h4, h5, []), (h5, h0, [])]


def write_pdf(path: Path, inputs: BackFinInputs, d: BackFinDerived, *, font_dir: Optional[Path] = None) -> None:
    """One-page Letter portrait carpenter reference for the fin's 4 parts.

    The Bottle Holder Shaft and Solar Panel Holder are long, thin parts, so
    they're rotated 90 degrees for this reference drawing (their SVG/DXF
    exports are unrotated) to make use of the page's full vertical space.
    All three parts share one scale so they stay size-comparable to each
    other. English-only for this first pass - the 6FC PDF's full
    per-language T() table is out of scope to replicate here yet.
    """
    if canvas is None:
        raise RuntimeError("ReportLab is not installed. Install with: pip install reportlab")

    title_font, body_font, _mono_font = _register_fonts(font_dir)

    page_w, page_h = letter
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(f"Flatpack Ecojoiner Back Fin v{DESIGN_VERSION}")

    margin = 28
    title_y = page_h - 34
    c.setFont(title_font, 20)
    c.setFillColor(colors.HexColor("#111111"))
    c.drawString(margin, title_y, f"Flatpack Ecojoiner - Back Fin v{DESIGN_VERSION}")
    c.setFont(body_font, 9)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(margin, title_y - 16, "Reference sheet only - the SVG/DXF exports are the 1:1 cut files.")
    c.drawString(margin, title_y - 28, "Bottle Holder Shaft and Solar Panel Holder are rotated 90deg here to fit the page.")

    # Drawing area: 3 columns sharing the page's full width, each part
    # scaled identically (see the shared `scale` computed below) so the
    # parts stay size-comparable to each other. Diagrams hang from a
    # shared top line rather than a shared baseline, since the smallest
    # part (the solar panel holder, rightmost) then leaves open space at
    # the bottom of its own column for the input/derived-dimension boxes.
    draw_left = margin
    draw_right = page_w - margin
    draw_top = title_y - 44
    draw_bottom = 40
    diagram_top = draw_top - 20
    dim_line_reserve = 26  # room below each shape for its width dimension line
    avail_h = diagram_top - draw_bottom - dim_line_reserve

    # Column padding: fixed space reserved to the left of each drawing (for
    # its vertical dimension line + label) and a small gap to the right,
    # before the next column starts.
    col_left_pad = 40
    col_right_pad = 10
    col_gap = 16

    parts_raw = [
        {
            "name": "Bottle Holder Shaft (x2)",
            "w_mm": d.shaft_length,
            "h_mm": inputs.shaft_width,
            "rotate": True,
            "edges": _rect_edges_with_gaps(
                0, 0, d.shaft_length, inputs.shaft_width,
                {"right": [(d.shaft_notch_u0, d.shaft_notch_v0, d.shaft_notch_width, d.shaft_notch_height)]},
            ),
            "notches": [
                _rect_open(d.shaft_notch_u0, d.shaft_notch_v0, d.shaft_notch_width, d.shaft_notch_height, "right")[0],
            ],
            "circles": [(inputs.shaft_hole_from_front, inputs.shaft_width / 2, inputs.shaft_hole_diameter)],
        },
        {
            "name": "Rear Fin",
            "w_mm": d.fin_width,
            "h_mm": d.fin_height,
            "rotate": False,
            "edges": _fin_edges_with_gaps(inputs, d),
            "notches": [
                _rect_open(nx, ny, nw, nh, "top" if i == 2 else "left")[0]
                for i, (nx, ny, nw, nh) in enumerate(_fin_notches(inputs, d))
            ],
            "circles": [],
        },
        {
            "name": "Solar Panel Holder",
            "w_mm": d.solar_holder_length,
            "h_mm": d.solar_holder_height,
            "rotate": True,
            "edges": _solar_edges_with_gaps(inputs, d),
            "notches": [
                _rect_open(
                    (d.solar_holder_length - d.solar_slot_width) / 2, 0,
                    d.solar_slot_width, d.solar_slot_depth + inputs.solar_slot_clearance / 2, "bottom",
                )[0],
            ],
            "circles": [],
        },
    ]

    def prepare(part):
        w_mm, h_mm = part["w_mm"], part["h_mm"]
        rotate = part["rotate"]

        def r(p):
            return _rot_point(p[0], p[1], h_mm) if rotate else p

        return {
            **part,
            "eff_w": h_mm if rotate else w_mm,
            "eff_h": w_mm if rotate else h_mm,
            "edges": [(r(p1), r(p2), [(r(g1), r(g2)) for g1, g2 in gaps]) for p1, p2, gaps in part["edges"]],
            "notches": [[r(p) for p in wall] for wall in part["notches"]],
            "circles": [(*r((cx, cy)), dia) for cx, cy, dia in part["circles"]],
        }

    parts = [prepare(p) for p in parts_raw]
    # Scale is chosen so the tallest part (by how much of avail_h its own
    # height would need) fills the full available height - the bottle
    # holder shaft, in practice - rather than being capped by whichever
    # part is widest, which left every part far short of the page's full
    # vertical space. Columns are then sized to each part's actual drawn
    # width at that scale (see the layout loop below) instead of fixed
    # equal thirds, since the 3 parts are no longer assumed to fit the same
    # column width. A proportional-shrink fallback guards the (unusual)
    # case where that would overflow the page's total width.
    scale = min(avail_h / p["eff_h"] for p in parts)
    total_w = sum(p["eff_w"] for p in parts) * scale + 3 * (col_left_pad + col_right_pad) + 2 * col_gap
    avail_total_w = draw_right - draw_left
    if total_w > avail_total_w:
        fixed_overhead = 3 * (col_left_pad + col_right_pad) + 2 * col_gap
        scale = (avail_total_w - fixed_overhead) / sum(p["eff_w"] for p in parts)

    solar_col_w = None
    cursor = draw_left
    for part in parts:
        cx0 = cursor
        ox = cx0 + col_left_pad
        oy = diagram_top - part["eff_h"] * scale
        col_w = part["eff_w"] * scale + col_left_pad + col_right_pad

        c.setFont(title_font, 9)
        c.setFillColor(colors.HexColor("#222222"))
        c.drawString(ox, draw_top - 10, part["name"])

        _draw_edges(c, part["edges"], ox, oy, scale, stroke_color=colors.HexColor("#333333"), line_width=0.8)

        for wall in part["notches"]:
            _draw_open_path(c, wall, ox, oy, scale, stroke_color=colors.HexColor("#999999"), line_width=0.5)
        for cx, cy, dia in part["circles"]:
            r = (dia / 2) * scale
            c.setStrokeColor(colors.HexColor("#999999"))
            c.setLineWidth(0.5)
            c.circle(ox + cx * scale, oy + cy * scale, r, stroke=1, fill=0)

        _draw_dimension_line(
            c, ox, oy - 16, ox + part["eff_w"] * scale, oy - 16,
            f"{_ceil_mm(part['eff_w'])}mm", font=body_font, size=6.5,
        )
        _draw_dimension_line(
            c, ox - 10, oy, ox - 10, oy + part["eff_h"] * scale,
            f"{_ceil_mm(part['eff_h'])}mm", font=body_font, size=6.5, label_side="left",
        )

        if part["name"] == "Solar Panel Holder":
            solar_col_w = col_w

        cursor += col_w + col_gap

    # The solar panel holder is always the smallest of the 3 parts, so its
    # column has open space below its diagram - that's where the input and
    # derived-dimension boxes live, stacked instead of side-by-side, anchored
    # to the page's bottom-right corner rather than trailing the diagram.
    input_lines = [
        f"Wood thickness: {_ceil_mm(inputs.wood_thickness)}mm",
        f"Bottle diameter: {_ceil_mm(inputs.bottle_diameter)}mm",
        f"Bottle height: {_ceil_mm(inputs.bottle_height)}mm",
        f"Cap diameter: {_ceil_mm(inputs.cap_diameter)}mm",
        f"Cap height: {_ceil_mm(inputs.cap_height)}mm",
        f"Board width: {_ceil_mm(inputs.fin_board_width)}mm",
    ]
    derived_lines = [
        f"Fin: {_ceil_mm(d.fin_width)} x {_ceil_mm(d.fin_height)}mm",
        f"Shaft length: {_ceil_mm(d.shaft_length)}mm",
        f"Joint slot opening: {_ceil_mm(d.joint_slot_opening)}mm",
        f"Solar slot width: {_ceil_mm(d.solar_slot_width)}mm",
        f"Panel: {_ceil_mm(inputs.solar_panel_width)} x {_ceil_mm(inputs.solar_panel_height)} x {_ceil_mm(inputs.solar_panel_thickness)}mm",
    ]
    box_gap = 10
    box_h = 92
    box_w = solar_col_w - col_right_pad
    box_x = draw_right - box_w
    derived_box_y = draw_bottom
    input_box_y = derived_box_y + box_h + box_gap
    _rounded_rect_text(c, box_x, input_box_y, box_w, box_h, "Input variables", input_lines, title_font, body_font)
    _rounded_rect_text(c, box_x, derived_box_y, box_w, box_h, "Derived dimensions", derived_lines, title_font, body_font)

    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def generate(
    inputs: BackFinInputs,
    output_root: Path,
    public_url_prefix: str = "/ecojoiner_exports",
    font_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> Dict[str, object]:
    """Validate inputs and write requested export files. Mirrors
    six_fc.generate()'s contract exactly (same manifest shape, same
    dry-run/file-writing/job-folder behavior)."""

    errors = validate_inputs(inputs)
    if errors:
        return {"ok": False, "errors": errors}

    d = derive_dimensions(inputs)
    slug = make_job_slug(inputs, d)

    if dry_run:
        return {
            "ok": True,
            "dry_run": True,
            "object_type": "fin",
            "design_version": DESIGN_VERSION,
            "license": LICENSE_ID,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "job_slug": slug,
            "inputs": asdict(inputs),
            "derived": asdict(d),
            "files": [],
        }

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

    manifest = {
        "ok": True,
        "object_type": "fin",
        "design_version": DESIGN_VERSION,
        "license": LICENSE_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_slug": slug,
        "inputs": asdict(inputs),
        "derived": asdict(d),
        "files": [asdict(f) for f in files],
    }

    manifest_path = job_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(manifest_path)
    manifest["manifest_url"] = f"{public_url_prefix}/{slug}/manifest.json"

    return manifest
