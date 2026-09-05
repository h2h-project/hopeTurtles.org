#!/usr/bin/env python3
"""
Generate the Hope Turtle bottom ballast OpenSCAD assembly.

If a dimension is omitted on the command line, the script asks for it
interactively and shows the current design value as the default.

All dimensions are millimetres.

Example:
    python3 generate_turtle_ballast.py \
        --wood-thickness 15 \
        --bottle-height 320 \
        --bottle-diameter 82 \
        --cap-height 17 \
        --cap-diameter 35 \
        --port-height 80 \
        --fin-board-width 93 \
        --output turtle_ballast_generated.scad
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

DEFAULTS = {
    "wood_thickness": 15,
    "bottle_height": 320,
    "bottle_diameter": 82,
    "cap_height": 17,
    "cap_diameter": 35,
    "port_height": 80,
    "fin_board_width": 93,
}

SCAD_TEMPLATE = r"""/*
    Hope Turtle — Bottom Ballast Assembly Study v1
    Green bottle-cover slat + orange ballast-bottom board
    Units: millimetres
*/

$fn = 64;


// ============================================================================
// FOUNDATION VARIABLES
// ============================================================================

wood_thickness  = 15;
bottle_height   = 320;
bottle_diameter = 82;
cap_height      = 17;
cap_diameter    = 35;
port_height     = 80;
fin_board_width = 93;


// ============================================================================
// GREEN CORE SLAT — DERIVED DIMENSIONS
// ============================================================================

slat_width =
    bottle_diameter - 2 * wood_thickness;

slat_height =
    bottle_height
    - cap_height
    + 4.5 * wood_thickness;

lower_lobe_height = 2 * wood_thickness;
upper_lobe_height = 2 * wood_thickness;

slot_height = wood_thickness;

slot_depth =
    slat_width / 2;

neck_width =
    bottle_diameter - 3 * wood_thickness;

shoulder_step =
    slat_width - neck_width;

upper_neck_start_z =
    slat_height - port_height;

upper_diagonal_start_z =
    upper_neck_start_z + shoulder_step;

slot_z0 = lower_lobe_height;
slot_z1 = slot_z0 + slot_height;

lower_full_width_return_z =
    slot_z1 + upper_lobe_height;

lower_neck_start_z =
    lower_full_width_return_z + shoulder_step;


// ============================================================================
// ORANGE BALLAST-BOTTOM BOARD — DERIVED DIMENSIONS
// ============================================================================

// Overall board size
// Length = 3.5 bottle diameters
ballast_bottom_length =
    3.5 * bottle_diameter;

ballast_bottom_width =
    fin_board_width;

// All five slots accept the same wood stock.
ballast_slot_width =
    wood_thickness;

// Slot penetration from either long edge.
ballast_slot_depth =
    fin_board_width / 3;

// Middle of the three center-family slots is deeper.
center_ballast_slot_depth =
    bottle_diameter / 2;


// Three slots from the FRONT long edge.
// Center slot is centered on the whole board.
// Left and right slots are one bottle diameter apart in total,
// with the center slot exactly midway between them.
center_slot_center =
    ballast_bottom_length / 2;

left_slot_center =
    center_slot_center - bottle_diameter / 2;

right_slot_center =
    center_slot_center + bottle_diameter / 2;


// Two slots from the REAR long edge.
//
// Interpreting "two board widths from the sides" as:
// the NEAR EDGE of each slot begins 2 x wood_thickness from the board end.
end_slot_edge_offset =
    2 * wood_thickness;

left_end_slot_x0 =
    end_slot_edge_offset;

right_end_slot_x0 =
    ballast_bottom_length
    - end_slot_edge_offset
    - ballast_slot_width;


// ============================================================================
// RED BALLAST LOCK PIECE — DERIVED DIMENSIONS
// ============================================================================

red_piece_width =
    5 * wood_thickness;

red_piece_height =
    5 * wood_thickness;

red_piece_thickness =
    wood_thickness;

// Center slot opens from the LEFT edge and penetrates half the piece width.
red_slot_depth =
    red_piece_width / 2;

red_slot_height =
    wood_thickness;

// 45-degree cuts begin 1.5 board thickness down from the top and up from bottom.
red_chamfer =
    1.5 * wood_thickness;


// ============================================================================
// YELLOW BOTTOM BALLAST FIN — DERIVED DIMENSIONS
// ============================================================================

// Overall fin dimensions
ballast_fin_length =
    3 * bottle_diameter;

ballast_fin_height =
    fin_board_width;

ballast_fin_thickness =
    wood_thickness;

