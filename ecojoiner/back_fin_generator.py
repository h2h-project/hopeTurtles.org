#!/usr/bin/env python3
"""
Generate a parametric Hope Turtle rear-fin OpenSCAD file.

If values are omitted on the command line, the script asks interactively.
All dimensions are millimetres.

Example:
    python3 generate_turtle_rear_fin.py \
        --cap-diameter 35 \
        --wood-thickness 12 \
        --bottle-height 305 \
        --cap-height 17 \
        --bottle-diameter 82 \
        --solar-panel-width 148 \
        --fin-board-width 93 \
        --output my_turtle_fin.scad
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

DEFAULTS = {
    "cap_diameter": 35,
    "wood_thickness": 12,
    "bottle_height": 305,
    "cap_height": 17,
    "bottle_diameter": 82,
    "solar_panel_width": 148,
    "fin_board_width": 93,
}

SCAD_TEMPLATE = r"""/*
  Hope Turtle — Parametric Rear Fin Structure

  Four physical pieces, three shapes:
    1. Rear fin                  x1  (yellow)
    2. Solar panel holder       x1  (red)
    3. Bottle holder shafts     x2  (green)

  Units: millimetres.

  DESIGN PRINCIPLE
  ----------------
  The geometry is driven first by the bottle, wood and solar-panel variables
  in the FOUNDATION VARIABLES section. Change those values for a new bottle
  or panel and the dependent dimensions update automatically.
*/

$fn = 96;

// ============================================================================
// FOUNDATION VARIABLES — change these for a different bottle / stock / panel
// ============================================================================

cap_diameter       = 35;   // bottle cap OD; used by optional bottle mockup
wood_thickness     = 12;   // common stock thickness; drives slots and board thicknesses
bottle_height      = 305;  // overall bottle height
cap_height         = 17;   // cap / neck section used in shaft-length formula
bottle_diameter    = 82;   // main bottle body diameter
solar_panel_width  = 148;  // drives red solar-holder board length
fin_board_width    = 93;   // main front-to-rear width of yellow fin board

// ============================================================================
// FIT / TUNING VARIABLES — small allowances that usually stay the same
// ============================================================================

half_lap_clearance       = 0.0;  // extra clearance in green/yellow half-lap
solar_slot_clearance     = 0.0;  // extra clearance around fin in red slot

// Longitudinal position of cap hole from the free end of each green shaft.
// This was not dimensioned in the original drawing, so it remains tunable.
shaft_hole_from_front    = 50;

// ============================================================================
// DERIVED DIMENSIONS — normally do NOT edit these
// ============================================================================

// Green shaft length:
// bottle height + 2/3 * (fin-board width - 2 * wood thickness) - cap height
shaft_length =
    bottle_height
    + (2/3 * (fin_board_width - 2 * wood_thickness))
    - cap_height;

shaft_width         = 59;
shaft_thickness     = wood_thickness;
m6_hole_diameter    = 6;
shaft_hole_diameter = m6_hole_diameter;

// --------------------------------------------------------------------------
// GREEN / YELLOW EDGE-SLOT JOINT
// --------------------------------------------------------------------------
// Yellow-fin and green-board slots use the SAME master dimensions:
//
//   slot depth     = (fin-board width - 2 x wood thickness) / 2
//   slot thickness = one wood thickness
//
// With the current values:
//   (93 - 24) / 2 = 34.5 mm slot depth
//   12 mm wood = 12 mm slot thickness
//
// The yellow slots open from the front edge of the fin.
// The matching green slots use the exact same depth.

joint_slot_depth = (fin_board_width - 2 * wood_thickness) / 2;
joint_slot_thickness = wood_thickness;

// Clear vertical distance between the two complete green shafts.
shaft_gap = bottle_diameter;

// --------------------------------------------------------------------------
// REAR FIN
// --------------------------------------------------------------------------

fin_rear_tab_width = 15;
fin_width          = fin_board_width + fin_rear_tab_width;
fin_height         = 3 * bottle_diameter;
fin_thickness      = wood_thickness;

// 45-degree lower cut.
// The cut begins 2/3 of one bottle diameter above the bottom at the front
// edge. Because it is 45 degrees, horizontal run = vertical rise.
fin_diagonal_rise = (2/3) * bottle_diameter;
fin_diagonal_run  = fin_diagonal_rise;
fin_bottom_flat   = fin_width - fin_diagonal_run;

