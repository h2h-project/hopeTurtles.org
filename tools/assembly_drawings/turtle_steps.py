#!/usr/bin/env python3
"""Pen-and-ink drawings of the full turtle coming together.

These are the "Put It All Together" sub-steps on /turtles/build. The whole
turtle is only modelled in the sibling turtle_body repository
(src/Full_Turtle.scad, not vendored here), so this script copies its src/ and
lib/ into a temp folder and patches the copy so each export holds a single
material. Every color() call becomes a filter on $grp: wood_color() and
sf_wood() pass wood, and the rest are sorted by their colour into bottle,
printed, hw, panel or fabric. The source files are never changed. Each scene
is then inked by tools/component_previews/render.py's draw_view().

Writes public/images/ecojoiners/assembly/together-{1..3}.webp.

    python3 tools/assembly_drawings/turtle_steps.py [scene ...]

Needs openscad on PATH, numpy, Pillow and ../turtle_body (or TURTLE_BODY).
"""
from __future__ import annotations

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TURTLE_BODY = Path(os.environ.get("TURTLE_BODY", ROOT.parent / "turtle_body"))
OUT_DIR = ROOT / "public" / "images" / "ecojoiners" / "assembly"
SIZE = 1000

_spec = importlib.util.spec_from_file_location(
    "component_previews_render", ROOT / "tools" / "component_previews" / "render.py")
previews = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(previews)

# The colour sorter every patched file gets: strings and cyan/blue are the
# bottle mock-up, white is sail cloth, the rear solar panel's grey is the
# panel, near-black is hardware, anything else is a printed part.
GCOLOR = """
function _tb_kind(c) =
    is_string(c) ? "bottle"
    : (c[0] == 1 && c[1] == 1 && c[2] == 1) ? "fabric"
    : (c[0] == 0.20 && c[1] == 0.22 && c[2] == 0.24) ? "panel"
    : max(c[0], c[1], c[2]) < 0.3 ? "hw"
    : (c[0] < 0.15 && c[2] > 0.8) ? "bottle"
    : "printed";
module gcolor(c, alpha = 1) if (_tb_kind(c) == $grp) children();
"""

# Stand-in for the Turtle Shell board (no 3D model of it exists): an
# L-shaped PCB with the XIAO and a few connectors, about the size of the
# real one. Drawn standing up, ready to lower into the bottle.
SHELL = """
module turtle_shell_mock() if ($grp == "printed") rotate([90, 0, 0]) {
    translate([-31, -17, 0]) cube([62, 34, 1.6]);
    translate([9, -45, 0]) cube([22, 30, 1.6]);
    translate([10, -9, 1.6]) cube([21, 17.5, 3.5]);
    for (x = [-27, -12]) for (y = [-12, 0])
        translate([x, y, 1.6]) cube([12, 6, 5]);
    translate([-3, -12, 1.6]) cube([10, 5, 5]);
}
"""

# Scenes appended to the patched Full_Turtle.scad, so they can read its
# globals. $no_aid hides the five food bottles; $cap_lift / $shell_lift
# explode the control bottle; $show_cage hides the cage and sail frame.
SCENES = """
$no_aid = true; $show_cage = true; $show_shell = false;
$cap_lift = 0; $shell_lift = 0;
if (scene == 1) full_turtle_scene(include_top_sail = false);
if (scene == 2) {
    $show_cage = false; $show_shell = true; $cap_lift = 170; $shell_lift = 90;
    rotate([-90, 0, 0]) installed_sail_apparatus_on_top_port();
}
if (scene == 3) full_turtle_scene(include_top_sail = true);
"""

# scene -> (groups to export, (azimuth, elevation), margin)
SCENE_SETUP = {
    1: (["wood", "hw", "panel"], (-35, 24), 0.05),
    2: (["bottle", "printed", "hw"], (-35, 18), 0.08),
    3: (["wood", "hw", "panel", "printed", "bottle", "fabric"], (-35, 22), 0.05),
}


def sub(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"turtle_body changed: expected one {old!r}")
    return text.replace(old, new)


def patch(tmp: Path) -> Path:
    for d in ("lib", "src"):
        shutil.copytree(TURTLE_BODY / d, tmp / d)
    for f in list((tmp / "lib").glob("*.scad")) + [tmp / "src" / "Full_Turtle.scad"]:
        s = f.read_text(encoding="utf-8")
        s = s.replace("color(enabled ? coded_color : neutral) children();",
                      'if ($grp == "wood") children();')
        s = s.replace("color(colored ? coded_color : p_wood_shade_sail()) children();",
                      'if ($grp == "wood") children();')
        s = re.sub(r"(?<![\w.])color\(", "gcolor(", s)
        f.write_text(s + GCOLOR, encoding="utf-8")

    full = tmp / "src" / "Full_Turtle.scad"
    s = full.read_text(encoding="utf-8")
    s = sub(s, 'assembly_view = "full_turtle";', 'assembly_view = "none"; scene = 1;')
    s = sub(s, '} else {\n    assert(false, str("Unknown assembly_view: ", assembly_view));\n}', "}")
    s = sub(s, "module bottle_at_port(direction = \"+Y\") {",
            "module bottle_at_port(direction = \"+Y\") if (!$no_aid) _bottle_at_port(direction);\n"
            "module _bottle_at_port(direction = \"+Y\") {")
    # Inside the control unit's 180°-flipped frame, -Z is physically up.
    s = sub(s, "            translate([cx, cy, control_assembly_z]) {\n",
            "            if ($show_shell) translate([cx, cy, control_assembly_z + 40 - $shell_lift])\n"
            "                rotate([180, 0, 0]) turtle_shell_mock();\n"
            "            translate([cx, cy, control_assembly_z - $cap_lift]) {\n")
    s = sub(s, "            translate([cx, cy,\n                       control_assembly_z - (p_axle_upper_len() + p_axle_round_ext())])",
            "            translate([cx, cy,\n                       control_assembly_z - $cap_lift - (p_axle_upper_len() + p_axle_round_ext())])")
    s = sub(s, "            positioned_cage_assembly();\n            positioned_sail_frame();\n        }",
            "            if ($show_cage) { positioned_cage_assembly(); positioned_sail_frame(); }\n        }")
    full.write_text(s + SHELL + SCENES, encoding="utf-8")
    return full


def export(scad: Path, scene: int, grp: str, tmp: Path) -> np.ndarray:
    out = tmp / f"scene{scene}_{grp}.stl"
    run = subprocess.run(
        ["openscad", "-D", f"scene={scene}", "-D", f'$grp="{grp}"', "-o", str(out), str(scad)],
        capture_output=True, text=True)
    if run.returncode != 0:
        if "Current top level object is empty" in run.stderr:
            return np.empty((0, 3, 3))
        raise SystemExit(run.stderr[-2000:])
    return previews.read_stl(out)


def main() -> None:
    scenes = [int(s) for s in sys.argv[1:]] or sorted(SCENE_SETUP)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        scad = patch(tmp)
        for scene in scenes:
            groups, view, margin = SCENE_SETUP[scene]
            meshes = {g: export(scad, scene, g, tmp) for g in groups}
            img = previews.draw_view(meshes, view, SIZE, margin)
            out = OUT_DIR / f"together-{scene}.webp"
            img.save(out, "WEBP", quality=88)
            print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