// Lower protrusion below the slot
ballast_fin_lower_protrusion =
    2 * wood_thickness;

// Slot opening accepts one board thickness
ballast_fin_slot_height =
    wood_thickness;

// Slot penetrates inward from the left edge by half a bottle diameter
ballast_fin_slot_depth =
    bottle_diameter / 2;


// Large upper relief in the yellow fin.
// It begins 1.5 board thicknesses above the TOP of the existing lower slot
// and removes material all the way to the top edge.
ballast_fin_upper_cut_depth =
    bottle_diameter;

ballast_fin_upper_cut_z0 =
    ballast_fin_lower_protrusion
    + ballast_fin_slot_height
    + 1.5 * wood_thickness;

// Bottom-front 45-degree chamfer.
ballast_fin_front_chamfer =
    1.5 * wood_thickness;


// ============================================================================
// SANITY CHECKS
// ============================================================================

assert(slat_width > 0,
       "Bottle diameter must exceed 2x wood thickness.");

assert(neck_width > 0,
       "Bottle diameter must exceed 3x wood thickness.");

assert(ballast_bottom_length > 0,
       "Ballast-bottom length must be positive.");

assert(ballast_slot_depth > 0 &&
       ballast_slot_depth < ballast_bottom_width,
       "Ballast slot depth must be between 0 and full board width.");

assert(left_slot_center - ballast_slot_width/2 > 0,
       "Left center-family slot is too close to board end.");

assert(right_slot_center + ballast_slot_width/2 < ballast_bottom_length,
       "Right center-family slot is too close to board end.");

assert(red_chamfer * 2 < red_piece_height,
       "Red chamfers are too large for the red piece height.");

assert(red_slot_depth > 0 && red_slot_depth < red_piece_width,
       "Red slot depth must be between 0 and red piece width.");

assert(ballast_fin_length > ballast_fin_slot_depth,
       "Ballast fin must be longer than its slot depth.");
assert(abs(center_ballast_slot_depth - ballast_fin_slot_depth) < 0.001,
       "Center orange and yellow slot depths must match.");
assert(abs((ballast_bottom_width - ballast_slot_depth) - ((ballast_bottom_width - ballast_slot_depth - red_slot_depth) + red_slot_depth)) < 0.001,
       "Red slot inner face must align with orange slot inner face.");


assert(ballast_fin_lower_protrusion + ballast_fin_slot_height < ballast_fin_height,
       "Ballast fin is too short for the lower protrusion and slot.");

assert(ballast_fin_upper_cut_depth < ballast_fin_length,
       "Yellow upper cut depth must be less than the fin length.");

assert(ballast_fin_upper_cut_z0 < ballast_fin_height,
       "Yellow upper cut starts above the fin top; reduce the offset or increase fin height.");

assert(ballast_fin_front_chamfer < ballast_fin_height,
       "Yellow front chamfer is too large for the fin height.");


// ============================================================================
// GREEN CORE SLAT PROFILE
// ============================================================================

module ballast_core_profile_2d() {

    polygon(points=[
        [0, 0],
        [slat_width, 0],
        [slat_width, slat_height],
        [0, slat_height],
        [0, upper_diagonal_start_z],
        [shoulder_step, upper_neck_start_z],
        [shoulder_step, lower_neck_start_z],
        [0, lower_full_width_return_z],
        [0, slot_z1],
        [slot_depth, slot_z1],
        [slot_depth, slot_z0],
        [0, slot_z0]
    ]);
}

module ballast_core_slat() {
    color("green")
        linear_extrude(height = wood_thickness)
            ballast_core_profile_2d();
}


// ============================================================================
// ORANGE BALLAST-BOTTOM BOARD
// ============================================================================

module ballast_bottom_board() {

    color("orange")
    linear_extrude(height = wood_thickness)
    difference() {

        square([
            ballast_bottom_length,
            ballast_bottom_width
        ]);

        // ------------------------------------------------------------
        // Three slots from the front / lower long edge
        // ------------------------------------------------------------

        // Slot 1
        translate([
            left_slot_center - ballast_slot_width/2,
            -0.01
        ])
            square([
                ballast_slot_width,
                ballast_slot_depth + 0.01
            ]);

        // Slot 2 — CENTER slot, depth = 1/2 bottle diameter
        translate([
            center_slot_center - ballast_slot_width/2,
            -0.01
        ])
            square([
                ballast_slot_width,
                center_ballast_slot_depth + 0.01
            ]);

        // Slot 3
        translate([
            right_slot_center - ballast_slot_width/2,
            -0.01
        ])
            square([
                ballast_slot_width,
                ballast_slot_depth + 0.01
            ]);

        // ------------------------------------------------------------
        // Two slots from the rear / upper long edge
        // ------------------------------------------------------------

        translate([
            left_end_slot_x0,
            ballast_bottom_width - ballast_slot_depth
        ])
            square([
                ballast_slot_width,
                ballast_slot_depth + 0.01
            ]);

        translate([
            right_end_slot_x0,
            ballast_bottom_width - ballast_slot_depth
        ])
            square([
                ballast_slot_width,
                ballast_slot_depth + 0.01
            ]);
    }
}



