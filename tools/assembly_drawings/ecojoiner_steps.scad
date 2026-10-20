// Ecojoiner assembly steps for the /turtles/build "Assemble Your Ecojoiner"
// panel. Geometry comes from the vendored turtle_body bundle — nothing here
// re-derives a dimension. render.py calls this once per (step, grp) pair:
//   step 1..5   which assembly stage to draw
//   grp         "wood" | "master" | "key" | "hw" — exported as separate
//               meshes so the renderer can ink each kind differently
use <../../generator/turtle_body/scad/Turtle_Core_Ecojoiner.scad>

step = 5;
grp = "wood";
lift = 90;   // exploded-view offset for the piece being fitted, mm

t = eco_slat_t();
L = eco_john_length();
H = eco_john_height();

// ---- one part per group, so each export holds only its kind ---------------
module long_john()   if (grp == "wood")   eco_long_john(false);
module little_john() if (grp == "wood")   eco_little_john(false);
module master_john() if (grp == "master") eco_master_john(false);
module final_key()   if (grp == "key")    eco_final_key(false);

// ---- one rectangle (square) of the frame, with exploded pieces ------------
// Mirrors eco_john_rectangle(): two standing Little Johns, slots up, crossed
// by two flipped Long Johns, slots down. Long Johns drop in from +Z (local);
// the first Little John (the Master John in the last square) rises into
// place from -Z.
module standing_little(target_y, is_master, dz = 0)
    translate([0, 0, dz])
        multmatrix([[1, 0, 0, 0], [0, 0, 1, target_y - t / 2], [0, 1, 0, 0], [0, 0, 0, 1]])
            if (is_master) master_john(); else little_john();

module flipped_long(target_x, dz = 0)
    translate([0, 0, dz])
        multmatrix([[0, 0, 1, target_x - t / 2], [-1, 0, 0, eco_long_slot_2_x()],
                    [0, -1, 0, H], [0, 0, 0, 1]])
            long_john();

// Clamp hardware on one standing Little/Master John — same placement as
// eco_standing_little_john().
module john_clamps(target_y, inside_sign)
    if (grp == "hw")
        for (hole_x = [p_screw_side_offset(), L - p_screw_side_offset()])
            for (hole_z = eco_screw_ys())
                translate([hole_x, target_y + inside_sign * t / 2, hole_z])
                    rotate([inside_sign > 0 ? -90 : 90, 0, 0]) eco_m5_clamp(false);

module frame_square(rot, master = false, long2_dz = 0, little1_dz = 0, hardware = false) {
    fc = eco_frame_center();
    translate(fc) rotate(rot) translate(-fc) {
        standing_little(0, master, -little1_dz);
        standing_little(eco_rectangle_y(), false);
        flipped_long(eco_little_slot_1_x());
        flipped_long(eco_little_slot_2_x(), long2_dz);
        if (hardware) {
            john_clamps(0, +1);
            john_clamps(eco_rectangle_y(), -1);
        }
    }
}

