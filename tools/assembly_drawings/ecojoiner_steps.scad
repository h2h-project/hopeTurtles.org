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

// Bottle hardware on one standing Little/Master John — same placement as
// eco_standing_little_john() (turtle_body v7.0.0): at each end a centred clamp
// screw with its acorn, and a centred bare collar-lock screw further in.
module john_clamps(target_y, inside_sign)
    if (grp == "hw") {
        for (hole_x = eco_clamp_xs())
            translate([hole_x, target_y + inside_sign * t / 2, eco_screw_y_center()])
                rotate([inside_sign > 0 ? -90 : 90, 0, 0]) eco_m5_clamp(false);
        for (hole_x = eco_lock_xs())
            translate([hole_x, target_y + inside_sign * t / 2, eco_screw_y_center()])
                rotate([inside_sign > 0 ? -90 : 90, 0, 0]) eco_m5_collar_lock();
    }

// skip_long leaves out one Long John (1 or 2), so the square is drawn as the
// U of two Little Johns on one Long John that step 4 slides in from above.
module frame_square(rot, master = false, long2_dz = 0, little1_dz = 0, hardware = false,
                    skip_long = 0) {
    fc = eco_frame_center();
    translate(fc) rotate(rot) translate(-fc) {
        standing_little(0, master, -little1_dz);
        standing_little(eco_rectangle_y(), false);
        if (skip_long != 1) flipped_long(eco_little_slot_1_x());
        if (skip_long != 2) flipped_long(eco_little_slot_2_x(), long2_dz);
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
    // Hardware beside them, three rows of 12: clamp screws, acorn nuts, and
    // the longer collar-lock screws (turtle_body v7.0.0)
    if (grp == "hw")
        for (i = [0 : 11]) {
            x = eco_final_key_length() + 70 + i * 22;
            translate([x, -60, 4.5]) rotate([-90, 0, 0]) eco_m5_cap_screw(tip_z = 0);
            translate([x, -38, 4.5]) rotate([-90, 0, 0]) eco_m5_acorn(tip_z = 8);
            translate([x, -110, 4.5]) rotate([-90, 0, 0])
                eco_m5_cap_screw(tip_z = 0, len = p_eco_lock_bolt_len());
        }
}

// ---- the three squares, in the order the steps fit them -------------------
A = [0, 0, 0];
B = [0, 90, 90];
C = [90, 0, 90];
U_DROP = lift * 1.6;   // how far above its seat step 4's U hangs

// Scenes 1-6 are the six sub-steps; 7 and 8 are close-ups that render.py
// sets into circles on the drawings of steps 6 and 2.
if (step == 1) layout();
if (step == 2) master_vs_little();
if (step == 3) frame_square(A, long2_dz = lift * 1.7);
// Step 4: the second square's U — two Little Johns hanging from one Long
// John — drops in from above through the first square's centre. Its last
// Long John fits under the first square afterwards.
if (step == 4) { frame_square(A); translate([0, 0, U_DROP]) frame_square(B, skip_long = 2); }
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

// ---- step 6 inset: one John end, its two M5 screws close up ---------------
// The John in its own frame (port-side face at Z = t), cut just past the
// collar-lock hole. The clamp screw at the end is shown fitted with its
// acorn; the longer collar-lock screw further in is pulled back out of its
// hole, so both read in order.
if (step == 7) rotate([90, 0, 0]) {
    yc = eco_screw_y_center();
    intersection() {
        little_john();
        translate([-1, -1, -1]) cube([p_eco_lock_x() + 16, H + 2, t + 2]);
    }
    if (grp == "hw") {
        translate([p_screw_side_offset(), yc, t]) eco_m5_clamp(false);
        translate([p_eco_lock_x(), yc, t - 30])
            eco_m5_cap_screw(tip_z = eco_lock_tip(), len = p_eco_lock_bolt_len());
    }
}

// ---- step 2 inset: what to buy — the two M5 screws and an acorn nut -------
// Drawn larger than life, with the hex socket and thread ridges the
// assembly drawings leave out (pitch 0.8 mm, M5 coarse).
module m5_bolt_detail(len = p_m5_bolt_len()) {
    difference() {
        translate([0, 0, -p_m5_head_h()]) cylinder(d = p_m5_head_d(), h = p_m5_head_h(), $fn = 48);
        translate([0, 0, -p_m5_head_h() - 1]) cylinder(d = 4 / cos(30), h = 3.5, $fn = 6);
    }
    cylinder(d = 4.2, h = len, $fn = 32);
    for (z = [1.5 : 0.8 : len - 0.6])
        translate([0, 0, z]) cylinder(d1 = 4.2, d2 = 5, h = 0.4, $fn = 32);
}

if (step == 8 && grp == "hw") {
    rotate([0, 90, 0]) m5_bolt_detail();                                     // clamp screw
    translate([p_m5_bolt_len() + 16, 0, 0]) eco_m5_acorn(tip_z = p_m5_acorn_h());
    translate([0, -16, 0]) rotate([0, 90, 0]) m5_bolt_detail(p_eco_lock_bolt_len());  // collar lock
}