// ============================================================================
// RED BALLAST LOCK PIECE
// ============================================================================
//
// Profile based on the supplied sketch:
//   - 5t wide
//   - 5t high
//   - centered slot from left edge
//   - slot depth = 1/2 piece width
//   - top-right and bottom-right 45° chamfers
//   - chamfer size = 1.5t

module red_ballast_lock_profile_2d() {

    slot_y0 = (red_piece_height - red_slot_height) / 2;
    slot_y1 = slot_y0 + red_slot_height;

    polygon(points=[
        // bottom-left
        [0, 0],

        // bottom edge to start of lower 45° chamfer
        [red_piece_width - red_chamfer, 0],

        // lower 45° chamfer to right edge
        [red_piece_width, red_chamfer],

        // right edge to upper chamfer
        [red_piece_width, red_piece_height - red_chamfer],

        // upper 45° chamfer
        [red_piece_width - red_chamfer, red_piece_height],

        // top-left
        [0, red_piece_height],

        // down left edge to upper slot wall
        [0, slot_y1],

        // slot inward
        [red_slot_depth, slot_y1],
        [red_slot_depth, slot_y0],

        // back to left edge
        [0, slot_y0]
    ]);
}

module red_ballast_lock() {
    color("red")
        linear_extrude(height = red_piece_thickness)
            red_ballast_lock_profile_2d();
}



// ============================================================================
// YELLOW BOTTOM BALLAST FIN
// ============================================================================
//
// First-pass profile:
//   - length = 3 x bottle diameter
//   - height = fin_board_width
//   - thickness = wood thickness
//   - lower protrusion below slot = 2 x wood thickness
//   - slot height = wood thickness
//   - slot depth = 1/2 bottle diameter
//
// Additional shoulders / top geometry can be added once this core fit is right.

module ballast_fin_profile_2d() {

    slot_z0 = ballast_fin_lower_protrusion;
    slot_z1 = slot_z0 + ballast_fin_slot_height;

    difference() {

        // Main yellow fin outline with bottom-front 45° chamfer.
        polygon(points=[
            [ballast_fin_front_chamfer, 0],
            [ballast_fin_length, 0],
            [ballast_fin_length, ballast_fin_height],
            [0, ballast_fin_height],
            [0, ballast_fin_front_chamfer]
        ]);

        // Existing lower slot enters from the left/front edge.
        translate([
            -0.01,
            slot_z0
        ])
            square([
                ballast_fin_slot_depth + 0.01,
                ballast_fin_slot_height
            ]);

        // Large upper relief.
        translate([
            -0.01,
            ballast_fin_upper_cut_z0
        ])
            square([
                ballast_fin_upper_cut_depth + 0.01,
                ballast_fin_height - ballast_fin_upper_cut_z0 + 0.01
            ]);
    }
}

module ballast_fin() {
    color("gold")
        linear_extrude(height = ballast_fin_thickness)
            ballast_fin_profile_2d();
}


// ============================================================================
// ASSEMBLY LAYOUT
// ============================================================================
//
// Orange ballast-bottom board lies flat in the XY plane.
//
// Two green core slats are installed into center-family slots 1 and 3.
// Each green slat is rotated 90 degrees to the orange board:
//
//   green thickness -> orange slot width (world X)
//   green profile width -> orange board width direction (world Y)
//   green profile height -> vertical (world Z)
//
// The green slat's lower slot is aligned with the orange board thickness,
// so the two pieces interlock.

module installed_green_slat(slot_center_x) {

    // Mapping:
    // local X -> world Y
    // local Y -> world Z
    // local Z -> world X
    //
    // X translation centers the 15 mm green thickness in the orange slot.
    // Z translation brings the green lower slot (slot_z0..slot_z1)
    // down around the orange board (0..wood_thickness).
    multmatrix([
        [0, 0, 1, slot_center_x - wood_thickness/2],
        [-1, 0, 0, slat_width],
        [0, 1, 0, -slot_z0],
        [0, 0, 0, 1]
    ])
        ballast_core_slat();
}



