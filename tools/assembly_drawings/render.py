#!/usr/bin/env python3
"""Pen-and-ink drawings of the Ecojoiner assembly steps.

Exports each step of ecojoiner_steps.scad from OpenSCAD as one STL per part
group, rasterises them with a small z-buffer, then inks the result: outlines
where depth or surface direction jumps, hatching on faces turned away from the
light, cross-hatching in shadow, solid black for the M5 hardware and a stipple
on the Master John so it reads apart from the Little Johns.

Writes public/images/ecojoiners/assembly/step-{1..5}.webp.

    python3 tools/assembly_drawings/render.py [step ...]

Needs openscad on PATH, numpy and Pillow.
"""

import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCAD = HERE / "ecojoiner_steps.scad"
OUT_DIR = ROOT / "public/images/ecojoiners/assembly"

SIZE = 1000        # output px (square)
SS = 3             # supersampling factor
MARGIN = 0.07      # fraction of the canvas kept clear around the drawing
GROUPS = ["wood", "master", "key", "hw"]

# Camera per step: (azimuth°, elevation°). The flat layout is seen from
# higher up so the parts read as a spread on a table.
VIEWS = {1: (-35, 52), 2: (-35, 28), 3: (-35, 28), 4: (-35, 28), 5: (-35, 28),
         6: (-68, 18)}

# Step 5 carries a close-up of the M5 clamp (scene 6) in a circle, bottom right.
INSET = {5: 6}
INSET_FRAC = 0.42

LIGHT = np.array([-0.45, 0.35, 0.82])
LIGHT /= np.linalg.norm(LIGHT)


def export(step, grp, tmp):
    out = Path(tmp) / f"s{step}_{grp}.stl"
    subprocess.run(
        ["openscad", "-D", f"step={step}", "-D", f'grp="{grp}"', "-o", str(out), str(SCAD)],
        check=True, capture_output=True,
    )
    return read_stl(out)


