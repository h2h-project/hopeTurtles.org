#!/usr/bin/env python3
"""Generate the standalone Hope Turtle ballast attachment (millimetres).

Geometry and assembly transforms are extracted from the current full Turtle.
No companion SCAD files or third-party Python packages are required.
Slots retain the full model's nominal stock-width fit.

Example:
    python3 generate_turtle_ballast.py --output Turtle_Ballast.scad
    python3 generate_turtle_ballast.py --wood-thickness 15 --output ballast_15mm.scad
"""
import argparse
import math
from pathlib import Path

DEFAULTS = {
    "bottle_diameter": 82.0,
    "bottle_height": 305.0,  # Total bottle length, including its cap
    "cap_height": 17.0,
    "wood_thickness": 12.0,
    "fin_board_width": 93.0,
    "port_length": 82.0,
    "mount_hole_diameter": 6.4,
    "screw_side_offset": 25.0,
}
PARTS = ("assembly", "core_slat", "bottom_board", "lock_foot", "fin")

SCAD_GEOMETRY = r"""
ballast_fin_board_width = fin_board_width;

// Explicit aliases for auditability: ballast uses the SAME bottle values.
ballast_bottle_diameter =
    bottle_diameter;

ballast_bottle_height =
    bottle_height;


// --------------------------------------------------------------------------
// GREEN CORE SLATS
// --------------------------------------------------------------------------

ballast_core_width =
    ballast_bottle_diameter - 2 * slat_thickness;

assert(ballast_core_width == port_height - 2 * slat_thickness,
       "Ballast slat width must use the same bottle diameter as the Ecojoiner.");

// Green ballast-slat height.
//
// Base relationship was:
//   bottle_height - cap_height + 4.5 * slat_thickness
//
// Increase by another 1.5 * slat_thickness:
//
ballast_core_height =
    bottle_height
    - cap_height
    + 6.0 * slat_thickness;

assert(
    abs(
        ballast_core_height
        - (bottle_height - cap_height + 6.0 * slat_thickness)
    ) < 0.001,
    "Ballast green-slat height must follow the expanded canonical formula."
);

ballast_lower_lobe_height =
    2 * slat_thickness;

ballast_upper_lobe_height =
    2 * slat_thickness;

ballast_core_slot_height =
    slat_thickness;

ballast_core_slot_depth =
    ballast_core_width / 2;

ballast_neck_width =
    ballast_bottle_diameter - 3 * slat_thickness;

ballast_shoulder_step =
    ballast_core_width - ballast_neck_width;

// Top shoulder geometry.
//
// The 45-degree cut STARTS on the outer edge exactly one shared port_height
// below the top of the green slat.
ballast_upper_diagonal_start =
    ballast_core_height - port_height;

// Because this is a 45-degree cut, moving inward by ballast_shoulder_step
// also moves downward by the same amount.
ballast_upper_neck_start =
    ballast_upper_diagonal_start - ballast_shoulder_step;

assert(
    abs(
        (ballast_core_height - ballast_upper_diagonal_start)
        - port_height
    ) < 0.001,
    "Top ballast shoulder cut must begin exactly one port_height below the slat top."
);

ballast_core_slot_z0 =
    ballast_lower_lobe_height;

ballast_core_slot_z1 =
    ballast_core_slot_z0 + ballast_core_slot_height;

ballast_lower_full_return =
    ballast_core_slot_z1 + ballast_upper_lobe_height;

ballast_lower_neck_start =
    ballast_lower_full_return + ballast_shoulder_step;


// M6 mounting hole.
//
// The adjacent Little John hole is `screw_side_offset` from the OUTER end
// of the John. The seated ballast-slat top is farther inward by:
//
//     slat_thickness + port_length
//
// Therefore the ballast hole must sit this far DOWN from the slat top.
//
ballast_core_mount_hole_diameter =
    screw_diameter;

ballast_core_mount_hole_from_top =
    port_length
    + slat_thickness
    - screw_side_offset;

ballast_core_mount_hole_x =
    ballast_core_width / 2;

ballast_core_mount_hole_y =
    ballast_core_height
    - ballast_core_mount_hole_from_top;


// --------------------------------------------------------------------------
// ORANGE BOTTOM BOARD
// --------------------------------------------------------------------------

ballast_board_length =
    3.5 * ballast_bottle_diameter;

ballast_board_width =
    ballast_fin_board_width;

ballast_board_slot_width =
    slat_thickness;

ballast_board_slot_depth =
    ballast_fin_board_width / 3;

ballast_center_slot_depth =
    ballast_bottle_diameter / 2;

ballast_center_slot =
    ballast_board_length / 2;

// The two green ballast slats must CLEAR the bottle, not have their
// centre-lines separated by the bottle diameter.
//
// Each slat is slat_thickness wide in the radial direction. Therefore:
//
//   clear gap between inner slat faces = bottle_diameter
//
// requires:
//
//   slat centre-to-centre spacing = bottle_diameter + slat_thickness
//
ballast_slat_center_spacing =
    ballast_bottle_diameter + slat_thickness;

ballast_left_slot =
    ballast_center_slot - ballast_slat_center_spacing / 2;

ballast_right_slot =
    ballast_center_slot + ballast_slat_center_spacing / 2;


ballast_bottle_clear_gap =
    ballast_slat_center_spacing - slat_thickness;

assert(abs(ballast_bottle_clear_gap - ballast_bottle_diameter) < 0.001,
       "Ballast slat inner-face gap must equal shared bottle_diameter.");

assert(abs(port_height - bottle_diameter) < 0.001,
       "Ecojoiner port_height must equal canonical bottle_diameter.");

assert(abs(ecojoiner_bottle_height - bottle_height) < 0.001,
       "Ecojoiner bottle-height reference must equal canonical bottle_height.");

assert(abs(ballast_bottle_diameter - bottle_diameter) < 0.001,
       "Ballast bottle diameter must equal canonical bottle_diameter.");

assert(abs(ballast_bottle_height - bottle_height) < 0.001,
       "Ballast bottle height must equal canonical bottle_height.");

ballast_end_slot_offset =
    2 * slat_thickness;

ballast_left_end_slot_x0 =
    ballast_end_slot_offset;

ballast_right_end_slot_x0 =
    ballast_board_length
    - ballast_end_slot_offset
    - ballast_board_slot_width;


// --------------------------------------------------------------------------
// RED LOCK FEET
// --------------------------------------------------------------------------

ballast_lock_width =
    5 * slat_thickness;

ballast_lock_height =
    5 * slat_thickness;

ballast_lock_thickness =
    slat_thickness;

ballast_lock_slot_depth =
    ballast_lock_width / 2;

ballast_lock_slot_height =
    slat_thickness;

ballast_lock_chamfer =
    1.5 * slat_thickness;


// --------------------------------------------------------------------------
// YELLOW BALLAST FIN
// --------------------------------------------------------------------------

ballast_fin_length =
    3 * ballast_bottle_diameter;

ballast_fin_height =
    ballast_fin_board_width;

ballast_fin_thickness =
    slat_thickness;

ballast_fin_lower_protrusion =
    2 * slat_thickness;

ballast_fin_slot_height =
    slat_thickness;

ballast_fin_slot_depth =
    ballast_bottle_diameter / 2;


assert(
    abs(ballast_center_slot_depth - ballast_fin_slot_depth) < 0.001,
    "Orange-base and yellow-fin slots must have equal depth."
);

// Bottle-seat clearance in the yellow ballast fin.
//
// Remove one additional board thickness of yellow material so the bottle
// clears the fin instead of intersecting it.
ballast_fin_bottle_clearance_extra =
    slat_thickness;

ballast_fin_upper_cut_depth =
    ballast_bottle_diameter
    + ballast_fin_bottle_clearance_extra;

ballast_fin_upper_cut_z0 =
    ballast_fin_lower_protrusion
    + ballast_fin_slot_height
    + 1.5 * slat_thickness;

ballast_fin_front_chamfer =
    1.5 * slat_thickness;


// ============================================================================
// BALLAST PART MODULES
// ============================================================================

module ballast_core_profile_2d() {

    polygon(points=[
        [0, 0],
        [ballast_core_width, 0],
        [ballast_core_width, ballast_core_height],
        [0, ballast_core_height],
        [0, ballast_upper_diagonal_start],
        [ballast_shoulder_step, ballast_upper_neck_start],
        [ballast_shoulder_step, ballast_lower_neck_start],
        [0, ballast_lower_full_return],
        [0, ballast_core_slot_z1],
        [ballast_core_slot_depth, ballast_core_slot_z1],
        [ballast_core_slot_depth, ballast_core_slot_z0],
        [0, ballast_core_slot_z0]
    ]);
}


module ballast_core_slat_part() {
    wood_color([0.12, 0.38, 0.20])
        linear_extrude(height = slat_thickness)
            difference() {
                ballast_core_profile_2d();

                // Through hole aligned with the Little John M6 mounting hole.
                translate([
                    ballast_core_mount_hole_x,
                    ballast_core_mount_hole_y
                ])
                    circle(
                        d = ballast_core_mount_hole_diameter,
                        $fn = 48
                    );
            }
}


module ballast_bottom_board_part() {

    wood_color([0.90, 0.38, 0.06])
    linear_extrude(height = slat_thickness)
    difference() {

        square([
            ballast_board_length,
            ballast_board_width
        ]);

        translate([
            ballast_left_slot - ballast_board_slot_width/2,
            -0.01
        ])
            square([
                ballast_board_slot_width,
                ballast_board_slot_depth + 0.01
            ]);

        translate([
            ballast_center_slot - ballast_board_slot_width/2,
            -0.01
        ])
            square([
                ballast_board_slot_width,
                ballast_center_slot_depth + 0.01
            ]);

        translate([
            ballast_right_slot - ballast_board_slot_width/2,
            -0.01
        ])
            square([
                ballast_board_slot_width,
                ballast_board_slot_depth + 0.01
            ]);

        translate([
            ballast_left_end_slot_x0,
            ballast_board_width - ballast_board_slot_depth
        ])
            square([
                ballast_board_slot_width,
                ballast_board_slot_depth + 0.01
            ]);

        translate([
            ballast_right_end_slot_x0,
            ballast_board_width - ballast_board_slot_depth
        ])
            square([
                ballast_board_slot_width,
                ballast_board_slot_depth + 0.01
            ]);
    }
}


module ballast_lock_profile_2d() {

    lock_slot_y0 =
        (ballast_lock_height - ballast_lock_slot_height) / 2;

    lock_slot_y1 =
        lock_slot_y0 + ballast_lock_slot_height;

    polygon(points=[
        [0, 0],
        [ballast_lock_width - ballast_lock_chamfer, 0],
        [ballast_lock_width, ballast_lock_chamfer],
        [ballast_lock_width,
         ballast_lock_height - ballast_lock_chamfer],
        [ballast_lock_width - ballast_lock_chamfer,
         ballast_lock_height],
        [0, ballast_lock_height],
        [0, lock_slot_y1],
        [ballast_lock_slot_depth, lock_slot_y1],
        [ballast_lock_slot_depth, lock_slot_y0],
        [0, lock_slot_y0]
    ]);
}


module ballast_lock_part() {
    wood_color([0.70, 0.12, 0.10])
        linear_extrude(height = ballast_lock_thickness)
            ballast_lock_profile_2d();
}


module ballast_fin_profile_2d() {

    fin_slot_z0 =
        ballast_fin_lower_protrusion;

    difference() {

        polygon(points=[
            [ballast_fin_front_chamfer, 0],
            [ballast_fin_length, 0],
            [ballast_fin_length, ballast_fin_height],
            [0, ballast_fin_height],
            [0, ballast_fin_front_chamfer]
        ]);

        translate([
            -0.01,
            fin_slot_z0
        ])
            square([
                ballast_fin_slot_depth + 0.01,
                ballast_fin_slot_height
            ]);

        translate([
            -0.01,
            ballast_fin_upper_cut_z0
        ])
            square([
                ballast_fin_upper_cut_depth + 0.01,
                ballast_fin_height
                - ballast_fin_upper_cut_z0
                + 0.01
            ]);
    }
}


module ballast_fin_part() {
    wood_color([0.95, 0.72, 0.02])
        linear_extrude(height = ballast_fin_thickness)
            ballast_fin_profile_2d();
}


// ============================================================================
// BALLAST LOCAL ASSEMBLY
// ============================================================================

module ballast_installed_green_slat(slot_center_x) {

    multmatrix([
        [0, 0, 1,
         slot_center_x - slat_thickness/2],
        [-1, 0, 0,
         ballast_core_width],
        [0, 1, 0,
         -ballast_core_slot_z0],
        [0, 0, 0, 1]
    ])
        ballast_core_slat_part();
}


module ballast_installed_lock(slot_x0) {

    lock_center_x =
        slot_x0 + ballast_board_slot_width/2;

    board_slot_inner_y =
        ballast_board_width - ballast_board_slot_depth;

    lock_origin_y =
        board_slot_inner_y - ballast_lock_slot_depth;

    lock_slot_y0 =
        (ballast_lock_height - ballast_lock_slot_height) / 2;

    multmatrix([
        [0, 0, 1,
         lock_center_x - ballast_lock_thickness/2],
        [1, 0, 0,
         lock_origin_y],
        [0, 1, 0,
         -lock_slot_y0],
        [0, 0, 0, 1]
    ])
        ballast_lock_part();
}


// Inspection control for the yellow ballast fin.
//
// Pull the fin completely out of its mating slot in the OPPOSITE direction
// so both the FULL fin shape and the orange ballast-board slot/surface can be
// inspected independently.
//
// Set this back to 0 when we are ready to re-seat the fin.


module ballast_installed_fin() {

    // Equal slot engagement:
    // orange slot depth + yellow slot depth puts the two slot tips
    // exactly together at the joint mid-plane.
    fin_origin_y =
        ballast_center_slot_depth
        + ballast_fin_slot_depth
        + ballast_fin_inspection_pullout;

    multmatrix([
        [0, 0, 1,
         ballast_center_slot - ballast_fin_thickness/2],
        [-1, 0, 0,
         fin_origin_y],
        [0, 1, 0,
         -ballast_fin_lower_protrusion],
        [0, 0, 0, 1]
    ])
        ballast_fin_part();
}


module local_ballast_assembly() {

    ballast_bottom_board_part();

    ballast_installed_lock(
        ballast_left_end_slot_x0
    );

    ballast_installed_lock(
        ballast_right_end_slot_x0
    );

    ballast_installed_green_slat(
        ballast_left_slot
    );

    ballast_installed_green_slat(
        ballast_right_slot
    );

    ballast_installed_fin();
}



"""