// --------------------------------------------------------------------------
// RED SOLAR-PANEL HOLDER
// --------------------------------------------------------------------------

solar_holder_length      = solar_panel_width;
solar_holder_height      = 3 * wood_thickness;
solar_holder_thickness   = wood_thickness;
red_yellow_slot_depth    = 1.5 * wood_thickness;
solar_holder_notch_depth = red_yellow_slot_depth;
solar_holder_bottom_chamfer = 1.5 * wood_thickness;
solar_holder_notch_width = fin_thickness + solar_slot_clearance;

// --------------------------------------------------------------------------
// SHAFT + SOLAR-HOLDER POSITIONS
// --------------------------------------------------------------------------
//
// Upper green-board slot:
//   top of slot = 2 x wood thickness down from top of yellow fin
//
// Therefore the upper green board occupies:
//   fin_height - 3t  through  fin_height - 2t
//
// The red board begins exactly at the TOP of that green board, so the
// green board rests flush against the bottom of the red solar holder.

upper_green_top_offset = 2 * wood_thickness;

upper_shaft_z1 = fin_height - upper_green_top_offset;
upper_shaft_z0 = upper_shaft_z1 - shaft_thickness;

lower_shaft_z1 = upper_shaft_z0 - shaft_gap;
lower_shaft_z0 = lower_shaft_z1 - shaft_thickness;

fin_upper_joint_z0 = upper_shaft_z0;
fin_lower_joint_z0 = lower_shaft_z0;



// Solar-holder receiving notch in yellow fin.
//
// The notch is one wood thickness in from the ACTUAL RIGHT/BACK edge
// of the complete yellow fin, including its rear tab. The notch itself is one wood thickness wide and
// penetrates downward by the same depth as the red-board slot.
fin_solar_notch_width = solar_holder_thickness;
fin_solar_notch_depth = red_yellow_slot_depth;
fin_solar_right_inset  = wood_thickness;

fin_solar_notch_x0 =
    fin_width
    - fin_solar_right_inset
    - fin_solar_notch_width;

// Rear end of each green shaft abuts the front face of the red board.
shaft_rear_x = fin_solar_notch_x0;
// Green slot starts exactly one joint-slot-depth ahead of the red board.
green_slot_inset_x = shaft_rear_x - joint_slot_depth;


// Upright red holder is perpendicular to the yellow fin and drops into
// its rear receiving slot. Its bottom is flush with the upper green board.
solar_holder_x0 = fin_solar_notch_x0;
solar_holder_z0 = upper_shaft_z0;


// ============================================================================
// CORE PARAMETRIC RELATIONSHIPS
// ============================================================================
//
// green/yellow slot depth = (fin_board_width - 2 * wood_thickness) / 2
// green shaft length      = bottle_height - cap_height - wood_thickness
//                           + joint_slot_depth
// yellow fin height       = 3 * bottle_diameter
// green-board gap         = bottle_diameter
// fin lower 45° rise      = 2/3 * bottle_diameter
// red holder height       = 3 * wood_thickness
// red/yellow slot depth   = 1.5 * wood_thickness
// red holder chamfers     = 1.5 * wood_thickness
//

// ============================================================================
// DISPLAY CONTROLS
// ============================================================================

show_fin           = true;
show_solar_holder  = true;
show_shafts        = true;
show_bottle_mockup = false;
exploded           = 0;    // 0 = assembled; try 20–60 for exploded view

// ============================================================================
// SANITY CHECKS
// ============================================================================

assert(shaft_length > fin_board_width,
       "Derived shaft_length must be longer than the fin board width.");
assert(lower_shaft_z0 >= fin_diagonal_rise,
       "Lower shaft is too low and intersects the 45-degree fin cut.");
assert(fin_bottom_flat >= 0,
       "Bottle diameter is too large for the current fin width and 45-degree cut.");
assert(fin_board_width > 2 * wood_thickness,
       "Fin board width must exceed 2x wood thickness.");
assert(joint_slot_depth > 0 && joint_slot_depth < fin_board_width,
       "Joint slot depth must be between 0 and the fin-board width.");