def read_stl(path):
    data = path.read_bytes()
    if data[:5] == b"solid" and b"facet" in data[:400]:
        verts = [
            [float(v) for v in line.split()[1:4]]
            for line in data.decode().splitlines()
            if line.strip().startswith("vertex")
        ]
        return np.array(verts, dtype=float).reshape(-1, 3, 3)
    count = struct.unpack("<I", data[80:84])[0]
    arr = np.frombuffer(data[84:84 + count * 50], dtype=np.dtype(
        [("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]))
    return arr["v"].astype(float)


def view_matrix(azimuth, elevation):
    a, e = np.radians(azimuth), np.radians(elevation)
    rz = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    # Tilt so +Z (world up) leans toward the viewer by the elevation angle.
    rx = np.array([[1, 0, 0], [0, np.sin(e), np.cos(e)], [0, -np.cos(e), np.sin(e)]])
    return rx @ rz


def rasterise(tris, gid, n, depth, gbuf, nbuf):
    """Scan-convert triangles (already in pixel space, z toward the viewer)."""
    h, w = depth.shape
    for tri, normal in zip(tris, n):
        x, y, z = tri[:, 0], tri[:, 1], tri[:, 2]
        x0, x1 = max(int(np.floor(x.min())), 0), min(int(np.ceil(x.max())), w - 1)
        y0, y1 = max(int(np.floor(y.min())), 0), min(int(np.ceil(y.max())), h - 1)
        if x0 > x1 or y0 > y1:
            continue
        det = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if abs(det) < 1e-9:
            continue
        px, py = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        l0 = ((y[1] - y[2]) * (px - x[2]) + (x[2] - x[1]) * (py - y[2])) / det
        l1 = ((y[2] - y[0]) * (px - x[2]) + (x[0] - x[2]) * (py - y[2])) / det
        l2 = 1 - l0 - l1
        inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        if not inside.any():
            continue
        zz = l0 * z[0] + l1 * z[1] + l2 * z[2]
        win = depth[y0:y1 + 1, x0:x1 + 1]
        hit = inside & (zz > win)
        win[hit] = zz[hit]
        gbuf[y0:y1 + 1, x0:x1 + 1][hit] = gid
        nbuf[y0:y1 + 1, x0:x1 + 1][hit] = normal


def dilate(mask, r):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def draw(step, meshes, size=SIZE):
    m = view_matrix(*VIEWS[step])
    all_pts = np.concatenate([t.reshape(-1, 3) for t in meshes.values() if len(t)]) @ m.T
    lo, hi = all_pts.min(0), all_pts.max(0)
    px = size * SS
    scale = px * (1 - 2 * MARGIN) / max(hi[0] - lo[0], hi[1] - lo[1])
    centre = (lo + hi) / 2

    depth = np.full((px, px), -np.inf)
    gbuf = np.full((px, px), -1, dtype=np.int16)
    nbuf = np.zeros((px, px, 3))

    for gid, grp in enumerate(GROUPS):
        tris = meshes.get(grp)
        if tris is None or not len(tris):
            continue
        v = tris @ m.T
        normals = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
        normals /= np.linalg.norm(normals, axis=1, keepdims=True) + 1e-12
        s = np.empty_like(v)
        s[..., 0] = (v[..., 0] - centre[0]) * scale + px / 2
        s[..., 1] = -(v[..., 1] - centre[1]) * scale + px / 2
        s[..., 2] = v[..., 2] * scale
        rasterise(s, gid, normals, depth, gbuf, nbuf)

    filled = gbuf >= 0
    ink = np.zeros((px, px), dtype=bool)

    # Outlines: silhouettes (depth jumps) heavy, creases (normal turns) light.
    d = np.where(filled, depth, depth[filled].min() - 50 * SS)
    jump = 6 * SS
    sil = np.zeros_like(ink)
    crease = np.zeros_like(ink)
    for ax in (0, 1):
        dd = np.abs(np.diff(d, axis=ax))
        nd = 1 - np.sum(np.diff(nbuf, axis=ax) ** 2, axis=2) / 2
        gd = np.diff(gbuf, axis=ax) != 0
        e_s = (dd > jump) | gd
        e_c = nd < 0.92
        pad = [(0, 1), (0, 0)] if ax == 0 else [(0, 0), (0, 1)]
        sil |= np.pad(e_s, pad)
        crease |= np.pad(e_c, pad)
    ink |= dilate(sil, int(1.6 * SS))
    ink |= dilate(crease & ~sil, int(0.8 * SS))

    # Tone from Lambert shading, then hatching by tone.
    shade = np.clip(nbuf @ LIGHT, 0, 1)
    yy, xx = np.mgrid[0:px, 0:px]
    spacing = 7 * SS
    hatch = ((xx + yy) % spacing) < max(1, int(0.9 * SS))
    cross = ((xx - yy) % spacing) < max(1, int(0.9 * SS))
    fine = ((xx + yy) % (4 * SS)) < max(1, int(0.8 * SS))
    wood = filled & (gbuf != GROUPS.index("hw"))
    ink |= wood & (shade < 0.62) & hatch
    ink |= wood & (shade < 0.30) & cross
    ink |= wood & (shade < 0.12) & fine

    # Master John: a stipple so it stands apart from the Little Johns.
    rng = np.random.default_rng(7)
    stipple = rng.random((px, px)) < 0.012
    ink |= (gbuf == GROUPS.index("master")) & dilate(stipple, 1)

    # Final Keys: close level lines, like end grain, so they read as one kind.
    ink |= (gbuf == GROUPS.index("key")) & ((yy % (4 * SS)) < max(1, int(0.8 * SS)))

    # Hardware: solid ink with a small highlight on lit faces.
    hw = gbuf == GROUPS.index("hw")
    ink |= hw & ~((shade > 0.85) & hatch)

    img = Image.fromarray(np.where(ink, 0, 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.GaussianBlur(0.6 * SS / 2))
    return img.resize((size, size), Image.LANCZOS)


def export_all(step, tmp):
    meshes = {}
    for grp in GROUPS:
        try:
            meshes[grp] = export(step, grp, tmp)
        except subprocess.CalledProcessError:
            meshes[grp] = np.empty((0, 3, 3))  # empty group: nothing to export
    return meshes


def with_inset(main, detail):
    """Shrink the main drawing toward the top left and set the detail in a
    ringed circle at the bottom right."""
    canvas = Image.new("L", (SIZE, SIZE), 255)
    canvas.paste(main.resize((int(SIZE * 0.86),) * 2, Image.LANCZOS), (0, 0))
    d = detail.size[0]
    mask = Image.new("L", (d * SS, d * SS), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, d * SS - 1, d * SS - 1), fill=255)
    mask = mask.resize((d, d), Image.LANCZOS)
    at = (SIZE - d - 12, SIZE - d - 12)
    canvas.paste(255, (*at, at[0] + d, at[1] + d), mask)
    canvas.paste(detail, at, mask)
    ring = Image.new("L", (SIZE * SS, SIZE * SS), 255)
    w = int(3 * SS)
    ImageDraw.Draw(ring).ellipse(
        (at[0] * SS, at[1] * SS, (at[0] + d) * SS - 1, (at[1] + d) * SS - 1), outline=0, width=w)
    ring = ring.resize((SIZE, SIZE), Image.LANCZOS)
    return ImageChops.darker(canvas, ring)


def main():
    steps = [int(s) for s in sys.argv[1:]] or [1, 2, 3, 4, 5]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for step in steps:
            img = draw(step, export_all(step, tmp))
            if step in INSET:
                d = int(SIZE * INSET_FRAC)
                img = with_inset(img, draw(INSET[step], export_all(INSET[step], tmp), d))
            out = OUT_DIR / f"step-{step}.webp"
            img.save(out, "WEBP", quality=88)
            print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