SCAD_TAIL = r"""
// ---------- Standalone output; individual pieces lie flat on Z=0 ----------
if (part == "assembly") {
    // Raise the lowest foot to Z=0; preserve every relative assembly position.
    translate([0,0,max(ballast_lower_lobe_height,
                      (ballast_lock_height-ballast_lock_slot_height)/2,
                      ballast_fin_lower_protrusion)])
        local_ballast_assembly();
} else if (part == "core_slat") ballast_core_slat_part();
else if (part == "bottom_board") ballast_bottom_board_part();
else if (part == "lock_foot") ballast_lock_part();
else if (part == "fin") ballast_fin_part();
else assert(false,str("Unknown part: ",part));

echo("Green slats: width / length / thickness = ",
     ballast_core_width,ballast_core_height,slat_thickness);
echo("Green slat inner-face gap = ",ballast_bottle_clear_gap);
echo("M6 hole diameter / distance from slat top = ",
     ballast_core_mount_hole_diameter,ballast_core_mount_hole_from_top);
echo("Bottom board length / width = ",ballast_board_length,ballast_board_width);
"""

def positive_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("Dimensions must be numbers.") from exc
    if not math.isfinite(number) or number <= 0:
        raise ValueError("Dimensions must be finite and greater than zero.")
    return number