module installed_red_foot(slot_x0) {

    foot_center_x =
        slot_x0 + ballast_slot_width/2;

    // Orange rear-edge slot inner face.
    orange_slot_inner_y =
        ballast_bottom_width - ballast_slot_depth;

    // Push the red foot inward until the CLOSED / inner end of the red slot
    // is flush with the CLOSED / inner end of the orange slot.
    //
    // Red slot spans:
    //   red_origin_y ... red_origin_y + red_slot_depth
    //
    // Therefore:
    //   red_origin_y + red_slot_depth = orange_slot_inner_y
    red_origin_y =
        orange_slot_inner_y - red_slot_depth;

    red_slot_y0 =
        (red_piece_height - red_slot_height) / 2;

    multmatrix([
        [0, 0, 1, foot_center_x - red_piece_thickness/2],
        [1, 0, 0, red_origin_y],
        [0, 1, 0, -red_slot_y0],
        [0, 0, 0, 1]
    ])
        red_ballast_lock();
}



module installed_ballast_fin() {

    fin_center_x =
        center_slot_center;

    // Push the yellow fin inward until the CLOSED end of its slot is flush
    // with the CLOSED end of the orange center slot.
    //
    // Orange center slot inner face:
    orange_center_inner_y =
        center_ballast_slot_depth;

    // Yellow local X maps toward -world Y.
    // Its slot therefore spans:
    //   yellow_origin_y - ballast_fin_slot_depth ... yellow_origin_y
    //
    // Set its closed/inner end equal to orange_center_inner_y:
    yellow_origin_y =
        orange_center_inner_y + ballast_fin_slot_depth;

    multmatrix([
        [0, 0, 1, fin_center_x - ballast_fin_thickness/2],
        [-1, 0, 0, yellow_origin_y],
        [0, 1, 0, -ballast_fin_lower_protrusion],
        [0, 0, 0, 1]
    ])
        ballast_fin();
}


module ballast_assembly() {

    ballast_bottom_board();

    // Red feet installed in the two far-edge slots.
    // Each is rotated 180 degrees from v6 so its slot engages the
    // orange slot from the opposite direction: slot-to-slot.
    installed_red_foot(left_end_slot_x0);
    installed_red_foot(right_end_slot_x0);

    // Center-family slot 1
    installed_green_slat(left_slot_center);

    // Center-family slot 3
    installed_green_slat(right_slot_center);

    // Yellow bottom ballast fin engages the CENTER orange slot, slot-to-slot.
    installed_ballast_fin();
}


ballast_assembly();



// ============================================================================
// CURRENT DERIVED VALUES
// ============================================================================

echo("GREEN slat width = ", slat_width, " mm");
echo("GREEN slat height = ", slat_height, " mm");
echo("GREEN bottom slot depth = ", slot_depth, " mm");

echo("ORANGE board length (3.5 bottle diameters) = ", ballast_bottom_length, " mm");
echo("ORANGE board width = ", ballast_bottom_width, " mm");
echo("ORANGE slot width = ", ballast_slot_width, " mm");
echo("ORANGE slot depth = ", ballast_slot_depth, " mm");
echo("ORANGE CENTER slot depth = ", center_ballast_slot_depth, " mm");

echo("ORANGE center slot center = ", center_slot_center, " mm");
echo("ORANGE left slot center = ", left_slot_center, " mm");
echo("ORANGE right slot center = ", right_slot_center, " mm");

echo("ORANGE end-slot edge offset = ", end_slot_edge_offset, " mm");
echo("RED piece width = ", red_piece_width, " mm");
echo("RED piece height = ", red_piece_height, " mm");
echo("RED slot depth = ", red_slot_depth, " mm");
echo("RED chamfer = ", red_chamfer, " mm");

