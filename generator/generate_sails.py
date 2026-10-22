#!/usr/bin/env python3
"""Generate the standalone Hope Turtle sail apparatus as OpenSCAD.

Upstream: ../turtle_body/lib/sail_frame.scad + lib/params.scad. Since
turtle_body v6.0.0 the top crossbar is three pieces -- two halves lying on a
centre "sail crossbar connector" that clamps the sail shaft with a side M3 --
the sail battens are 205 + t tall with a two-layer (2t) upper notch, the
non-sail battens stop flush with the cage roof, and the bottom rails are
3 x bottle diameter + t.

The SCAD is turtle_body's own Turtle_Sail_Apparatus.scad bundle (vendored by
sync_from_turtle_body.py) with the builder's bottle and board dimensions
written into its p_*() functions -- see turtle_body_bundle.py. This replaced a
~1,100-line hand-copied SCAD template that had to be re-ported after every
upstream sail change (turtle_body v6.3.4 sync, 2026-10-22).

Wrapped for the web pipeline by generator/objects/sails.py.

    python3 generator/generate_sails.py --output /tmp/sails.scad
"""
import argparse
import math
from pathlib import Path

import turtle_body_bundle as tbb

BUNDLE = "Turtle_Sail_Apparatus.scad"
PARTS = ("assembly", "top_bar_half", "top_bar_connector", "sail_batten", "non_sail_batten",
         "bottom_bars", "strengtheners", "c_end_pieces", "sails")

# p_side_batten_h() = SIDE_BATTEN_BASE + p_wood_t() (turtle_body v6.1.0): the
# sail batten carries the two stacked crossbar layers in a 2t notch.
SIDE_BATTEN_BASE = 205.0


def default_side_batten_height(wood_thickness: float) -> float:
    return SIDE_BATTEN_BASE + wood_thickness


def build_scad(wood_thickness=12, side_batten_height=None,
               cage_mount_hole_diameter=3.2, part="assembly",
               show_hardware=True, enable_color_coding=True,
               bottle_diameter=84, bottle_height=305, cap_diameter=31,
               cap_height=17, collar_diameter=34, top_dome_height=62,
               bottom_dome_height=25):
    """Return self-contained SCAD. Detailed geometry asserts run in OpenSCAD."""
    if side_batten_height is None:
        side_batten_height = default_side_batten_height(float(wood_thickness))
    values = {}
    for name, value in (("wood_thickness", wood_thickness),
                        ("side_batten_height", side_batten_height),
                        ("cage_mount_hole_diameter", cage_mount_hole_diameter),
                        ("bottle_diameter", bottle_diameter),
                        ("bottle_height", bottle_height),
                        ("cap_diameter", cap_diameter),
                        ("cap_height", cap_height),
                        ("collar_diameter", collar_diameter),
                        ("top_dome_height", top_dome_height),
                        ("bottom_dome_height", bottom_dome_height)):
        value = float(value)
        if not math.isfinite(value) or value <= 0:
            raise ValueError(name + " must be finite and positive")
        values[name] = value
    if part not in PARTS:
        raise ValueError("Unknown part: " + str(part))
    if values["cage_mount_hole_diameter"] >= 20:
        raise ValueError("Cage mounting holes must fit within the 20 mm batten width")
    # Batten top to its lower cage hole = roof 48 + two crossbar layers (2t)
    # + top margin 15 - (-10); the hole must sit inside the batten.
    if values["side_batten_height"] <= 73 + 2 * values["wood_thickness"] + values["cage_mount_hole_diameter"] / 2:
        raise ValueError("Batten is too short to contain both cage mounting holes")
    if values["bottle_height"] <= values["cap_height"]:
        raise ValueError("Bottle height must exceed cap height")
    if values["top_dome_height"] + values["bottom_dome_height"] >= values["bottle_height"]:
        raise ValueError("Dome heights must leave a positive straight body section")
    if not isinstance(show_hardware, bool) or not isinstance(enable_color_coding, bool):
        raise ValueError("Display flags must be boolean")

    text = tbb.load_bundle(BUNDLE)
    text = tbb.override_params(text, {
        "p_wood_t": values["wood_thickness"],
        "p_bottle_d": values["bottle_diameter"],
        "p_bottle_h": values["bottle_height"],
        "p_bottle_cap_d": values["cap_diameter"],
        "p_bottle_cap_h": values["cap_height"],
        "p_collar_d": values["collar_diameter"],
        "p_top_dome_h": values["top_dome_height"],
        "p_bottom_dome_h": values["bottom_dome_height"],
    })
    text = tbb.override_customizer(text, {
        "part": part,
        "wood_thickness": values["wood_thickness"],
        "side_batten_height": values["side_batten_height"],
        "cage_mount_hole_diameter": values["cage_mount_hole_diameter"],
        "show_hardware": show_hardware,
        "enable_color_coding": enable_color_coding,
    })
    return tbb.stamp(text, "Hope Turtle sail apparatus", values)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--wood-thickness", type=float, default=12)
    parser.add_argument("--side-batten-height", type=float, default=None,
                        help="sail batten height (default 205 + wood thickness)")
    parser.add_argument("--cage-mount-hole-diameter", type=float, default=3.2)
    parser.add_argument("--bottle-diameter", type=float, default=84)
    parser.add_argument("--bottle-height", type=float, default=305)
    parser.add_argument("--cap-diameter", type=float, default=31)
    parser.add_argument("--cap-height", type=float, default=17)
    parser.add_argument("--collar-diameter", type=float, default=34)
    parser.add_argument("--top-dome-height", type=float, default=62)
    parser.add_argument("--bottom-dome-height", type=float, default=25)
    parser.add_argument("--part", choices=PARTS, default="assembly")
    parser.add_argument("--hide-hardware", action="store_true")
    parser.add_argument("--plain-wood", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("Turtle_Sail_Apparatus_v1.scad"))
    parser.add_argument("--force", action="store_true", help="Replace an existing output")
    args = parser.parse_args()
    try:
        result = build_scad(args.wood_thickness, args.side_batten_height,
                            args.cage_mount_hole_diameter, args.part,
                            not args.hide_hardware, not args.plain_wood,
                            args.bottle_diameter, args.bottle_height,
                            args.cap_diameter, args.cap_height,
                            args.collar_diameter, args.top_dome_height,
                            args.bottom_dome_height)
        with args.output.open("w" if args.force else "x", encoding="utf-8") as stream:
            stream.write(result)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print("Generated " + str(args.output))


if __name__ == "__main__":
    main()