// Final keys, as eco_inserted_final_key(), slid out along their length by dy.
module key_at(x, z, dy = 0) {
    fc = eco_frame_center();
    translate([fc[0] + x - eco_final_key_width() / 2,
               fc[1] - eco_final_key_length() / 2 + dy,
               fc[2] + z - t / 2])
        multmatrix([[0, 1, 0, 0], [1, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
            final_key();
}

// ---- step 1: every piece laid out flat -----------------------------------

module layout() {
    gap = 18;
    row = H + gap;
    // Long Johns ×6 — left column
    for (i = [0 : 5]) translate([0, i * row, 0]) long_john();
    // Little Johns ×5 + Master John — right column, Master set apart
    for (i = [0 : 4]) translate([L + 60, i * row, 0]) little_john();
    translate([L + 60, 5 * row + 30, 0]) master_john();
    // Final Keys ×4 — in front of the Long Johns
    kw = eco_final_key_width();
    for (i = [1 : 4]) translate([0, -i * (kw + gap) - 30, 0]) final_key();
    // Hardware ×24 — cap screws and acorn nuts lying in two rows beside them
    if (grp == "hw")
        for (i = [0 : 11]) for (j = [0 : 1])
            translate([eco_final_key_length() + 70 + i * 22, -60 - j * 90, 4.5]) {
                rotate([-90, 0, 0]) eco_m5_cap_screw(tip_z = 0);
                translate([0, 22, 0]) rotate([-90, 0, 0]) eco_m5_acorn(tip_z = 8);
            }
}

// ---- the three squares, in the order the steps fit them -------------------
A = [0, 0, 0];
B = [0, 90, 90];
C = [90, 0, 90];

// Scenes 1-6 are the six sub-steps; 7 and 8 are close-ups that render.py
// sets into circles on the drawings of steps 6 and 2.
if (step == 1) layout();
if (step == 2) master_vs_little();
if (step == 3) frame_square(A, long2_dz = lift * 1.7);
if (step == 4) { frame_square(A); frame_square(B, little1_dz = lift * 1.3); }
if (step == 5) { frame_square(A); frame_square(B); frame_square(C, master = true, little1_dz = lift); }
if (step == 6) {
    frame_square(A, hardware = true);
    frame_square(B, hardware = true);
    frame_square(C, master = true, hardware = true);
    xo = eco_final_key_x_offset();
    zo = eco_final_key_z_offset();
    key_at(-xo, -zo);
    key_at( xo, -zo);
    key_at(-xo,  zo, -lift * 2.2);
    key_at( xo,  zo, -lift * 2.2);
}

// ---- step 2: the Master John beside a Little John --------------------------
// Both lying flat, slots facing the same way, so the deeper slots read at a
// glance.
module master_vs_little() {
    translate([0, H + 40, 0]) little_john();
    master_john();
}

// ---- step 6 inset: one John end, its M5 pair close up --------------------
// The John in its own frame (port-side face at Z = t). The upper screw is
// shown fitted with its acorn; the lower one is pulled out of its hole and
// its acorn lifted off the tip, so the stack reads in order.
if (step == 7) rotate([90, 0, 0]) {
    ys = eco_screw_ys();
    intersection() {
        little_john();
        translate([-1, -1, -1]) cube([80, H + 2, t + 2]);
    }
    if (grp == "hw") {
        translate([p_screw_side_offset(), ys[1], t]) eco_m5_clamp(false);
        translate([p_screw_side_offset(), ys[0], t]) {
            translate([0, 0, -38]) eco_m5_cap_screw(tip_z = eco_clamp_tip());
            translate([0, 0, 26]) eco_m5_acorn(tip_z = eco_clamp_reach());
        }
    }
}

// ---- step 2 inset: what to buy — one M5 bolt and one acorn nut ------------
// Drawn larger than life, with the hex socket and thread ridges the
// assembly drawings leave out (pitch 0.8 mm, M5 coarse).
module m5_bolt_detail() {
    len = p_m5_bolt_len();
    difference() {
        translate([0, 0, -p_m5_head_h()]) cylinder(d = p_m5_head_d(), h = p_m5_head_h(), $fn = 48);
        translate([0, 0, -p_m5_head_h() - 1]) cylinder(d = 4 / cos(30), h = 3.5, $fn = 6);
    }
    cylinder(d = 4.2, h = len, $fn = 32);
    for (z = [1.5 : 0.8 : len - 0.6])
        translate([0, 0, z]) cylinder(d1 = 4.2, d2 = 5, h = 0.4, $fn = 32);
}

if (step == 8 && grp == "hw") {
    rotate([0, 90, 0]) m5_bolt_detail();
    translate([p_m5_bolt_len() / 2, 16, 0]) eco_m5_acorn(tip_z = p_m5_acorn_h());
}