assert(green_slot_inset_x >= 0,
       "Green slot inset became negative; fin is too narrow for 3x wood thickness.");
assert(fin_solar_notch_x0 >= 0,
       "Solar slot position became negative; fin is too narrow.");
assert(abs((fin_width - (fin_solar_notch_x0 + fin_solar_notch_width)) - wood_thickness) < 0.001,
       "Red slot must leave exactly one wood thickness behind it.");
assert(abs(solar_holder_z0 - upper_shaft_z0) < 0.001,
       "Red holder bottom must be flush with upper green-board bottom.");
assert(abs((solar_holder_z0 + solar_holder_height) - fin_height) < 0.001,
       "Red holder top must be flush with yellow fin top.");
assert(abs(solar_holder_notch_depth - fin_solar_notch_depth) < 0.001,
       "Red and yellow solar-holder slot depths must match.");
assert(abs(solar_holder_notch_width - fin_thickness) < 0.001,
       "Red slot must be centered on yellow fin thickness.");
assert(2 * solar_holder_bottom_chamfer + solar_holder_notch_width <= solar_holder_length,
       "Red bottom chamfer is too large for the solar-holder length.");
assert(abs((green_slot_inset_x + joint_slot_depth) - shaft_rear_x) < 0.001,
       "Green slot must terminate exactly at the red-board face.");

// Helpful values printed in OpenSCAD's console.
echo("Derived shaft length = ", shaft_length, " mm");
echo("Green-board M6 hole diameter = ", shaft_hole_diameter, " mm");
echo("Bottle gap between shafts = ", shaft_gap, " mm");
echo("Fin height = ", fin_height, " mm");
echo("Green/yellow slot depth = ", joint_slot_depth, " mm");
echo("Green/yellow slot thickness = ", joint_slot_thickness, " mm");
echo("Solar holder length = ", solar_holder_length, " mm");
echo("Solar holder height = ", solar_holder_height, " mm");
echo("Green slot inset X = ", green_slot_inset_x, " mm");
echo("Upper green slot top offset = ", upper_green_top_offset, " mm");
echo("Solar notch right inset = ", fin_solar_right_inset, " mm");
echo("Solar notch depth = ", fin_solar_notch_depth, " mm");
echo("Actual fin back edge X = ", fin_width, " mm");
echo("Red slot X start = ", fin_solar_notch_x0, " mm");
echo("Material behind red slot = ", fin_width - (fin_solar_notch_x0 + fin_solar_notch_width), " mm");
echo("Red holder bottom Z = ", solar_holder_z0, " mm");
echo("Upper green board bottom Z = ", upper_shaft_z0, " mm");
echo("Red holder top Z = ", solar_holder_z0 + solar_holder_height, " mm");
echo("Yellow fin top Z = ", fin_height, " mm");
echo("Red/yellow matching slot depth = ", solar_holder_notch_depth, " mm");
echo("Red bottom chamfer run = ", solar_holder_bottom_chamfer, " mm");
echo("Green shaft rear / red front X = ", shaft_rear_x, " mm");
echo("Green slot X start = ", green_slot_inset_x, " mm");
echo("Solar holder slot depth = ", solar_holder_notch_depth, " mm");
echo("Fin total width = ", fin_width, " mm");
echo("45-degree cut start height = ", fin_diagonal_rise, " mm");
echo("Bottom flat length = ", fin_bottom_flat, " mm");

// ============================================================================
// MODULES
// ============================================================================

module rear_fin() {
    // Side profile built in XY and extruded through wood thickness.
    // After rotation: profile-Y becomes world-Z; extrusion becomes world-Y.
    color([1.0, 0.72, 0.05])
    rotate([90, 0, 0])
    linear_extrude(height=fin_thickness, center=true)
    difference() {
        polygon(points=[
            [0, fin_diagonal_rise],
            [fin_diagonal_run, 0],
            [fin_width, 0],
            [fin_width, fin_height],
            [0, fin_height]
        ]);

        // Upper green-board receiving slot:
        // depth = joint_slot_depth; opening = one wood thickness.
        translate([green_slot_inset_x, fin_upper_joint_z0])
            square([joint_slot_depth,
                    joint_slot_thickness + half_lap_clearance]);

        // Lower green-board receiving slot.
        translate([green_slot_inset_x, fin_lower_joint_z0])
            square([joint_slot_depth,
                    joint_slot_thickness + half_lap_clearance]);

        // Vertical receiving slot for the upright red solar holder.
        // Opens from the top by 1.5 x wood thickness, matching the red-board slot.
        translate([fin_solar_notch_x0,
                   fin_height - fin_solar_notch_depth])
            square([fin_solar_notch_width + 0.02,
                    fin_solar_notch_depth + 0.02]);
    }
}

