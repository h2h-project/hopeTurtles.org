"""Head Fin (front fin + two bottle-holder slats) object -- EXPERIMENTAL.

Upstream: ../turtle_body/lib/head_fin.scad (turtle_body v5.8.0+, raked
profile since v6.3.4). The rear fin's counterpart on the front port: two flat
slats above and below the front bottle bolt to the Little John M5 pairs and
half-lap into a raked vertical fin whose rear edge abuts the bottle base.

Dimension rules live in generator/head_fin_generator.py (dimensions(),
validate()); the .scad file is turtle_body's own bundle with the builder's
dimensions written in (head_fin_generator.build_scad()). This module adds
the JSON-manifest/job-folder contract plus SVG/DXF/PDF carpenter files, in
the same shape as objects/back_fin.py.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from common import (
    LICENSE_ID,
    GeneratedFile,
    _to_float,
    _slugify,
    _ceil_mm,
    board_width_errors,
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
    _draw_edges,
    _draw_open_path,
    _rect_edges_with_gaps,
    colors,
    letter,
    canvas,
    ezdxf,
)
from objects.ecojoiner_6fc import _fit_connection_label
import head_fin_generator as _hf

OBJECT_TYPE = "head_fin"
DESIGN_VERSION = "1.0"

PART_QUANTITIES = {
    "Head Fin": 1,
    "Head Fin Slat": 2,
}


@dataclass(frozen=True)
class HeadFinInputs:
    wood_thickness: float = _hf.DEFAULTS["wood_thickness"]
    bottle_height: float = _hf.DEFAULTS["bottle_height"]
    cap_height: float = _hf.DEFAULTS["cap_height"]
    bottle_diameter: float = _hf.DEFAULTS["bottle_diameter"]
    fin_board_width: float = _hf.DEFAULTS["fin_board_width"]

    half_lap_clearance: float = _hf.TUNING["half_lap_clearance"]
    slat_hole_diameter: float = _hf.TUNING["slat_hole_diameter"]
    port_fit_mm: float = _hf.TUNING["port_fit_mm"]

    bottle_brand: str = "generic"
    formats: Tuple[str, ...] = ("pdf", "scad", "svg")
    job_id: str = ""
    lang: str = "en"

    def params(self) -> Dict[str, float]:
        return {k: getattr(self, k) for k in (*_hf.DEFAULTS, *_hf.TUNING)}


@dataclass(frozen=True)
class HeadFinDerived:
    fin_width: float
    fin_height: float
    fin_total_height: float
    heel_x: float
    toe_h: float
    drop: float
    setback: float
    overlap: float
    joint_meet_x: float
    joint_slot_opening: float
    slat_length: float
    slat_width: float
    slat_hole_from_front: float
    slat_hole_pair_offset: float
    upper_slot_y: float      # fin-local y of each slot's lower edge (y = 0 at the fin bottom)
    lower_slot_y: float
    slat_notch_u0: float     # slat-local: u = 0 at the front (Ecojoiner) end
    slat_notch_width: float
    slat_notch_v0: float
    port_height: float


def parse_inputs_from_dict(data: Dict[str, object]) -> HeadFinInputs:
    """Parse the JSON payload Node sends (utils/ecojoinerGenerator.js::mapHeadFinFields)."""

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
    for key, default in {**_hf.DEFAULTS, **_hf.TUNING}.items():
        kwargs[key] = _to_float(get(key), default)

    return HeadFinInputs(
        **kwargs,
        bottle_brand=str(get("bottle_brand", "generic") or "generic"),
        formats=formats,
        job_id=str(get("job_id", "") or ""),
        lang=str(get("lang", "en") or "en").lower(),
    )


def derive_dimensions(inputs: HeadFinInputs) -> HeadFinDerived:
    dim = _hf.dimensions(inputs.params())
    t = inputs.wood_thickness
    c = inputs.half_lap_clearance
    h, drop = dim["fin_height"], dim["drop"]
    # Fin-local drawing frame: x = 0 at the rear edge (against the bottle
    # base), y = 0 at the fin's bottom; turtle_body z maps to y = z + h/2 + drop.
    to_y = lambda z: z + h / 2 + drop  # noqa: E731
    notch_w = dim["overlap"] - dim["joint_meet_x"] + c / 2
    return HeadFinDerived(
        fin_width=dim["fin_width"],
        fin_height=h,
        fin_total_height=dim["fin_total_height"],
        heel_x=dim["heel_x"],
        toe_h=dim["toe_h"],
        drop=drop,
        setback=dim["setback"],
        overlap=dim["overlap"],
        joint_meet_x=dim["joint_meet_x"],
        joint_slot_opening=t + c,
        slat_length=dim["slat_length"],
        slat_width=dim["slat_width"],
        slat_hole_from_front=dim["slat_hole_from_front"],
        slat_hole_pair_offset=dim["slat_hole_pair_offset"],
        upper_slot_y=to_y(dim["upper_slat_z0"]) - c / 2,
        lower_slot_y=to_y(dim["lower_slat_z0"]) - c / 2,
        slat_notch_u0=dim["slat_length"] - notch_w,
        slat_notch_width=notch_w,
        slat_notch_v0=dim["slat_width"] / 2 - (t + c) / 2,
        port_height=dim["port_height"],
    )


def validate_inputs(inputs: HeadFinInputs) -> List[str]:
    errors: List[str] = []
    for key, label in (
        ("wood_thickness", "Wood thickness"),
        ("bottle_height", "Bottle height"),
        ("cap_height", "Cap height"),
        ("bottle_diameter", "Bottle diameter"),
        ("fin_board_width", "Board width"),
        ("slat_hole_diameter", "Slat hole diameter"),
    ):
        value = getattr(inputs, key)
        if value is None or value <= 0:
            errors.append(f"{label} must be greater than 0.")
    if errors:
        return errors
    try:
        _hf.validate(inputs.params())
    except ValueError as exc:
        return [str(exc) + "."]
    d = derive_dimensions(inputs)
    errors += board_width_errors(inputs.fin_board_width, [
        ("head fin", d.fin_width, d.fin_total_height),
        ("head fin slat", d.slat_width, d.slat_length),
    ])
    return errors


def notices(inputs: HeadFinInputs) -> List[str]:
    return ["The head fin is experimental - it has not been built or sea-tested yet."]


def make_job_slug(inputs: HeadFinInputs, derived: HeadFinDerived) -> str:
    brand = _slugify(inputs.bottle_brand)
    job_id = _slugify(inputs.job_id or uuid.uuid4().hex[:8], fallback=uuid.uuid4().hex[:8])
    return f"headfin_{brand}_{round(derived.fin_width):g}x{round(derived.fin_total_height):g}_{job_id}"


# ---------------------------------------------------------------------------
# Shared 2D geometry
# ---------------------------------------------------------------------------

def _fin_outline(d: HeadFinDerived):
    W, H = d.fin_width, d.fin_total_height
    return [
        (0, 0),
        (W - d.setback, 0),           # bottom edge
        (W, d.drop),                  # 45-degree bottom-front cut
        (W, d.drop + d.toe_h),        # vertical flat nose
        (d.heel_x, H),                # raked leading edge up to the top heel
        (0, H),                       # top edge, back to the rear edge
    ]


def _fin_notches(inputs: HeadFinInputs, d: HeadFinDerived):
    c = inputs.half_lap_clearance
    w = d.joint_meet_x + c / 2
    return [
        (0.0, d.upper_slot_y, w, d.joint_slot_opening),
        (0.0, d.lower_slot_y, w, d.joint_slot_opening),
    ]


def _slat_notch(d: HeadFinDerived):
    return (d.slat_notch_u0, d.slat_notch_v0, d.slat_notch_width, d.joint_slot_opening)


def _slat_hole_ys(d: HeadFinDerived) -> Tuple[float, float]:
    c = d.slat_width / 2
    return (c - d.slat_hole_pair_offset, c + d.slat_hole_pair_offset)


def write_scad(path: Path, inputs: HeadFinInputs, d: HeadFinDerived) -> None:
    path.write_text(_hf.build_scad(inputs.params()), encoding="utf-8")


# ---------------------------------------------------------------------------
# SVG / DXF
# ---------------------------------------------------------------------------

def _rows(d: HeadFinDerived, full_set: bool):
    rows = [(d.fin_total_height, "fin", "Head Fin")]
    if full_set:
        rows += [(d.slat_width, "slat", "Head Fin Slat 1"), (d.slat_width, "slat", "Head Fin Slat 2")]
    else:
        rows += [(d.slat_width, "slat", "Head Fin Slat x2")]
    return rows


def write_svg(path: Path, inputs: HeadFinInputs, d: HeadFinDerived, *, full_set: bool = True) -> None:
    margin, gap = 10.0, 14.0
    width = margin * 2 + max(d.fin_width, d.slat_length)
    rows = _rows(d, full_set)
    height = margin + sum(h + gap for h, _, _ in rows)

    out = _svg_header(width, height, desc=f"Flatpack Head Fin v{DESIGN_VERSION}, 1:1 millimetre geometry")
    out += f'  <metadata>{json.dumps({"version": DESIGN_VERSION, "license": LICENSE_ID})}</metadata>\n'
    y = margin
    for row_h, kind, name in rows:
        out += f'  <g id="{name.lower().replace(" ", "_")}" transform="translate({margin:.3f} {y:.3f})">\n'
        if kind == "fin":
            out += _polygon(_fin_outline(d))
            for nx, ny, nw, nh in _fin_notches(inputs, d):
                out += _rect(nx, ny, nw, nh)
        else:
            out += _rect(0, 0, d.slat_length, d.slat_width)
            for hy in _slat_hole_ys(d):
                out += _circle(d.slat_hole_from_front, hy, inputs.slat_hole_diameter)
            out += _rect(*_slat_notch(d))
        out += _label(0, -3, name)
        out += "  </g>\n"
        y += row_h + gap
    out += "</svg>\n"
    path.write_text(out, encoding="utf-8")


def write_dxf(path: Path, inputs: HeadFinInputs, d: HeadFinDerived, *, full_set: bool = True) -> None:
    if ezdxf is None:
        raise RuntimeError("ezdxf is not installed. Install with: pip install ezdxf")
    doc = ezdxf.new(dxfversion="R2010")
    doc.units = ezdxf.units.MM
    _dxf_setup(doc)
    msp = doc.modelspace()
    margin, gap = 10.0, 14.0
    y = margin
    for row_h, kind, name in _rows(d, full_set):
        if kind == "fin":
            _dxf_polygon(msp, [(x, y0 + y) for x, y0 in _fin_outline(d)], DXF_CUT_LAYER)
            for nx, ny, nw, nh in _fin_notches(inputs, d):
                _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        else:
            _dxf_rect(msp, 0, y, d.slat_length, d.slat_width, DXF_CUT_LAYER)
            for hy in _slat_hole_ys(d):
                _dxf_circle(msp, d.slat_hole_from_front, y + hy, inputs.slat_hole_diameter, DXF_CUT_LAYER)
            nx, ny, nw, nh = _slat_notch(d)
            _dxf_rect(msp, nx, y + ny, nw, nh, DXF_CUT_LAYER)
        _dxf_label(msp, 0, y - 3, name)
        y += row_h + gap
    doc.saveas(str(path))


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def _fin_edges_with_gaps(inputs: HeadFinInputs, d: HeadFinDerived):
    gaps = [_rect_open(*n, "left")[1] for n in _fin_notches(inputs, d)]
    pts = _fin_outline(d)
    edges = []
    for i, p1 in enumerate(pts):
        p2 = pts[(i + 1) % len(pts)]
        edges.append((p1, p2, gaps if i == len(pts) - 1 else []))   # last edge = rear (left) edge
    return edges


def _slat_annotations(inputs: HeadFinInputs, d: HeadFinDerived):
    hole_x = d.slat_hole_from_front
    lo, hi = _slat_hole_ys(d)
    n_u0, n_v0, n_w, n_h = _slat_notch(d)
    dims = [
        ((0, d.slat_width + 14), (hole_x, d.slat_width + 14), f"{_ceil_mm(hole_x)}mm",
         {"ext1": (0, d.slat_width), "ext2": (hole_x, d.slat_width), "rotate_label": True}),
        ((n_u0, -6), (d.slat_length, -6), f"{_ceil_mm(n_w)}mm deep",
         {"ext1": (n_u0, 0), "ext2": (d.slat_length, 0)}),
        ((hole_x + 10, 0), (hole_x + 10, lo), f"{_ceil_mm(lo)}mm",
         {"ext1": (hole_x, 0), "ext2": (hole_x, lo)}),
        ((hole_x + 10, lo), (hole_x + 10, hi), f"{_ceil_mm(hi - lo)}mm",
         {"ext1": (hole_x, lo), "ext2": (hole_x, hi)}),
    ]
    side = inputs.slat_hole_diameter / 2 + 5
    hole_text = f"⌀{_ceil_mm(inputs.slat_hole_diameter)}"
    labels = [
        ((hole_x, lo + side), hole_text),
        ((hole_x, hi - side), hole_text),
        ((n_u0 + n_w / 2, n_v0 + n_h / 2), f"{_ceil_mm(n_h)}mm wide"),
    ]
    return dims, labels


def _fin_annotations(inputs: HeadFinInputs, d: HeadFinDerived):
    upper, lower = _fin_notches(inputs, d)
    W, H = d.fin_width, d.fin_total_height
    dims, labels = [], []
    for nx, ny, nw, nh in (upper, lower):
        # Depth below the slot, width written beside its closed end -- the
        # slot is too short at sheet scale to hold both labels.
        dims.append(((nx, ny - 9), (nx + nw, ny - 9), f"{_ceil_mm(nw)}mm deep",
                     {"ext1": (nx, ny), "ext2": (nx + nw, ny)}))
        labels.append(((nx + nw + 9, ny + nh / 2), f"{_ceil_mm(nh)}mm wide"))
    # Slot positions, both measured down from the fin's top edge to the top
    # of each slot (two parallel dimensions off one datum, as the rear fin).
    slot_end = upper[0] + upper[2] + 18      # clear of the "wide" labels
    for x_off, (nx, ny, nw, nh) in ((6, upper), (20, lower)):
        top = ny + nh
        dims.append(((slot_end + x_off, top), (slot_end + x_off, H), f"{_ceil_mm(H - top)}mm",
                     {"ext1": (slot_end, top), "ext2": (slot_end, H), "rotate_label": True}))
    # Top edge: how far the fin runs forward before the raked edge starts.
    dims.append(((0, H + 8), (d.heel_x, H + 8), f"{_ceil_mm(d.heel_x)}mm",
                 {"ext1": (0, H), "ext2": (d.heel_x, H)}))
    # Front edge: 45-degree cut height, then the flat nose above it.
    dims.append(((W + 8, 0), (W + 8, d.drop), f"{_ceil_mm(d.drop)}mm",
                 {"ext1": (W - d.setback, 0), "ext2": (W, d.drop), "rotate_label": True}))
    dims.append(((W + 8, d.drop), (W + 8, d.drop + d.toe_h), f"{_ceil_mm(d.toe_h)}mm flat",
                 {"ext1": (W, d.drop), "ext2": (W, d.drop + d.toe_h), "rotate_label": True}))
    # Bottom edge: where the 45-degree cut starts, from the front corner.
    dims.append(((W - d.setback, -8), (W, -8), f"{_ceil_mm(d.setback)}mm",
                 {"ext1": (W - d.setback, 0), "ext2": (W, 0)}))
    labels.append(((W - d.setback / 2 - 6, d.drop / 2 + 6), "45°"))
    return dims, labels


def write_pdf(path: Path, inputs: HeadFinInputs, d: HeadFinDerived, *, font_dir: Optional[Path] = None) -> None:
    """One-page Letter carpenter reference: the slat (rotated 90 degrees to use
    the page height) and the fin, at one shared scale, plus input/derived boxes."""
    if canvas is None:
        raise RuntimeError("ReportLab is not installed. Install with: pip install reportlab")
    title_font, body_font, symbol_font = _register_fonts(font_dir)
    page_w, page_h = letter
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(f"Flatpack Head Fin v{DESIGN_VERSION}")

    margin = 28
    title_y = page_h - 34
    c.setFont(title_font, 20)
    c.setFillColor(colors.HexColor("#111111"))
    c.drawString(margin, title_y, f"Flatpack Head Fin v{DESIGN_VERSION}")
    c.setFont(body_font, 9)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(margin, title_y - 16,
                 "Reference sheet only - the SVG/DXF exports are the 1:1 cut files. Experimental: not yet sea-tested.")

    draw_left, draw_right = margin, page_w - margin
    draw_top = title_y - 44
    draw_bottom = 40
    diagram_top = draw_top - 34     # room for the fin's top-edge dimension under the part titles
    avail_h = diagram_top - draw_bottom - 26
    col_left_pad, col_right_pad, col_gap = 40, 34, 16

    slat_dims, slat_labels = _slat_annotations(inputs, d)
    fin_dims, fin_labels = _fin_annotations(inputs, d)
    notch = _slat_notch(d)
    parts_raw = [
        {
            "name": "Head Fin Slat (x2)",
            "w_mm": d.slat_length, "h_mm": d.slat_width, "rotate": True,
            "edges": _rect_edges_with_gaps(0, 0, d.slat_length, d.slat_width, {"right": [notch]}),
            "notches": [_rect_open(*notch, "right")[0]],
            "circles": [(d.slat_hole_from_front, hy, inputs.slat_hole_diameter) for hy in _slat_hole_ys(d)],
            "dims": slat_dims, "labels": slat_labels,
        },
        {
            "name": "Head Fin",
            "w_mm": d.fin_width, "h_mm": d.fin_total_height, "rotate": False,
            "edges": _fin_edges_with_gaps(inputs, d),
            "notches": [_rect_open(*n, "left")[0] for n in _fin_notches(inputs, d)],
            "circles": [],
            "dims": fin_dims, "labels": fin_labels,
        },
    ]

    def prepare(part):
        w_mm, h_mm, rotate = part["w_mm"], part["h_mm"], part["rotate"]

        def r(p):
            return _rot_point(p[0], p[1], h_mm) if rotate else p

        def r_dim(p1, p2, text, kwargs):
            kwargs = {**kwargs}
            for key in ("ext1", "ext2"):
                if key in kwargs:
                    kwargs[key] = r(kwargs[key])
            return (r(p1), r(p2), text, kwargs)

        return {
            **part,
            "eff_w": h_mm if rotate else w_mm,
            "eff_h": w_mm if rotate else h_mm,
            "edges": [(r(p1), r(p2), [(r(g1), r(g2)) for g1, g2 in gaps]) for p1, p2, gaps in part["edges"]],
            "notches": [[r(p) for p in wall] for wall in part["notches"]],
            "circles": [(*r((cx, cy)), dia) for cx, cy, dia in part["circles"]],
            "dims": [r_dim(*dim) for dim in part["dims"]],
            "labels": [(r(p), text) for p, text in part["labels"]],
        }

    parts = [prepare(p) for p in parts_raw]
    box_w = 190
    scale = min(avail_h / p["eff_h"] for p in parts)
    fixed = len(parts) * (col_left_pad + col_right_pad) + len(parts) * col_gap + box_w
    if sum(p["eff_w"] for p in parts) * scale + fixed > draw_right - draw_left:
        scale = (draw_right - draw_left - fixed) / sum(p["eff_w"] for p in parts)

    cursor = draw_left
    for part in parts:
        ox = cursor + col_left_pad
        oy = diagram_top - part["eff_h"] * scale
        c.setFont(title_font, 9)
        c.setFillColor(colors.HexColor("#222222"))
        c.drawString(ox, draw_top - 10, part["name"])
        _draw_edges(c, part["edges"], ox, oy, scale, stroke_color=colors.HexColor("#333333"), line_width=0.8)
        for wall in part["notches"]:
            _draw_open_path(c, wall, ox, oy, scale, stroke_color=colors.HexColor("#999999"), line_width=0.5)
        for cx, cy, dia in part["circles"]:
            c.setStrokeColor(colors.HexColor("#999999"))
            c.setLineWidth(0.5)
            c.circle(ox + cx * scale, oy + cy * scale, (dia / 2) * scale, stroke=1, fill=0)
        _draw_dimension_line(c, ox, oy - 16, ox + part["eff_w"] * scale, oy - 16,
                             f"{_ceil_mm(part['eff_w'])}mm", font=body_font, size=6.5, offset=-15)
        _draw_dimension_line(c, ox - 10, oy, ox - 10, oy + part["eff_h"] * scale,
                             f"{_ceil_mm(part['eff_h'])}mm", font=body_font, size=6.5, label_side="left")
        for p1, p2, text, kwargs in part["dims"]:
            line_kwargs = {**kwargs}
            for key in ("ext1", "ext2"):
                if key in line_kwargs:
                    ex, ey = line_kwargs[key]
                    line_kwargs[key] = (ox + ex * scale, oy + ey * scale)
            _draw_dimension_line(c, ox + p1[0] * scale, oy + p1[1] * scale, ox + p2[0] * scale, oy + p2[1] * scale,
                                 text, font=body_font, size=5.5, **line_kwargs)
        for p, text in part["labels"]:
            c.setFont(symbol_font if ("⌀" in text or "°" in text) else body_font, 5.5)
            c.setFillColor(colors.HexColor("#333333"))
            c.drawCentredString(ox + p[0] * scale, oy + p[1] * scale - 2, text)
        cursor += part["eff_w"] * scale + col_left_pad + col_right_pad + col_gap

    input_lines = [
        f"Wood thickness: {_ceil_mm(inputs.wood_thickness)}mm",
        f"Bottle diameter: {_ceil_mm(inputs.bottle_diameter)}mm",
        f"Bottle height: {_ceil_mm(inputs.bottle_height)}mm",
        f"Cap height: {_ceil_mm(inputs.cap_height)}mm",
        f"Board width: {_ceil_mm(inputs.fin_board_width)}mm",
        f"Fit connection: {_fit_connection_label('en', inputs.port_fit_mm)}",
    ]
    derived_lines = [
        f"Fin: {_ceil_mm(d.fin_width)} x {_ceil_mm(d.fin_total_height)}mm",
        f"Slat: {_ceil_mm(d.slat_length)} x {_ceil_mm(d.slat_width)}mm",
        f"Joint slot opening: {_ceil_mm(d.joint_slot_opening)}mm",
        f"Half-lap engagement: {_ceil_mm(d.joint_meet_x)}mm",
        f"M5 holes from slat front: {_ceil_mm(d.slat_hole_from_front)}mm",
        f"M5 pair spacing: {_ceil_mm(2 * d.slat_hole_pair_offset)}mm",
    ]
    box_h, box_gap = 92, 10
    box_x = draw_right - box_w
    _rounded_rect_text(c, box_x, draw_bottom + box_h + box_gap, box_w, box_h, "Input variables",
                       input_lines, title_font, body_font)
    _rounded_rect_text(c, box_x, draw_bottom, box_w, box_h, "Derived dimensions",
                       derived_lines, title_font, body_font)

    c.setFont(body_font, 6)
    c.setFillColor(colors.HexColor("#555555"))
    c.drawString(margin, 16, f"CERN-OHL-S-2.0. Design version {DESIGN_VERSION}. https://hopeturtles.org/turtles/generate")
    c.showPage()
    c.save()


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------

def generate(
    inputs: HeadFinInputs,
    output_root: Path,
    public_url_prefix: str = "/ecojoiner_exports",
    font_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> Dict[str, object]:
    errors = validate_inputs(inputs)
    if errors:
        return {"ok": False, "errors": errors}

    d = derive_dimensions(inputs)
    slug = make_job_slug(inputs, d)
    base = {
        "ok": True,
        "object_type": OBJECT_TYPE,
        "design_version": DESIGN_VERSION,
        "license": LICENSE_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "job_slug": slug,
        "inputs": asdict(inputs),
        "derived": asdict(d),
        "notices": notices(inputs),
    }
    if dry_run:
        return {**base, "dry_run": True, "files": []}

    job_dir = output_root / slug
    job_dir.mkdir(parents=True, exist_ok=True)
    files: List[GeneratedFile] = []

    if "scad" in inputs.formats:
        p = job_dir / f"{slug}.scad"
        write_scad(p, inputs, d)
        files.append(GeneratedFile("scad", "OpenSCAD source", str(p), f"{public_url_prefix}/{slug}/{p.name}"))
    if "svg" in inputs.formats:
        p = job_dir / f"{slug}_full_set_1to1.svg"
        write_svg(p, inputs, d, full_set=True)
        files.append(GeneratedFile("svg", "1:1 SVG full-set cutting file", str(p), f"{public_url_prefix}/{slug}/{p.name}"))
        p = job_dir / f"{slug}_one_each_1to1.svg"
        write_svg(p, inputs, d, full_set=False)
        files.append(GeneratedFile("svg", "1:1 SVG one-each layout", str(p), f"{public_url_prefix}/{slug}/{p.name}"))
    if "dxf" in inputs.formats:
        p = job_dir / f"{slug}_full_set_1to1.dxf"
        write_dxf(p, inputs, d, full_set=True)
        files.append(GeneratedFile("dxf", "1:1 DXF full-set cutting file", str(p), f"{public_url_prefix}/{slug}/{p.name}"))
        p = job_dir / f"{slug}_one_each_1to1.dxf"
        write_dxf(p, inputs, d, full_set=False)
        files.append(GeneratedFile("dxf", "1:1 DXF one-each layout", str(p), f"{public_url_prefix}/{slug}/{p.name}"))
    if "pdf" in inputs.formats:
        p = job_dir / f"{slug}_carpenter_sheet.pdf"
        write_pdf(p, inputs, d, font_dir=font_dir)
        files.append(GeneratedFile("pdf", "Letter PDF carpenter sheet", str(p), f"{public_url_prefix}/{slug}/{p.name}"))

    manifest = {**base, "files": [asdict(f) for f in files]}
    manifest_path = job_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(manifest_path)
    manifest["manifest_url"] = f"{public_url_prefix}/{slug}/manifest.json"
    return manifest
