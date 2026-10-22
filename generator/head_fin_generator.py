#!/usr/bin/env python3
"""Generate the Hope Turtle head fin (front fin) as OpenSCAD.

Upstream: ../turtle_body/lib/head_fin.scad + lib/params.scad (turtle_body
v5.8.0+, EXPERIMENTAL). Two flat slats sit above and below the front bottle,
bolt to the front port's Little John M5 pairs exactly like the rear fin's
green shafts, and half-lap into a raked vertical fin whose rear edge abuts the
bottle base.

The SCAD is turtle_body's own Turtle_Head_Fin.scad bundle (vendored by
sync_from_turtle_body.py) with the builder's base dimensions written into its
p_*() functions -- see turtle_body_bundle.py. This module also owns the
dimension rules the 2D carpenter files (objects/head_fin.py) draw from.

    python3 generator/head_fin_generator.py --defaults --output /tmp/head_fin.scad
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import turtle_body_bundle as tbb
from back_fin_generator import (
    default_shaft_hole_from_front,
    port_height,
    shaft_hole_pair_offset,
)

BUNDLE = "Turtle_Head_Fin.scad"
PARTS = ("assembly", "fin", "slat")

# Form-driven inputs.              upstream (turtle_body/lib/params.scad)
DEFAULTS = {
    "wood_thickness": 12.0,        # p_wood_t()
    "bottle_height": 305.0,        # p_bottle_h()
    "cap_height": 17.0,            # p_bottle_cap_h()
    "bottle_diameter": 84.0,       # p_bottle_d()
    "fin_board_width": 93.0,       # p_fin_board_w() -- the fin is one board wide
}
TUNING = {
    "half_lap_clearance": 0.2,     # p_fit_clearance(), TOTAL extra slot width
    "slat_hole_diameter": 5.2,     # p_m5_hole_d() -- M5 bite holes, as the rear-fin shafts
    # "Adjust connection" (form Panel 5): the slats sit flush against Little
    # Johns cut to bottle diameter + this offset, so their gap, width and M5
    # pair follow the PORT height -- same rule as back_fin_generator.
    "port_fit_mm": 0.0,
}

# Profile multiples of wood thickness, all from lib/params.scad:
OVERLAP_T = 4      # p_head_slat_overlap() = 4t: slat run into the fin (48)
FIN_H_EXTRA_T = 6  # p_head_fin_h() = bottle_d + 6t (156): 2t of fin beyond each slat
TOE_T = 3          # p_head_fin_toe_h() = 3t (36): vertical flat nose (v6.3.4)
DROP_T = 3         # p_head_fin_drop() = 3t (36): extension below the toe (v6.3.2)
# p_head_fin_forefoot_setback() = p_head_fin_drop(): a 45-degree bottom-front cut (v6.3.3)


def dimensions(p: dict) -> dict:
    t = p["wood_thickness"]
    bd = p["bottle_diameter"]
    ph = port_height(p)
    width = p["fin_board_width"]
    h = bd + FIN_H_EXTRA_T * t
    overlap = OVERLAP_T * t
    drop = DROP_T * t
    # p_head_slat_reach() = rear shaft length - rear overlap: the slats reach
    # exactly as far into the Ecojoiner as the rear shafts, so their M5 pair
    # lands on the same John holes (p_head_slat_hole_from_front()).
    reach = p["bottle_height"] + (2 / 3) * (width - 2 * t) - p["cap_height"]
    return dict(
        fin_width=width,
        fin_height=h,                       # body, above the drop
        fin_total_height=h + drop,
        heel_x=overlap,                     # p_head_fin_heel_x(): top-edge length
        toe_h=TOE_T * t,
        drop=drop,
        setback=drop,
        overlap=overlap,
        joint_meet_x=overlap / 2,           # p_head_half_lap_engagement()
        slat_reach=reach,
        slat_length=reach + overlap,        # p_head_slat_len()
        slat_width=ph - 2 * t,              # p_head_slat_width() == John height
        upper_slat_z0=ph / 2,
        lower_slat_z0=-ph / 2 - t,
        slat_hole_from_front=default_shaft_hole_from_front(p),
        slat_hole_pair_offset=shaft_hole_pair_offset(p),
        port_height=ph,
    )


def leading_x(dim: dict, z: float) -> float:
    """hf_leading_x(): the raked edge, top heel -> top of the toe flat."""
    h = dim["fin_height"]
    return dim["heel_x"] + (dim["fin_width"] - dim["heel_x"]) * (h / 2 - z) / (h - dim["toe_h"])


def validate(p: dict) -> None:
    """Raise ValueError on the first failure -- mirrors hf_assert_valid()."""
    for key in (*DEFAULTS, "slat_hole_diameter"):
        v = p[key]
        if not math.isfinite(v) or v <= 0:
            raise ValueError(f"{key} must be finite and positive")
    c = p["half_lap_clearance"]
    t = p["wood_thickness"]
    if not 0 <= c < t:
        raise ValueError("Joinery clearance must be at least 0 and less than the wood thickness")
    if not -10 <= p["port_fit_mm"] <= 10:
        raise ValueError("Connection fit offset must be between -10 and 10 mm")
    if p["bottle_height"] <= p["cap_height"]:
        raise ValueError("Bottle height must be greater than cap height")
    d = dimensions(p)
    if not d["overlap"] < d["fin_width"]:
        raise ValueError("Board width is too small for the head fin's slat joints")
    if not d["setback"] < d["fin_width"] - d["heel_x"]:
        raise ValueError("Board width is too small for the head fin's 45-degree bottom cut")
    if d["upper_slat_z0"] + t + c / 2 >= d["fin_height"] / 2:
        raise ValueError("The upper slat slot would break out of the fin's top edge")
    for z in (d["lower_slat_z0"], d["lower_slat_z0"] + t, d["upper_slat_z0"], d["upper_slat_z0"] + t):
        if leading_x(d, z) <= d["overlap"]:
            raise ValueError("A slat end would poke through the fin's raked front edge")
    if d["slat_width"] <= t + c:
        raise ValueError("Slat width must be greater than the wood thickness plus clearance")
    hd = p["slat_hole_diameter"]
    if 2 * d["slat_hole_pair_offset"] + hd >= d["slat_width"]:
        raise ValueError("The slat's two M5 holes would run off its edges")
    front_x = d["overlap"] - d["slat_length"]
    if not (d["slat_hole_from_front"] > hd / 2 and front_x + d["slat_hole_from_front"] + hd / 2 < 0):
        raise ValueError("The slat holes must sit in the unjointed part of the slat")


def build_scad(overrides: dict | None = None, part: str = "assembly") -> str:
    p = {**DEFAULTS, **TUNING}
    if overrides:
        unknown = set(overrides) - set(p)
        if unknown:
            raise ValueError(f"Unknown parameters: {sorted(unknown)}")
        p.update({k: float(v) for k, v in overrides.items()})
    if part not in PARTS:
        raise ValueError(f"Unknown part: {part}")
    validate(p)
    text = tbb.load_bundle(BUNDLE)
    text = tbb.override_params(text, {
        "p_wood_t": p["wood_thickness"],
        "p_bottle_d": p["bottle_diameter"],
        "p_bottle_h": p["bottle_height"],
        "p_bottle_cap_h": p["cap_height"],
        "p_fin_board_w": p["fin_board_width"],
        "p_port_height": port_height(p),
        "p_m5_hole_d": p["slat_hole_diameter"],
    })
    text = tbb.override_customizer(text, {
        "half_lap_clearance": p["half_lap_clearance"],
        "part": part,
    })
    return tbb.stamp(text, "Hope Turtle head fin (front fin) - EXPERIMENTAL", p)


def _positive(value: str) -> float:
    v = float(value)
    if not math.isfinite(v) or v <= 0:
        raise argparse.ArgumentTypeError("value must be finite and greater than zero")
    return v


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for key, default in DEFAULTS.items():
        parser.add_argument("--" + key.replace("_", "-"), type=_positive, default=default)
    parser.add_argument("--half-lap-clearance", type=float, default=TUNING["half_lap_clearance"])
    parser.add_argument("--slat-hole-diameter", type=_positive, default=TUNING["slat_hole_diameter"])
    parser.add_argument("--port-fit-mm", type=float, default=TUNING["port_fit_mm"])
    parser.add_argument("--part", choices=PARTS, default="assembly")
    parser.add_argument("--defaults", action="store_true", help="accepted for parity with back_fin_generator.py")
    parser.add_argument("--output", type=Path, default=Path("turtle_head_fin.scad"))
    parser.add_argument("--force", action="store_true", help="Replace an existing output file")
    args = parser.parse_args()
    overrides = {k: getattr(args, k) for k in (*DEFAULTS, *TUNING)}
    try:
        text = build_scad(overrides, args.part)
        with args.output.open("w" if args.force else "x", encoding="utf-8") as stream:
            stream.write(text)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    d = dimensions({**DEFAULTS, **TUNING, **overrides})
    print(f"Generated {args.output}: fin {d['fin_width']:g} x {d['fin_total_height']:g}, "
          f"slats 2 x {d['slat_length']:g} x {d['slat_width']:g}")


if __name__ == "__main__":
    main()