module bottle_holder_shaft(z0=0) {
    // Rear face of each shaft stops against the front face of the red holder.
    x0 = shaft_rear_x - shaft_length;

    color([0.20, 0.38, 0.05])
    difference() {
        translate([x0, -shaft_width/2, z0])
            cube([shaft_length, shaft_width, shaft_thickness]);

        // M6 hole through each green board.
        translate([x0 + shaft_hole_from_front,
                   0,
                   z0 - 1])
            cylinder(h=shaft_thickness + 2,
                     d=shaft_hole_diameter);

        // Matching slot in the green board.
        // Its depth is EXACTLY joint_slot_depth =
        // (fin_board_width - 2 * wood_thickness) / 2.
        // The slot terminates at the rear end of the green board, which
        // itself stops against the front face of the red board.
        translate([green_slot_inset_x,
                   -joint_slot_thickness/2,
                   z0 - 0.01])
            cube([joint_slot_depth + 0.02,
                  joint_slot_thickness + half_lap_clearance,
                  shaft_thickness + 0.02]);
    }
}


module solar_panel_holder() {

    color("red")
    translate([solar_holder_x0, 0, solar_holder_z0])
    rotate([90, 0, 90])
    translate([-solar_holder_length/2, 0, 0])
    difference() {

        // Main upright red board.
        // Local X = board length, local Y = board height,
        // local Z = board thickness.
        linear_extrude(height = solar_holder_thickness)
        difference() {
            square([solar_holder_length, solar_holder_height]);

            // Left bottom 45-degree cut.
            polygon(points=[
                [0, 0],
                [solar_holder_bottom_chamfer, 0],
                [0, solar_holder_bottom_chamfer]
            ]);

            // Right bottom 45-degree cut.
            polygon(points=[
                [solar_holder_length, 0],
                [solar_holder_length - solar_holder_bottom_chamfer, 0],
                [solar_holder_length, solar_holder_bottom_chamfer]
            ]);
        }

        // Center slot in the red board.
        // Width = yellow-fin thickness.
        // Depth = exactly 1.5 x wood thickness.
        translate([
            (solar_holder_length - solar_holder_notch_width) / 2,
            0,
            -0.01
        ])
            cube([
                solar_holder_notch_width,
                solar_holder_notch_depth + 0.01,
                solar_holder_thickness + 0.02
            ]);
    }
}

module bottle_mockup() {
    // Visual-only bottle envelope based on the foundation bottle dimensions.
    // Body axis follows the green shafts (X direction).
    zc = lower_shaft_z1 + shaft_gap/2;

    color([0.0, 0.85, 0.95, 0.35])
    translate([shaft_rear_x - bottle_height, 0, zc])
    rotate([0, 90, 0])
        cylinder(h=bottle_height,
                 d=bottle_diameter);

    // Simple cap envelope at the free end for visual checking.
    color([0.0, 0.25, 1.0, 0.55])
    translate([shaft_rear_x - bottle_height - cap_height, 0, zc])
    rotate([0, 90, 0])
        cylinder(h=cap_height,
                 d=cap_diameter);
}



// ============================================================================
// ASSEMBLY / EXPLODED VIEW
// ============================================================================
//
// `exploded = 0`   -> fully assembled
// `exploded = 20`  -> modest separation
// `exploded = 60`  -> widely separated inspection view
//
// Every part is modeled in its true assembled position.  The translations
// below are ONLY display offsets, multiplied by `exploded`.

module assembly_view() {

    // Yellow fin remains the reference part.
    if (show_fin)
        rear_fin();

    // Upper green shaft: move left and upward as exploded increases.
    if (show_shafts)
        translate([-exploded, 0, exploded])
            bottle_holder_shaft(upper_shaft_z0);