echo("YELLOW ballast fin length = ", ballast_fin_length, " mm");
echo("YELLOW ballast fin height = ", ballast_fin_height, " mm");
echo("YELLOW lower protrusion = ", ballast_fin_lower_protrusion, " mm");
echo("YELLOW slot height = ", ballast_fin_slot_height, " mm");
echo("YELLOW slot depth = ", ballast_fin_slot_depth, " mm");
echo("YELLOW upper cut depth = ", ballast_fin_upper_cut_depth, " mm");
echo("YELLOW upper cut start Z = ", ballast_fin_upper_cut_z0, " mm");
echo("YELLOW front chamfer = ", ballast_fin_front_chamfer, " mm");
echo("RED foot pushed-in origin Y = ", (ballast_bottom_width - ballast_slot_depth) - red_slot_depth, " mm");
echo("YELLOW fin pushed-in origin Y = ", center_ballast_slot_depth + ballast_fin_slot_depth, " mm");

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
        description="Generate a parametric Hope Turtle bottom-ballast SCAD."
    )
    p.add_argument("--wood-thickness", type=positive_number)
    p.add_argument("--bottle-height", type=positive_number)
    p.add_argument("--bottle-diameter", type=positive_number)
    p.add_argument("--cap-height", type=positive_number)
    p.add_argument("--cap-diameter", type=positive_number)
    p.add_argument("--port-height", type=positive_number)
    p.add_argument("--fin-board-width", type=positive_number)
    p.add_argument(
        "--output",
        default="turtle_ballast_generated.scad",
        help="Output SCAD filename (default: %(default)s)",
    )
    return p


def validate(values: dict[str, float]) -> None:
    t = values["wood_thickness"]
    bd = values["bottle_diameter"]
    fw = values["fin_board_width"]
    ph = values["port_height"]
    bh = values["bottle_height"]
    ch = values["cap_height"]

    if bd <= 3 * t:
        raise SystemExit(
            "Bottle diameter must be greater than 3 × wood thickness "
            "so the green neck width remains positive."
        )

    if fw <= 0:
        raise SystemExit("Fin board width must be positive.")

    slat_height = bh - ch + 4.5 * t
    shoulder_step = (bd - 2*t) - (bd - 3*t)  # simplifies to t

    if ph <= shoulder_step:
        raise SystemExit(
            "Port height must be greater than the 45-degree shoulder rise "
            f"({shoulder_step:g} mm for these inputs)."
        )

    if fw <= 1.5 * t:
        raise SystemExit(
            "Fin board width is too small relative to wood thickness "
            "for the current ballast-fin cuts."
        )


def main() -> None:
    args = build_parser().parse_args()

    mapping = {
        "wood_thickness": args.wood_thickness,
        "bottle_height": args.bottle_height,
        "bottle_diameter": args.bottle_diameter,
        "cap_height": args.cap_height,
        "cap_diameter": args.cap_diameter,
        "port_height": args.port_height,
        "fin_board_width": args.fin_board_width,
    }

    labels = {
        "wood_thickness": "Wood thickness",
        "bottle_height": "Bottle height",
        "bottle_diameter": "Bottle diameter",
        "cap_height": "Cap height",
        "cap_diameter": "Cap diameter",
        "port_height": "Port height",
        "fin_board_width": "Fin board width",
    }

    for variable, supplied in list(mapping.items()):
        if supplied is None:
            mapping[variable] = ask(labels[variable], DEFAULTS[variable])

    validate(mapping)

    scad = SCAD_TEMPLATE
    for variable, value in mapping.items():
        scad = replace_scad_value(scad, variable, value)

    output = Path(args.output).expanduser()
    output.write_text(scad)

    t = mapping["wood_thickness"]
    bd = mapping["bottle_diameter"]
    bh = mapping["bottle_height"]
    ch = mapping["cap_height"]
    fw = mapping["fin_board_width"]

    green_width = bd - 2 * t
    green_height = bh - ch + 4.5 * t
    green_slot_depth = green_width / 2
    orange_length = 3.5 * bd
    orange_center_slot_depth = bd / 2
    red_piece_size = 5 * t
    red_slot_depth = red_piece_size / 2
    yellow_length = 3 * bd
    yellow_slot_depth = bd / 2
    yellow_upper_cut_depth = bd
    yellow_chamfer = 1.5 * t

    print(f"Wrote: {output.resolve()}")
    print()
    print("Derived dimensions:")
    print(f"  Green slat width: {green_width:g} mm")
    print(f"  Green slat height: {green_height:g} mm")
    print(f"  Green lower slot depth: {green_slot_depth:g} mm")
    print(f"  Orange board length: {orange_length:g} mm")
    print(f"  Orange center slot depth: {orange_center_slot_depth:g} mm")
    print(f"  Red foot size: {red_piece_size:g} × {red_piece_size:g} mm")
    print(f"  Red foot slot depth: {red_slot_depth:g} mm")
    print(f"  Yellow fin length: {yellow_length:g} mm")
    print(f"  Yellow fin height: {fw:g} mm")
    print(f"  Yellow fin lower slot depth: {yellow_slot_depth:g} mm")
    print(f"  Yellow fin upper relief depth: {yellow_upper_cut_depth:g} mm")
    print(f"  Yellow fin front chamfer: {yellow_chamfer:g} mm")


if __name__ == "__main__":
    main()
