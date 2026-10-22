#!/usr/bin/env python3
"""Fail if a generator's shared-input default has drifted from turtle_body.

Every generator here keeps its own copy of the handful of dimensions it shares
with turtle_body's `lib/params.scad` -- bottle diameter, wood thickness, cap /
collar diameters, the M6 mounting-hole geometry, and so on. Those copies are
what drifted between turtle_body v1.6 and v1.7 (SYNC_PLAN.md, items S-1..S-4:
"cap 32 vs 31", "screw 4.5 vs 6.4", ...). This script is the alarm: it loads the
vendored `turtle_body/params.json` snapshot and asserts each generator's default
still equals the upstream `p_*()` value it mirrors.

It does NOT check derived geometry -- the formulas in each `derive_dimensions()`
still need a human eye against the matching `lib/*.scad` module after an upstream
release (SYNC_PLAN.md "Verification for any sync item"). It checks the input
layer, which is the layer that silently drifts.

    generator/check_params_sync.py            # exit nonzero on any mismatch
    generator/check_params_sync.py -q         # only print on failure

Run `generator/sync_from_turtle_body.py` first to refresh the snapshot.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PARAMS_JSON = HERE / "turtle_body" / "params.json"

TOL = 1e-6


def _load_params() -> dict:
    if not PARAMS_JSON.is_file():
        raise SystemExit(
            f"check_params_sync: {PARAMS_JSON.relative_to(HERE.parent)} is missing. "
            "Run: python3 generator/sync_from_turtle_body.py"
        )
    return json.loads(PARAMS_JSON.read_text(encoding="utf-8"))


def _checks(p: dict) -> list[tuple[str, str, float, float]]:
    """(param, where, upstream, generator) rows. Import generators lazily so an
    import error is reported as a failed row, not a crash."""
    sys.path.insert(0, str(HERE))
    import common
    import back_fin_generator as bf_ref
    import bottom_ballast_fin_generator as bal_ref
    from objects import ecojoiner_6fc as eco, sails
    from objects import ballast as bal_obj
    import head_fin_generator as hf_ref

    eco_in = eco.EcojoinerInputs()
    eco_derived = eco.derive_dimensions(eco.EcojoinerInputs())
    sail_in = sails.SailsInputs()
    bf = bf_ref.DEFAULTS
    bft = bf_ref.TUNING
    bal = bal_ref.DEFAULTS
    sail_d = sails.derive_dimensions(sail_in)
    hf = hf_ref.DEFAULTS
    hf_d = hf_ref.dimensions({**hf_ref.DEFAULTS, **hf_ref.TUNING})

    # (json param, where it lives here, generator-side value)
    rows = [
        # shared board / slat thickness  -- p_wood_t()
        ("p_wood_t", "6fc EcojoinerInputs.slat_thickness", eco_in.slat_thickness),
        ("p_wood_t", "fin DEFAULTS['wood_thickness']", bf["wood_thickness"]),
        ("p_wood_t", "ballast DEFAULTS['wood_thickness']", bal["wood_thickness"]),
        ("p_wood_t", "sails SailsInputs.wood_thickness", sail_in.wood_thickness),
        # bottle body diameter / Ecojoiner port height  -- p_bottle_d() / p_port_height()
        ("p_port_height", "6fc EcojoinerInputs.port_height", eco_in.port_height),
        ("p_bottle_d", "fin DEFAULTS['bottle_diameter']", bf["bottle_diameter"]),
        ("p_bottle_d", "ballast DEFAULTS['bottle_diameter']", bal["bottle_diameter"]),
        ("p_bottle_d", "sails SailsInputs.bottle_diameter", sail_in.bottle_diameter),
        # ordinary screw-cap diameter  -- p_bottle_cap_d()
        ("p_bottle_cap_d", "6fc EcojoinerInputs.cap_diameter", eco_in.cap_diameter),
        ("p_bottle_cap_d", "fin DEFAULTS['cap_diameter']", bf["cap_diameter"]),
        ("p_bottle_cap_d", "ballast DEFAULTS['cap_diameter']", bal["cap_diameter"]),
        ("p_bottle_cap_d", "sails SailsInputs.cap_diameter", sail_in.cap_diameter),
        # bottle collar diameter  -- p_collar_d()
        ("p_collar_d", "6fc EcojoinerInputs.collar_diameter", eco_in.collar_diameter),
        ("p_collar_d", "sails SailsInputs.collar_diameter", sail_in.collar_diameter),
        # total bottle height  -- p_bottle_h()
        ("p_bottle_h", "fin DEFAULTS['bottle_height']", bf["bottle_height"]),
        ("p_bottle_h", "ballast DEFAULTS['bottle_height']", bal["bottle_height"]),
        ("p_bottle_h", "sails SailsInputs.bottle_height", sail_in.bottle_height),
        # ordinary screw-cap height  -- p_bottle_cap_h()
        ("p_bottle_cap_h", "fin DEFAULTS['cap_height']", bf["cap_height"]),
        ("p_bottle_cap_h", "ballast DEFAULTS['cap_height']", bal["cap_height"]),
        ("p_bottle_cap_h", "sails SailsInputs.cap_height", sail_in.cap_height),
        # shared fin-system stock width  -- p_fin_board_w()
        ("p_fin_board_w", "fin DEFAULTS['fin_board_width']", bf["fin_board_width"]),
        ("p_fin_board_w", "ballast DEFAULTS['fin_board_width']", bal["fin_board_width"]),
        # solar panel  -- p_solar_panel_w/h/t()
        ("p_solar_panel_w", "fin DEFAULTS['solar_panel_width']", bf["solar_panel_width"]),
        ("p_solar_panel_h", "fin DEFAULTS['solar_panel_height']", bf["solar_panel_height"]),
        ("p_solar_panel_t", "fin DEFAULTS['solar_panel_thickness']", bf["solar_panel_thickness"]),
        # M5 bite hole  -- p_m5_hole_d() (p_m5_clearance_d() in v5.0.0, p_m6_clearance_d() before)
        ("p_m5_hole_d", "6fc EcojoinerInputs.screw_diameter", eco_in.screw_diameter),
        ("p_m5_hole_d", "fin TUNING['shaft_hole_diameter']", bft["shaft_hole_diameter"]),
        ("p_m5_hole_d", "ballast MOUNT_HOLE_DIAMETER", bal_ref.MOUNT_HOLE_DIAMETER),
        # rear-fin shaft length  -- p_rear_shaft_len() (418 since v5.3.0)
        ("p_rear_shaft_len", "fin dimensions(DEFAULTS+TUNING)['shaft_length']",
         bf_ref.dimensions({**bf, **bft})["shaft_length"]),
        ("p_rear_shaft_hole_from_front", "fin dimensions(DEFAULTS+TUNING)['shaft_hole_from_front']",
         bf_ref.dimensions({**bf, **bft})["shaft_hole_from_front"]),
        # rear-fin shaft width == John height  -- p_rear_shaft_width() (60 since v5.4.0)
        ("p_rear_shaft_width", "fin default_shaft_width(DEFAULTS)", bf_ref.default_shaft_width({**bf, **bft})),
        # ballast core slats follow the John  -- p_ballast_core_w() / p_ballast_slat_spacing()
        ("p_ballast_core_w", "ballast derive_dimensions().slat_width", bal_obj.derive_dimensions(bal_obj.BallastInputs()).slat_width),
        ("p_ballast_slat_spacing", "ballast derive_dimensions() slot centre spacing",
         (lambda dd: dd.right_slot_center - dd.left_slot_center)(bal_obj.derive_dimensions(bal_obj.BallastInputs()))),
        # M5 clamp hardware drawn on the 6FC PDF  -- p_m5_*()
        ("p_m5_bolt_d", "6fc HW_BOLT_D", eco.HW_BOLT_D),
        ("p_m5_bolt_len", "6fc HW_BOLT_LEN", eco.HW_BOLT_LEN),
        ("p_m5_head_d", "6fc HW_HEAD_D", eco.HW_HEAD_D),
        ("p_m5_head_h", "6fc HW_HEAD_H", eco.HW_HEAD_H),
        ("p_m5_acorn_af", "6fc HW_ACORN_AF", eco.HW_ACORN_AF),
        ("p_m5_acorn_h", "6fc HW_ACORN_H", eco.HW_ACORN_H),
        # M5 pair edge inset  -- p_eco_screw_edge_inset() / p_eco_screw_pair_offset()
        ("p_eco_screw_edge_inset", "6fc SCREW_EDGE_INSET", eco.SCREW_EDGE_INSET),
        ("p_eco_screw_edge_inset", "fin SCREW_EDGE_INSET", bf_ref.SCREW_EDGE_INSET),
        ("p_eco_screw_edge_inset", "ballast MOUNT_HOLE_EDGE_INSET", bal_ref.MOUNT_HOLE_EDGE_INSET),
        ("p_eco_screw_pair_offset", "6fc derive_dimensions().screw_pair_offset", eco_derived.screw_pair_offset),
        ("p_eco_screw_pair_offset", "fin shaft_hole_pair_offset(DEFAULTS)", bf_ref.shaft_hole_pair_offset(bf)),
        # John mounting-hole inset  -- p_screw_side_offset()
        ("p_screw_side_offset", "6fc derive_dimensions().screw_side_offset", eco_derived.screw_side_offset),
        ("p_screw_side_offset", "fin SCREW_SIDE_OFFSET", bf_ref.SCREW_SIDE_OFFSET),
        ("p_screw_side_offset", "ballast MOUNT_HOLE_SCREW_SIDE_OFFSET", bal_ref.MOUNT_HOLE_SCREW_SIDE_OFFSET),
        # port seating allowance  -- p_port_allowance()
        ("p_port_allowance", "6fc common.DEFAULT_PORT_ALLOWANCE_MM", common.DEFAULT_PORT_ALLOWANCE_MM),
        ("p_port_allowance", "6fc EcojoinerInputs.port_allowance", eco_in.port_allowance),
        # wood-joint fit clearance  -- p_fit_clearance()
        ("p_fit_clearance", "6fc EcojoinerInputs.fit_clearance", eco_in.fit_clearance),
        # bottle top / bottom dome heights  -- p_top_dome_h() / p_bottom_dome_h()
        ("p_top_dome_h", "6fc EcojoinerInputs.taper_height", eco_in.taper_height),
        ("p_top_dome_h", "sails SailsInputs.top_dome_height", sail_in.top_dome_height),
        ("p_bottom_dome_h", "sails SailsInputs.bottom_dome_height", sail_in.bottom_dome_height),
        # sail side batten height / cage mount hole  -- p_side_batten_h() / p_cage_mount_hole_d()
        ("p_side_batten_h", "sails SailsInputs.side_batten_height", sail_in.side_batten_height),
        ("p_cage_mount_hole_d", "sails SailsInputs.cage_mount_hole_diameter", sail_in.cage_mount_hole_diameter),
        # split top crossbar (v6.0.0) and bottom rail  -- p_sail_*() / p_bottom_rail_len() / p_top_crossbar_len()
        ("p_top_crossbar_len", "sails derive_dimensions().top_bar_length", sail_d.top_bar_length),
        ("p_bottom_rail_len", "sails derive_dimensions().bottom_bar_length", sail_d.bottom_bar_length),
        ("p_sail_connector_axle_hole_d", "sails CONNECTOR_AXLE_HOLE_D", sails.CONNECTOR_AXLE_HOLE_D),
        ("p_sail_m3_pilot_d", "sails SAIL_M3_PILOT_D", sails.SAIL_M3_PILOT_D),
        ("p_sail_m3_clear_d", "sails SAIL_M3_CLEAR_D", sails.SAIL_M3_CLEAR_D),
        ("p_sail_connector_overhang", "sails CONNECTOR_OVERHANG", sails.CONNECTOR_OVERHANG),
        ("p_sail_bar_half_inboard", "sails HALF_INBOARD", sails.HALF_INBOARD),
        # head fin (v5.8.0+, experimental)  -- p_head_*() / shared inputs
        ("p_wood_t", "head_fin DEFAULTS['wood_thickness']", hf["wood_thickness"]),
        ("p_bottle_d", "head_fin DEFAULTS['bottle_diameter']", hf["bottle_diameter"]),
        ("p_bottle_h", "head_fin DEFAULTS['bottle_height']", hf["bottle_height"]),
        ("p_bottle_cap_h", "head_fin DEFAULTS['cap_height']", hf["cap_height"]),
        ("p_fin_board_w", "head_fin DEFAULTS['fin_board_width']", hf["fin_board_width"]),
        ("p_m5_hole_d", "head_fin TUNING['slat_hole_diameter']", hf_ref.TUNING["slat_hole_diameter"]),
        ("p_fit_clearance", "head_fin TUNING['half_lap_clearance']", hf_ref.TUNING["half_lap_clearance"]),
        ("p_head_fin_w", "head_fin dimensions()['fin_width']", hf_d["fin_width"]),
        ("p_head_fin_h", "head_fin dimensions()['fin_height']", hf_d["fin_height"]),
        ("p_head_fin_heel_x", "head_fin dimensions()['heel_x']", hf_d["heel_x"]),
        ("p_head_fin_toe_h", "head_fin dimensions()['toe_h']", hf_d["toe_h"]),
        ("p_head_fin_drop", "head_fin dimensions()['drop']", hf_d["drop"]),
        ("p_head_fin_forefoot_setback", "head_fin dimensions()['setback']", hf_d["setback"]),
        ("p_head_slat_overlap", "head_fin dimensions()['overlap']", hf_d["overlap"]),
        ("p_head_half_lap_engagement", "head_fin dimensions()['joint_meet_x']", hf_d["joint_meet_x"]),
        ("p_head_slat_len", "head_fin dimensions()['slat_length']", hf_d["slat_length"]),
        ("p_head_slat_width", "head_fin dimensions()['slat_width']", hf_d["slat_width"]),
        ("p_head_slat_hole_from_front", "head_fin dimensions()['slat_hole_from_front']", hf_d["slat_hole_from_front"]),
    ]

    out = []
    for param, where, value in rows:
        if param not in p:
            out.append((param, where, float("nan"), float(value)))
            continue
        out.append((param, where, float(p[param]), float(value)))
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-q", "--quiet", action="store_true", help="print only on failure")
    args = ap.parse_args(argv)

    p = _load_params()
    try:
        rows = _checks(p)
    except Exception as exc:  # noqa: BLE001 -- surface any import/eval failure as a hard fail
        print(f"check_params_sync: could not evaluate generator defaults: {exc}")
        return 2

    mismatches = [r for r in rows if not abs(r[2] - r[3]) <= TOL or r[2] != r[2]]
    width = max(len(r[0]) for r in rows)

    if not args.quiet or mismatches:
        print(f"turtle_body {p.get('version', '?')}  --  {len(rows)} shared-input checks\n")
        for param, where, up, gen in rows:
            ok = abs(up - gen) <= TOL and up == up
            mark = "ok  " if ok else "DRIFT"
            note = "" if ok else f"   upstream={up:g}  generator={gen:g}"
            print(f"  {mark} {param:<{width}}  {where}{note}")

    if mismatches:
        print(
            f"\n{len(mismatches)} value(s) drifted from turtle_body {p.get('version', '?')}. "
            "Update the generator default (cite the p_*() name) or, if the generator's "
            "rule is the one lib should adopt, lift it upstream -- see SYNC_PLAN.md."
        )
        return 1
    if not args.quiet:
        print(f"\nall {len(rows)} shared inputs match turtle_body {p.get('version', '?')}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
