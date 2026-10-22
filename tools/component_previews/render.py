#!/usr/bin/env python3
"""Pen-and-ink preview cards for the generator's Step 4 component picker.

Renders a turtle component straight from its vendored turtle_body bundle
(generator/turtle_body/scad/, refreshed by generator/sync_from_turtle_body.py)
so the card always shows the current design: OpenSCAD exports the wooden
parts as one STL, the mesh is split into its separate boards, and each board
is inked with outlines plus wood-grain hatching that runs along its own long
axis -- denser on faces turned from the light, cross-hatched in shadow, close
end-grain lines on cut ends. Reuses the z-buffer and outline code of
tools/assembly_drawings/render.py.

Writes public/images/ecojoiners/<name>.webp (500 x 500, the card size), plus
a 1000 px <name>-high.webp for the components in HIGH (the sail frame's goes
on the sails carpenter PDF):

    python3 tools/component_previews/render.py [head_fin] [sail_frame]

Needs openscad on PATH, numpy and Pillow.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent / "assembly_drawings"))
from render import read_stl, view_matrix, rasterise, dilate  # noqa: E402

BUNDLES = ROOT / "generator" / "turtle_body" / "scad"
OUT_DIR = ROOT / "public" / "images" / "ecojoiners"

SIZE = 500
SS = 4
MARGIN = 0.05
LIGHT = np.array([-0.45, 0.35, 0.82])
LIGHT /= np.linalg.norm(LIGHT)

# name -> (bundle, {group: OpenSCAD body}, (azimuth, elevation)). The "wood"
# group is split into boards and grain-hatched; an optional "fabric" group
# (the sails) is drawn as a light woven mesh in the same coordinates.
COMPONENTS = {
    "head_fin": (
        "Turtle_Head_Fin.scad",
        {"wood": "head_fin_assembly(colored = false);"},
        (140, 30),
    ),
    "sail_frame": (
        "Turtle_Sail_Apparatus.scad",
        {
            "wood": 'sail_frame(part = "native_assembly", show_hardware = false, show_sails = false, colored = false);',
            "fabric": 'sail_frame(part = "sails");',
        },
        (-38, 22),
    ),
}
FABRIC_ID = 1_000_000


def export_mesh(name: str, tmp: Path) -> dict:
    bundle, bodies, _ = COMPONENTS[name]
    meshes = {}
    for group, body in bodies.items():
        scad = tmp / f"{name}_{group}.scad"
        scad.write_text(f"use <{(BUNDLES / bundle).as_posix()}>\n{body}\n", encoding="utf-8")
        out = tmp / f"{name}_{group}.stl"
        subprocess.run(["openscad", "-o", str(out), str(scad)], check=True, capture_output=True)
        meshes[group] = read_stl(out)
    return meshes


def split_parts(tris: np.ndarray):
    """Label each triangle with its connected board (shared vertices)."""
    keys = np.round(tris.reshape(-1, 3), 3)
    _, vid = np.unique(keys, axis=0, return_inverse=True)
    vid = vid.reshape(-1, 3)
    parent = np.arange(vid.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b, c in vid:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[find(rc)] = ra
    roots = np.array([find(v) for v in vid[:, 0]])
    _, part = np.unique(roots, return_inverse=True)
    return part


def draw(name: str, meshes: dict, size: int = SIZE) -> Image.Image:
    tris = meshes["wood"]
    part = split_parts(tris)
    keep, grain = [], {}
    for pid in np.unique(part):
        pts = tris[part == pid].reshape(-1, 3)
        ext = pts.max(0) - pts.min(0)
        if ext.min() < 0.5:          # sail membranes and other films: not wood
            continue
        keep.append(pid)
        axis = np.zeros(3)
        axis[int(np.argmax(ext))] = 1.0
        grain[pid] = axis
    mask = np.isin(part, keep)
    tris, part = tris[mask], part[mask]
    fabric = meshes.get("fabric")
    if fabric is not None and len(fabric):
        tris = np.concatenate([tris, fabric])
        part = np.concatenate([part, np.full(len(fabric), FABRIC_ID)])
        keep = keep + [FABRIC_ID]

    m = view_matrix(*COMPONENTS[name][2])
    v_all = tris @ m.T
    lo, hi = v_all.reshape(-1, 3).min(0), v_all.reshape(-1, 3).max(0)
    px = size * SS
    scale = px * (1 - 2 * MARGIN) / max(hi[0] - lo[0], hi[1] - lo[1])
    centre = (lo + hi) / 2

    depth = np.full((px, px), -np.inf)
    gbuf = np.full((px, px), -1, dtype=np.int32)
    nbuf = np.zeros((px, px, 3))
    for pid in keep:
        v = tris[part == pid] @ m.T
        normals = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
        normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12
        s = np.empty_like(v)
        s[..., 0] = (v[..., 0] - centre[0]) * scale + px / 2
        s[..., 1] = -(v[..., 1] - centre[1]) * scale + px / 2
        s[..., 2] = v[..., 2] * scale
        rasterise(s, pid, normals, depth, gbuf, nbuf)

    filled = gbuf >= 0
    ink = np.zeros((px, px), dtype=bool)

    # Outlines: heavy where depth jumps or one board meets another, light on creases.
    d = np.where(filled, depth, depth[filled].min() - 50 * SS)
    sil = np.zeros_like(ink)
    crease = np.zeros_like(ink)
    for ax in (0, 1):
        dd = np.abs(np.diff(d, axis=ax))
        nd = 1 - np.sum(np.diff(nbuf, axis=ax) ** 2, axis=2) / 2
        gd = np.diff(gbuf, axis=ax) != 0
        pad = [(0, 1), (0, 0)] if ax == 0 else [(0, 0), (0, 1)]
        sil |= np.pad((dd > 6 * SS) | gd, pad)
        crease |= np.pad(nd < 0.92, pad)
    ink |= dilate(sil, int(2.4 * SS))
    ink |= dilate(crease & ~sil, int(1.1 * SS))

    shade = np.clip(nbuf @ LIGHT, 0, 1)
    yy, xx = np.mgrid[0:px, 0:px].astype(float)
    rng = np.random.default_rng(11)
    line_w = max(1, int(1.05 * SS))

    # Sail fabric: a fine, light woven mesh -- no grain, no tone hatching.
    cloth = gbuf == FABRIC_ID
    ink |= cloth & ((np.mod(xx + yy, 7 * SS) < 0.5 * SS) | (np.mod(xx - yy, 7 * SS) < 0.5 * SS))

    for pid in keep:
        here = gbuf == pid
        if pid == FABRIC_ID or not here.any():
            continue
        # Grain direction on screen: the board's long axis, projected.
        g = m @ grain[pid]
        gx, gy = g[0], -g[1]
        n = np.hypot(gx, gy)
        gx, gy = (gx / n, gy / n) if n > 1e-6 else (1.0, 0.0)
        u = xx * -gy + yy * gx            # across the grain
        v = xx * gx + yy * gy             # along the grain
        ph1, ph2, ph3 = rng.uniform(0, 2 * np.pi, 3)
        wobble = 2.2 * SS * np.sin(v / (41 * SS) + ph1) + 0.9 * SS * np.sin(v / (13 * SS) + u / (90 * SS) + ph2)
        broken = np.sin(v / (29 * SS) + u * 0.21 / SS + ph3) > -0.55   # hand-drawn gaps

        def grain_lines(spacing):
            return (np.mod(u + wobble, spacing * SS) < line_w) & broken

        end_grain = np.abs(nbuf @ (m @ grain[pid])) > 0.85
        face = here & ~end_grain
        ink |= face & (shade >= 0.62) & grain_lines(8)
        ink |= face & (shade < 0.62) & (shade >= 0.30) & grain_lines(4)
        ink |= face & (shade < 0.30) & (np.mod(u, 3.2 * SS) < line_w)
        ink |= face & (shade < 0.30) & (np.mod(xx - yy, 6 * SS) < line_w)
        # Cut ends: tight, slightly curved lines across the end grain.
        ink |= here & end_grain & (np.mod(xx + yy + 1.5 * SS * np.sin(xx / (17 * SS)), 3.6 * SS) < line_w)

    img = Image.fromarray(np.where(ink, 0, 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.GaussianBlur(0.35 * SS))
    return img.resize((size, size), Image.LANCZOS).convert("RGB")


HIGH = {"sail_frame": 1000}


def main() -> None:
    names = sys.argv[1:] or list(COMPONENTS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for name in names:
            mesh = export_mesh(name, Path(tmp))
            stem = name.replace("_", "-")
            outs = [(OUT_DIR / f"{stem}.webp", draw(name, mesh))]
            if name in HIGH:
                outs.append((OUT_DIR / f"{stem}-high.webp", draw(name, mesh, size=HIGH[name])))
            for out, img in outs:
                img.save(out, "WEBP", quality=88)
                print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