    // Lower green shaft: move left and downward.
    if (show_shafts)
        translate([-exploded, 0, -exploded])
            bottle_holder_shaft(lower_shaft_z0);

    // Red solar holder: move right and upward.
    if (show_solar_holder)
        translate([exploded, 0, exploded])
            solar_panel_holder();

    // Bottle mockup follows neither exploded green piece; it is intended
    // only as an assembled dimensional reference.
    if (show_bottle_mockup && exploded == 0)
        bottle_mockup();
}

assembly_view();
"""


def positive_number(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return number


def ask(label: str, default: float) -> float:
    raw = input(f"{label} [{default:g} mm]: ").strip()
    return default if not raw else positive_number(raw)


def replace_scad_value(scad: str, variable: str, value: float) -> str:
    pattern = rf"^(\s*{re.escape(variable)}\s*=\s*)[0-9.]+(\s*;)"
    replacement = rf"\g<1>{value:g}\g<2>"
    updated, count = re.subn(pattern, replacement, scad, count=1, flags=re.M)
    if count != 1:
        raise RuntimeError(f"Could not update SCAD variable: {variable}")
    return updated


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Generate a Hope Turtle rear-fin OpenSCAD model."
    )
    p.add_argument("--cap-diameter", type=positive_number)
    p.add_argument("--wood-thickness", type=positive_number)
    p.add_argument("--bottle-height", type=positive_number)
    p.add_argument("--cap-height", type=positive_number)
    p.add_argument("--bottle-diameter", type=positive_number)
    p.add_argument("--solar-panel-width", type=positive_number)
    p.add_argument("--fin-board-width", type=positive_number)
    p.add_argument(
        "--output",
        default="turtle_rear_fin_generated.scad",
        help="Output SCAD filename (default: %(default)s)",
    )
    p.add_argument(
        "--exploded",
        type=float,
        default=0,
        help="Initial exploded-view distance written into the SCAD file.",
    )
    return p


def main() -> None:
    args = build_parser().parse_args()

    mapping = {
        "cap_diameter": args.cap_diameter,
        "wood_thickness": args.wood_thickness,
        "bottle_height": args.bottle_height,
        "cap_height": args.cap_height,
        "bottle_diameter": args.bottle_diameter,
        "solar_panel_width": args.solar_panel_width,
        "fin_board_width": args.fin_board_width,
    }

    labels = {
        "cap_diameter": "Cap diameter",
        "wood_thickness": "Wood thickness",
        "bottle_height": "Bottle height",
        "cap_height": "Cap height",
        "bottle_diameter": "Bottle diameter",
        "solar_panel_width": "Solar panel width",
        "fin_board_width": "Fin board width",
    }

    # Prompt only for values not supplied on the command line.
    for variable, supplied in list(mapping.items()):
        if supplied is None:
            mapping[variable] = ask(labels[variable], DEFAULTS[variable])

    # Basic input sanity checks before generating.
    t = mapping["wood_thickness"]
    fw = mapping["fin_board_width"]
    if fw <= 2 * t:
        raise SystemExit(
            "Fin board width must be greater than 2 × wood thickness "
            "so the green/yellow slot depth remains positive."
        )

    scad = SCAD_TEMPLATE
    for variable, value in mapping.items():
        scad = replace_scad_value(scad, variable, value)

    scad = re.sub(
        r"^(\s*exploded\s*=\s*)[-0-9.]+(\s*;)",
        rf"\g<1>{args.exploded:g}\g<2>",
        scad,
        count=1,
        flags=re.M,
    )

    output = Path(args.output).expanduser()
    output.write_text(scad)

    joint_depth = (fw - 2 * t) / 2
    shaft_length = (
        mapping["bottle_height"]
        + (2/3) * (fw - 2 * t)
        - mapping["cap_height"]
    )

    print(f"Wrote: {output.resolve()}")
    print(f"Green/yellow slot depth: {joint_depth:g} mm")
    print(f"Green shaft length: {shaft_length:g} mm")
    print(f"Yellow fin height: {3 * mapping['bottle_diameter']:g} mm")
    print(f"Red holder height: {3 * t:g} mm")
    print(f"Red/yellow slot depth: {1.5 * t:g} mm")


if __name__ == "__main__":
    main()