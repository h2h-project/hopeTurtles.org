/*
  Ecojoiner Core SCAD
  -------------------
  Parametric Cruciform Ecojoiner generator for:
    - Long John x 6
    - Little John x 5
    - Master John x 1
    - Saddler x 12

  Website/backend usage:

    use <ecojoiner_core.scad>;

    ecojoiner_layout(
      slat_thickness = 12,
      port_length = 70,
      port_height = 83,
      cap_diameter = 32,
      collar_diameter = 34,
      screw_diameter = 6,
      fit_clearance = 0.20,
      part = "layout",
      output_mode = "preview"
    );

  Recommended output modes:
    - "preview"  : 3D extruded parts, labels optional
    - "solid_3d" : 3D extruded parts, labels optional
    - "cut_2d"   : clean 2D profiles for DXF/SVG export; labels are suppressed

  Recommended part values:
    - "layout"
    - "long_john"
    - "little_john"
    - "master_john"
    - "saddler"

  Notes:
    - bottle_volume_l is documentation only and does not affect geometry.
    - screw_side_offset defaults to 18mm from left/right sides.
    - Long John and Little John use half-height slots, rounded up.
    - Master John uses deeper slots derived from port_height / 2, rounded down.
*/

module ecojoiner_layout(
  // ---------- Core user parameters ----------
  slat_thickness = 12,      // board thickness, mm
  port_length = 70,         // bottle insertion depth / port depth, mm
  port_height = 83,         // bottle body diameter / port height, mm
  cap_diameter = 32,        // cap hole diameter for Long John, mm
  collar_diameter = 34,     // collar hole diameter for Little/Master John, mm
  screw_diameter = 6,       // screw hole diameter, mm

  // ---------- Fabrication and display parameters ----------
  fit_clearance = 0.20,     // extra slot/notch width, mm
  layout_gap = 30,          // spacing between displayed parts, mm
  show_labels = true,       // only applies to preview/solid_3d modes
  label_size = 8,
  label_depth = 0.6,
  fn_segments = 96,         // circle smoothness

  // ---------- Selector parameters ----------
  part = "layout",         // layout, long_john, little_john, master_john, saddler
  output_mode = "preview", // preview, solid_3d, cut_2d

  // ---------- Optional / advanced parameters ----------
  screw_side_offset = 18,   // screw centre distance from side edge, mm
  bottle_volume_l = 1.5,    // documentation only; does not affect geometry
  show_dimension_echoes = true
) {

  // Circle rendering resolution.
  $fn = fn_segments;

  // ---------- Derived dimensions ----------
  slot_width = slat_thickness + fit_clearance;

  // Reference drawing: 83 - 2*12 = 59mm
  john_height = port_height - 2 * slat_thickness;

  // Reference drawing: 2*70 + 83 + 4*12 = 271mm
  john_length = 2 * port_length + port_height + 4 * slat_thickness;

  // Long John spans: 70 / slot / 107 / slot / 70
  long_end_span = port_length;
  long_center_span = port_height + 2 * slat_thickness;

  // Little/Master John spans: 82 / slot / 83 / slot / 82
  little_end_span = port_length + slat_thickness;
  little_center_span = port_height;

  // Slot depths.
  standard_slot_depth = ceil(john_height / 2);
  master_slot_depth = floor(port_height / 2);

  // Screw holes.
  screw_y_center = john_height / 2;

  // Saddler derived dimensions.
  saddler_width = port_height;
  saddler_height = port_length + 2 * slat_thickness;
  saddler_notch_width = john_height + fit_clearance;
  saddler_notch_depth = 2 * slat_thickness + fit_clearance;

  // Small overcut helps boolean cutters fully escape the profile.
  overcut = 1;

  // ---------- Basic validation ----------
  assert(slat_thickness > 0, "slat_thickness must be greater than 0mm.");
  assert(port_length > 0, "port_length must be greater than 0mm.");
  assert(port_height > 2 * slat_thickness, "port_height must be greater than 2x slat_thickness.");
  assert(cap_diameter > 0, "cap_diameter must be greater than 0mm.");
  assert(collar_diameter > 0, "collar_diameter must be greater than 0mm.");
  assert(screw_diameter > 0, "screw_diameter must be greater than 0mm.");
  assert(fit_clearance >= 0, "fit_clearance must be 0 or greater.");

  assert(cap_diameter < john_height, "cap_diameter is too large for the John slat height.");
  assert(collar_diameter < john_height, "collar_diameter is too large for the John slat height.");
  assert(screw_diameter < john_height, "screw_diameter is too large for the John slat height.");
  assert(screw_side_offset > screw_diameter / 2, "screw_side_offset must place screw holes fully inside the slat.");
  assert(john_length - screw_side_offset > screw_side_offset, "john_length is too short for the chosen screw_side_offset.");
  assert(master_slot_depth < john_height, "master_slot_depth must be shallower than john_height.");

  if (show_dimension_echoes) {
    echo(str("Ecojoiner bottle_volume_l=", bottle_volume_l, " documentation only"));
    echo(str("Ecojoiner john_length_mm=", john_length));
    echo(str("Ecojoiner john_height_mm=", john_height));
    echo(str("Ecojoiner slot_width_mm=", slot_width));
    echo(str("Ecojoiner standard_slot_depth_mm=", standard_slot_depth));
    echo(str("Ecojoiner master_slot_depth_mm=", master_slot_depth));
    echo(str("Ecojoiner saddler_width_mm=", saddler_width));
    echo(str("Ecojoiner saddler_height_mm=", saddler_height));
  }

  // ---------- Helper modules ----------
  module top_slot(center_x, depth) {
    translate([center_x - slot_width / 2, john_height - depth])
      square([slot_width, depth + overcut], center=false);
  }

  module center_hole(diameter) {
    translate([john_length / 2, john_height / 2])
      circle(d=diameter);
  }

  module screw_holes_2d() {
    translate([screw_side_offset, screw_y_center])
      circle(d=screw_diameter);

    translate([john_length - screw_side_offset, screw_y_center])
      circle(d=screw_diameter);
  }

  module part_label(label_text, width) {
    if (show_labels && output_mode != "cut_2d") {
      translate([width / 2, -label_size * 1.7, slat_thickness])
        linear_extrude(height=label_depth)
          text(label_text, size=label_size, halign="center", valign="center");
    }
  }

  module extruded_2d_part() {
    linear_extrude(height=slat_thickness)
      children();
  }

  module render_profile(label_text, width) {
    if (output_mode == "cut_2d") {
      children();
    } else {
      extruded_2d_part()
        children();
      part_label(label_text, width);
    }
  }

  // ---------- 2D profiles ----------
  module long_john_2d() {
    difference() {
      square([john_length, john_height], center=false);

      // Slot centers reproduce 70 / slot / 107 / slot / 70 nominal layout.
      top_slot(long_end_span + slat_thickness / 2, standard_slot_depth);
      top_slot(john_length - long_end_span - slat_thickness / 2, standard_slot_depth);

      center_hole(cap_diameter);
    }
  }

  module little_john_2d() {
    difference() {
      square([john_length, john_height], center=false);

      // Slot centers reproduce 82 / slot / 83 / slot / 82 nominal layout.
      top_slot(little_end_span + slat_thickness / 2, standard_slot_depth);
      top_slot(john_length - little_end_span - slat_thickness / 2, standard_slot_depth);

      center_hole(collar_diameter);
      screw_holes_2d();
    }
  }

  module master_john_2d() {
    difference() {
      square([john_length, john_height], center=false);

      // Same left/right layout as Little John, but deeper slots.
      top_slot(little_end_span + slat_thickness / 2, master_slot_depth);
      top_slot(john_length - little_end_span - slat_thickness / 2, master_slot_depth);

      center_hole(collar_diameter);
      screw_holes_2d();
    }
  }

  module saddler_2d() {
    difference() {
      square([saddler_width, saddler_height], center=false);

      // Bottom U-notch, centered. Reference nominal: 59 wide x 24 deep.
      translate([(saddler_width - saddler_notch_width) / 2, -overcut])
        square([saddler_notch_width, saddler_notch_depth + overcut], center=false);
    }
  }

  // ---------- Named parts ----------
  module long_john() {
    render_profile("Long John x 6", john_length)
      long_john_2d();
  }

  module little_john() {
    render_profile("Little John x 5", john_length)
      little_john_2d();
  }

  module master_john() {
    render_profile("Master John x 1", john_length)
      master_john_2d();
  }

  module saddler() {
    render_profile("Saddler x 12", saddler_width)
      saddler_2d();
  }

  // ---------- Layout ----------
  module all_parts_layout() {
    translate([0, 0, 0])
      long_john();

    translate([0, -(john_height + layout_gap), 0])
      little_john();

    translate([0, -2 * (john_height + layout_gap), 0])
      master_john();

    translate([john_length + layout_gap, 0, 0])
      saddler();
  }

  // ---------- Render selector ----------
  if (part == "layout") {
    all_parts_layout();
  } else if (part == "long_john") {
    long_john();
  } else if (part == "little_john") {
    little_john();
  } else if (part == "master_john") {
    master_john();
  } else if (part == "saddler") {
    saddler();
  } else {
    echo(str("Unknown part value: ", part, ". Rendering full layout instead."));
    all_parts_layout();
  }
}