def validate(p):
    d, h, t = p["bottle_diameter"], p["bottle_height"], p["wood_thickness"]
    width = d - 2*t
    height = h - p["cap_height"] + 6*t
    hole = p["mount_hole_diameter"]
    hole_from_top = p["port_length"] + t - p["screw_side_offset"]
    if h <= p["cap_height"] or d <= 3*t:
        raise ValueError("Bottle dimensions leave no body or ballast slat neck.")
    if height - d - t <= 6*t:
        raise ValueError("Upper and lower slat shoulders overlap.")
    if hole >= width or not hole/2 < hole_from_top < d-hole/2:
        raise ValueError("Mounting hole must fit within the full-width upper slat end.")
    if p["fin_board_width"] <= max(4.5*t, d/2):
        raise ValueError("Fin board is too narrow for its slots and bottle clearance.")
    if 3.5*d <= 6*t:
        raise ValueError("Bottom board is too short for its end slots.")

def build_scad(overrides=None, part="assembly"):
    overrides = {} if overrides is None else dict(overrides)
    unknown = set(overrides) - DEFAULTS.keys()
    if unknown:
        raise ValueError("Unknown parameters: " + ", ".join(sorted(unknown)))
    p = {k: positive_number(overrides.get(k, v)) for k, v in DEFAULTS.items()}
    validate(p)
    if part not in PARTS:
        raise ValueError("Unknown part: " + str(part))
    header = """/*
  Hope Turtle — standalone ballast attachment
  Units: mm. License: CERN-OHL-S-2.0
  Two green core slats, one orange bottom board, two red lock feet,
  and one yellow ballast fin. No bottle, Ecojoiner or external files.
  Extracted from the current full Turtle; nominal slot fits are preserved.
*/
$fn = 96;
"""
    header += 'part = "' + part + '"; // [assembly,core_slat,bottom_board,lock_foot,fin]\n'
    header += "enable_color_coding = true;\n"
    header += "ballast_fin_inspection_pullout = 0; // mm; 0 seats the fin\n\n"
    header += "// Editable bottle, stock and matching Ecojoiner dimensions\n"
    names = {"wood_thickness": "slat_thickness", "mount_hole_diameter": "screw_diameter"}
    for key, value in p.items():
        header += names.get(key, key) + " = " + format(value, ".12g") + ";\n"
    header += """
// Bottle diameter sizes the opening; no bottle solid is generated.
port_height = bottle_diameter;
ecojoiner_bottle_height = bottle_height;
module wood_color(coded_color) {
    color(enable_color_coding ? coded_color : [0.94,0.83,0.62]) children();
}
assert(bottle_height > cap_height && slat_thickness > 0
       && bottle_diameter > 3*slat_thickness);
assert(bottle_height-cap_height+6*slat_thickness-bottle_diameter-slat_thickness
       > 6*slat_thickness, "Slat shoulders overlap.");
assert(screw_diameter > 0 && screw_diameter < bottle_diameter-2*slat_thickness);
assert(port_length+slat_thickness-screw_side_offset > screw_diameter/2
       && port_length+slat_thickness-screw_side_offset
          < bottle_diameter-screw_diameter/2, "Mount hole misses the upper slat end.");
assert(fin_board_width > max(4.5*slat_thickness,bottle_diameter/2),
       "Fin board is too narrow.");
"""
    return header + "\n" + SCAD_GEOMETRY + SCAD_TAIL

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key, default in DEFAULTS.items():
        parser.add_argument("--" + key.replace("_", "-"), type=float, default=default,
                            help="millimetres (default: %(default)s)")
    parser.add_argument("--part", choices=PARTS, default="assembly")
    parser.add_argument("--output", type=Path, default=Path("Turtle_Ballast.scad"))
    parser.add_argument("--force", action="store_true", help="Allow replacing an existing output")
    args = parser.parse_args()
    try:
        scad = build_scad({key: getattr(args, key) for key in DEFAULTS}, args.part)
        with args.output.open("w" if args.force else "x", encoding="utf-8") as stream:
            stream.write(scad)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print("Generated " + str(args.output))

if __name__ == "__main__":
    main()