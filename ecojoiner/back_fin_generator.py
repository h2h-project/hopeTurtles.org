#!/usr/bin/env python3
"""Generate the Hope Turtle rear-fin SCAD, with validated complementary joints.

All dimensions are mm. Last full-turtle bottle/stock defaults are used.
Run with --defaults to generate without prompting, e.g.:
  python3 generate_turtle_rear_fin_v2.py --defaults --output turtle_rear_fin_v2.scad
Individual --solar-panel-width/height/thickness options override those defaults.
Without --defaults, omitted foundation dimensions are requested interactively.
The blue panel and bottle are F5-only reference objects, excluded from exports.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

DEFAULTS = {
    "cap_diameter": 31.0,
    "wood_thickness": 12.0,
    "bottle_height": 305.0,
    "cap_height": 17.0,
    "bottle_diameter": 82.0,
    "solar_panel_width": 148.0,
    "solar_panel_height": 223.0,
    "solar_panel_thickness": 2.5,
    "fin_board_width": 93.0,
}
TUNING = {
    "half_lap_clearance": 0.2,
    "solar_slot_clearance": 0.2,
    "shaft_width": 59.0,
    "shaft_hole_diameter": 6.0,
    "shaft_hole_from_front": 50.0,
    "fin_rear_tab_width": 15.0,
}

SCAD_BODY = r'''
/* [Display] */
part = "assembly"; // [assembly,fin,solar_holder,shaft]
show_solar_panel = true; // F5 reference only, excluded from F6/STL
show_bottle_mockup = false; // F5 simplified envelope only

/* [Hidden] */
$fn = 96;
eps = 0.02; // Boolean overlap ONLY; fit clearances are separate inputs
t = wood_thickness;
fin_width = fin_board_width + fin_rear_tab_width;
fin_height = 3*bottle_diameter;
fin_diagonal_rise = 2*bottle_diameter/3;
fin_diagonal_run = fin_diagonal_rise;

// Keep the user's approved formula: 305 + (2/3)*(93-24) - 17 = 334.
shaft_length = bottle_height + (2/3)*(fin_board_width-2*t) - cap_height;
solar_holder_length = solar_panel_width;
solar_holder_height = 3*t; // WOODEN holder height, not panel height
solar_holder_thickness = t; // WOOD thickness, not panel thickness
solar_chamfer = 1.5*t;
solar_slot_depth = solar_holder_height/2;
fin_solar_notch_x0 = fin_width-2*t;
shaft_rear_x = fin_solar_notch_x0;
shaft_front_x = shaft_rear_x-shaft_length;

// The actual green/yellow common X span is [0, shaft_rear_x].
// Split at ONE shared station. Yellow opens from X=0 to the midpoint;
// green opens from its rear at shaft_rear_x back to the midpoint.
joint_slot_depth = shaft_rear_x/2;
joint_meet_x = joint_slot_depth;
upper_shaft_z0 = fin_height-3*t;
lower_shaft_z0 = upper_shaft_z0-bottle_diameter-t;
solar_holder_z0 = upper_shaft_z0;
solar_meet_z = solar_holder_z0+solar_slot_depth;

// Panel sits horizontally on the red holder's top, extending forward.
// Width -> Y, height/length -> X, panel thickness -> Z.
solar_panel_x0 = fin_solar_notch_x0+t-solar_panel_height;
solar_panel_z0 = fin_height;

assert(t>0 && bottle_height>cap_height && cap_diameter>0);
assert(bottle_diameter>0 && fin_board_width>2*t && fin_rear_tab_width>0);
assert(solar_panel_width>0 && solar_panel_height>0 && solar_panel_thickness>0);
assert(half_lap_clearance>=0 && solar_slot_clearance>=0);
assert(shaft_front_x<0 && joint_slot_depth>half_lap_clearance/2);
assert(shaft_width>t+half_lap_clearance);
assert(half_lap_clearance<t && half_lap_clearance<bottle_diameter);
assert(lower_shaft_z0-half_lap_clearance/2>=fin_diagonal_rise,
       "Lower joint intersects the diagonal fin edge.");
assert(fin_width>fin_diagonal_run);
assert(solar_slot_clearance<t && fin_solar_notch_x0>solar_slot_clearance/2);
assert(fin_width-(fin_solar_notch_x0+t+solar_slot_clearance/2)>0);
assert(2*solar_chamfer+t+solar_slot_clearance<solar_holder_length,
       "Panel width leaves too little red-board material beside the slot.");
assert(shaft_hole_diameter>0 && shaft_width>shaft_hole_diameter);
assert(shaft_hole_from_front>shaft_hole_diameter/2
       && shaft_front_x+shaft_hole_from_front+shaft_hole_diameter/2<0,
       "Shaft hole must remain in the forward, unjointed portion.");
assert(exploded>=0);

module rear_fin() {
    color([1,0.72,0.05]) rotate([90,0,0])
        linear_extrude(height=t,center=true) difference() {
            polygon([[0,fin_diagonal_rise],[fin_diagonal_run,0],
                     [fin_width,0],[fin_width,fin_height],[0,fin_height]]);
            // Open-front slots, with clearance centered about each green board.
            for(z=[upper_shaft_z0,lower_shaft_z0])
                translate([-eps,z-half_lap_clearance/2])
                    square([joint_meet_x+half_lap_clearance/2+eps,
                            t+half_lap_clearance]);
            // Open-top solar joint. Symmetric width and root clearance.
            translate([fin_solar_notch_x0-solar_slot_clearance/2,
                       solar_meet_z-solar_slot_clearance/2])
                square([t+solar_slot_clearance,
                        fin_height-solar_meet_z+solar_slot_clearance/2+eps]);
        }
}

module bottle_holder_shaft(z0=0) {
    color([0.2,0.38,0.05]) difference() {
        translate([shaft_front_x,-shaft_width/2,z0])
            cube([shaft_length,shaft_width,t]);
        translate([shaft_front_x+shaft_hole_from_front,0,z0-eps])
            cylinder(d=shaft_hole_diameter,h=t+2*eps);
        // Open REAR slot, complementary to yellow's open FRONT slot.
        translate([joint_meet_x-half_lap_clearance/2,
                   -(t+half_lap_clearance)/2,z0-eps])
            cube([shaft_rear_x-joint_meet_x+half_lap_clearance/2+eps,
                  t+half_lap_clearance,t+2*eps]);
    }
}

module solar_panel_holder() {
    color("red") translate([fin_solar_notch_x0,0,solar_holder_z0])
        rotate([90,0,90]) translate([-solar_holder_length/2,0,0])
            linear_extrude(height=t) difference() {
                square([solar_holder_length,solar_holder_height]);
                polygon([[0,0],[solar_chamfer,0],[0,solar_chamfer]]);
                polygon([[solar_holder_length,0],
                         [solar_holder_length-solar_chamfer,0],
                         [solar_holder_length,solar_chamfer]]);
                // Open-bottom slot, centered on the yellow fin.
                translate([(solar_holder_length-t-solar_slot_clearance)/2,-eps])
                    square([t+solar_slot_clearance,
                            solar_slot_depth+solar_slot_clearance/2+eps]);
            }
}

module solar_panel_reference() {
    color([0.05,0.16,0.4,0.65])
        translate([solar_panel_x0,-solar_panel_width/2,solar_panel_z0])
            cube([solar_panel_height,solar_panel_width,solar_panel_thickness]);
}
module bottle_mockup() {
    // Simplified total-length envelope: cap INCLUDED in bottle_height.
    // Bottle rear sits at the fin's front X=0, avoiding the fin itself.
    zc = lower_shaft_z0+t+bottle_diameter/2;
    color([0,0.85,0.95,0.3])
        translate([-bottle_height+cap_height,0,zc]) rotate([0,90,0])
            cylinder(h=bottle_height-cap_height,d=bottle_diameter);
    color([0,0.25,1,0.5])
        translate([-bottle_height,0,zc]) rotate([0,90,0])
            cylinder(h=cap_height,d=cap_diameter);
}
module assembly_view() {
    rear_fin();
    translate([-exploded,0,exploded]) bottle_holder_shaft(upper_shaft_z0);
    translate([-exploded,0,-exploded]) bottle_holder_shaft(lower_shaft_z0);
    translate([exploded,0,exploded]) solar_panel_holder();
    if(show_solar_panel && exploded==0) %solar_panel_reference();
    if(show_bottle_mockup && exploded==0) %bottle_mockup();
}

if(part=="assembly") assembly_view();
else if(part=="fin") rear_fin();
else if(part=="solar_holder") solar_panel_holder();
else if(part=="shaft") bottle_holder_shaft();
else assert(false,str("Unknown part: ",part));

echo("Shaft length = ",shaft_length);
echo("Matching green/yellow nominal slot depth = ",joint_slot_depth);
echo("Green/yellow slot opening = ",t+half_lap_clearance);
echo("Solar joint opening / total clearance = ",t+solar_slot_clearance,solar_slot_clearance);
echo("Rear panel width / height / thickness = ",solar_panel_width,solar_panel_height,solar_panel_thickness);
'''


def finite_number(value: str) -> float:
    try:
        result = float(value)
    except (ValueError, TypeError) as exc:
        raise argparse.ArgumentTypeError("enter a number") from exc
    if not math.isfinite(result):
        raise argparse.ArgumentTypeError("number must be finite")
    return result


def positive_number(value: str) -> float:
    number = finite_number(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return number


def nonnegative_number(value: str) -> float:
    number = finite_number(value)
    if number < 0:
        raise argparse.ArgumentTypeError("value must be zero or greater")
    return number


def ask(label: str, default: float) -> float:
    while True:
        raw = input(f"{label} [{default:g} mm]: ").strip()
        if not raw:
            return default
        try:
            return positive_number(raw)
        except argparse.ArgumentTypeError as exc:
            print(f"Invalid value: {exc}")


def dimensions(p: dict[str, float]) -> dict[str, float]:
    t = p["wood_thickness"]
    width = p["fin_board_width"] + p["fin_rear_tab_width"]
    rear = width-2*t
    length = p["bottle_height"]+(2/3)*(p["fin_board_width"]-2*t)-p["cap_height"]
    upper = 3*p["bottle_diameter"]-3*t
    return dict(fin_width=width, shaft_rear_x=rear, shaft_length=length,
                shaft_front_x=rear-length, joint_slot_depth=rear/2,
                upper_shaft_z0=upper, lower_shaft_z0=upper-p["bottle_diameter"]-t,
                fin_height=3*p["bottle_diameter"])


def validate(p: dict[str, float]) -> None:
    for key, value in p.items():
        if not math.isfinite(value):
            raise ValueError(f"{key} must be finite")
        if key in ("half_lap_clearance", "solar_slot_clearance", "exploded"):
            if value < 0:
                raise ValueError(f"{key} must be nonnegative")
        elif value <= 0:
            raise ValueError(f"{key} must be positive")
    t, c, s = p["wood_thickness"], p["half_lap_clearance"], p["solar_slot_clearance"]
    d = dimensions(p)
    checks = [
        (p["bottle_height"]>p["cap_height"], "Bottle height must include and exceed cap height"),
        (p["fin_board_width"]>2*t, "Fin board width must exceed twice wood thickness"),
        (d["shaft_front_x"]<0 and d["joint_slot_depth"]>c/2, "Invalid green/yellow overlap"),
        (p["shaft_width"]>t+c, "Green board needs material beside its slot"),
        (c<min(t,p["bottle_diameter"]), "Half-lap clearance is too large"),
        (d["lower_shaft_z0"]-c/2>=2*p["bottle_diameter"]/3, "Lower joint hits diagonal fin edge"),
        (d["fin_width"]>2*p["bottle_diameter"]/3, "Fin diagonal consumes bottom edge"),
        (s<t and d["shaft_rear_x"]>s/2, "Solar clearance consumes fin material"),
        (p["solar_panel_width"]>4*t+s, "Solar holder too narrow for slot and chamfers"),
        (p["shaft_width"]>p["shaft_hole_diameter"], "Shaft hole too wide"),
        (p["shaft_hole_from_front"]>p["shaft_hole_diameter"]/2 and
         d["shaft_front_x"]+p["shaft_hole_from_front"]+p["shaft_hole_diameter"]/2<0,
         "Shaft hole must lie inside the forward, unjointed shaft"),
    ]
    for ok, message in checks:
        if not ok:
            raise ValueError(message)


def build_scad(overrides: dict[str, float] | None = None) -> str:
    p = {**DEFAULTS, **TUNING, "exploded": 0.0}
    if overrides:
        unknown = set(overrides)-set(p)
        if unknown:
            raise ValueError(f"Unknown parameters: {sorted(unknown)}")
        p.update(overrides)
    validate(p)
    lines = ["/* Hope Turtle rear-fin v2. Units: mm. Generated by generate_turtle_rear_fin_v2.py.",
             "   Bottle/stock and panel defaults follow Full_Turtle_v11.scad.",
             "   Four wooden pieces. Panel/bottle are reference geometry only. */",
             "", "/* [Foundation dimensions] */"]
    lines.extend(f"{k} = {p[k]:.12g};" for k in DEFAULTS)
    lines.extend(["", "/* [Fit and tuning] */",
                  "// Clearance means TOTAL extra slot width, centered on the mating board."])
    lines.extend(f"{k} = {p[k]:.12g};" for k in TUNING)
    lines.append(f"exploded = {p['exploded']:.12g};")
    return "\n".join(lines)+"\n"+SCAD_BODY


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    for key in DEFAULTS:
        parser.add_argument("--"+key.replace("_", "-"), type=positive_number)
    for key, default in TUNING.items():
        parser.add_argument("--"+key.replace("_", "-"),
                            type=nonnegative_number if "clearance" in key else positive_number,
                            default=default)
    parser.add_argument("--exploded", type=nonnegative_number, default=0)
    parser.add_argument("--defaults", action="store_true", help="Use defaults for omitted dimensions")
    parser.add_argument("--output", default="turtle_rear_fin_v2.scad")
    parser.add_argument("--force", action="store_true", help="Replace an existing output file")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    p = {}
    try:
        for key, default in DEFAULTS.items():
            supplied = getattr(args, key)
            p[key] = supplied if supplied is not None else (
                default if args.defaults else ask(key.replace("_", " ").capitalize(), default))
        p.update({key: getattr(args, key) for key in TUNING})
        p["exploded"] = args.exploded
        scad = build_scad(p)
        output = Path(args.output).expanduser()
        # UTF-8 is explicit, and accidental overwrites are prevented by default.
        with output.open("w" if args.force else "x", encoding="utf-8") as handle:
            handle.write(scad)
    except EOFError:
        parser.error("No interactive input available; supply dimensions or use --defaults")
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    d = dimensions(p)
    print(f"Wrote: {output.resolve()}")
    print(f"Shaft length: {d['shaft_length']:g} mm")
    print(f"Complementary joint slot depth: {d['joint_slot_depth']:g} mm")
    print(f"Solar slot width: {p['wood_thickness']+p['solar_slot_clearance']:g} mm")
    print(f"Panel W x H x T: {p['solar_panel_width']:g} x {p['solar_panel_height']:g} x {p['solar_panel_thickness']:g} mm")


if __name__ == "__main__":
    main()
