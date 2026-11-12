#!/usr/bin/env python3
"""Verify ruler exports without adding a server-side OpenSCAD dependency.

Local developer check: needs OpenSCAD (OPENSCAD env/PATH/~/.local/bin), ReportLab
and ezdxf (generator/.venv). Uses scan-line interval unions rather than Shapely.
Compares the Python engraving footprint to the actual vendored SCAD, on both
faces, with changed bottle/stock dimensions and connection-fit offsets.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import ezdxf
import fin_rulers
from objects import head_fin, back_fin


def edges_from_dxf(path, layer=None):
    result=[]
    for entity in ezdxf.readfile(path).modelspace():
        if layer is not None and entity.dxf.layer!=layer:continue
        if entity.dxftype()=='LINE':
            result.append((tuple(entity.dxf.start)[:2],tuple(entity.dxf.end)[:2]))
        elif entity.dxftype()=='LWPOLYLINE':
            points=list(entity.get_points('xy'))
            result.extend(zip(points,points[1:]))
            if entity.closed:result.append((points[-1],points[0]))
        else:raise AssertionError(f'Unexpected engraving entity {entity.dxftype()}')
    return [((round(a[0],4),round(a[1],4)),(round(b[0],4),round(b[1],4))) for a,b in result]


def scad_intervals(edges,y):
    xs=[]
    for (x0,y0),(x1,y1) in edges:
        if min(y0,y1)<y<max(y0,y1):xs.append(round(x0+(y-y0)*(x1-x0)/(y1-y0),4))
    xs.sort();assert len(xs)%2==0
    return list(zip(xs[::2],xs[1::2]))


def rect_intervals(polys,y):
    intervals=[]
    for points in polys:
        x0=min(p[0] for p in points);x1=max(p[0] for p in points)
        y0=min(p[1] for p in points);y1=max(p[1] for p in points)
        if round(y0,4)<y<round(y1,4):intervals.append((round(x0,4),round(x1,4)))
    merged=[]
    for lo,hi in sorted(intervals):
        if merged and lo<=merged[-1][1]+.0001:merged[-1]=(merged[-1][0],max(hi,merged[-1][1]))
        else:merged.append((lo,hi))
    return merged


def compare_footprints(polys,edges):
    ys=sorted({round(y,4) for poly in polys for _,y in poly}|{y for edge in edges for _,y in edge})
    assert len(ys)>10
    for y0,y1 in zip(ys,ys[1:]):
        y=(y0+y1)/2
        wanted=rect_intervals(polys,y);actual=scad_intervals(edges,y)
        assert actual==wanted,(y,actual,wanted)


def verify():
    osc=os.environ.get('OPENSCAD') or shutil.which('openscad') or str(Path.home()/'.local/bin/openscad')
    cases=[{}, {'bottle_diameter':90,'wood_thickness':10,'fin_board_width':110},
           {'bottle_diameter':88,'wood_thickness':11,'fin_board_width':100,'port_fit_mm':-1,'half_lap_clearance':.4},
           {'bottle_diameter':88,'wood_thickness':11,'fin_board_width':100,'port_fit_mm':1,'half_lap_clearance':.4}]
    comparisons=0
    with tempfile.TemporaryDirectory(prefix='fin-ruler-verify-') as td:
        root=Path(td)
        for kind,module in [('head',head_fin),('rear',back_fin)]:
            for index,params in enumerate(cases):
                inputs=module.parse_inputs_from_dict({**params,'formats':['scad','svg','dxf','pdf'],'job_id':f'verify_{index}'})
                assert not module.validate_inputs(inputs),module.validate_inputs(inputs)
                derived=module.derive_dimensions(inputs)
                dry=module.generate(inputs,root,dry_run=True)
                assert dry['ok'] and dry['files']==[] and dry['derived']['ruler']['zero_tick_present']
                result=module.generate(inputs,root)
                assert result['ok'] and len(result['files'])==7,result
                files=result['files'];scad=next(Path(f['path']) for f in files if f['format']=='scad')
                source=scad.read_text()
                # Keep the real builder parameter overrides and definitions; remove only
                # the wrapper's top-level 3D dispatch for a 2D footprint comparison.
                match=re.search(r'^if\s*\(part\s*==\s*"assembly"\)',source,re.M)
                assert match,'Component wrapper dispatch changed; update the verification extraction'
                definitions=source[:match.start()]
                zero='0' if kind=='head' else 'lower_shaft_z0+t+port_height/2'
                for mirrored in (False,True):
                    check=root/'ruler.scad';dxf=root/'ruler.dxf'
                    check.write_text(definitions+f'\nfin_ruler_2d("{kind}",{zero},{str(mirrored).lower()});\n')
                    p=subprocess.run([osc,'-o',str(dxf),str(check)],capture_output=True,text=True,timeout=120)
                    assert p.returncode==0 and 'WARNING:' not in p.stderr and 'ERROR:' not in p.stderr,p.stderr
                    polygons,metadata=fin_rulers.ruler_geometry(kind,inputs,derived,mirrored=mirrored)
                    compare_footprints(polygons,edges_from_dxf(dxf))
                    comparisons+=1
                for f in files:
                    path=Path(f['path']);assert path.is_file() and path.stat().st_size>0
                    if f['format']=='dxf':
                        doc=ezdxf.readfile(path);assert doc.units==4
                        layers={e.dxf.layer for e in doc.modelspace()}
                        assert 'ENGRAVE' in layers
                        assert ('CUT' not in layers) if 'face_b' in path.name else ('CUT' in layers)
                    if f['format']=='svg':
                        text=path.read_text();assert 'data-operation="engrave"' in text and 'scale(1 -1)' in text
                # Existing main-sheet engraving and the dedicated flip file must
                # match the same local geometry and Y=10 registration datum.
                for face_b in (False,True):
                    suffix='fin_face_b_engrave_1to1.dxf' if face_b else 'full_set_1to1.dxf'
                    file=next(Path(f['path']) for f in files if f['path'].endswith(suffix))
                    polys=fin_rulers.sheet_paths(kind,inputs,derived,face_b=face_b)
                    polys=[[(x,y+10) for x,y in poly] for poly in polys]
                    # Python export intentionally leaves overlapping glyph rectangles;
                    # compare their union using the same scan-line method.
                    doc=ezdxf.readfile(file)
                    actual=[list(e.get_points('xy')) for e in doc.modelspace() if e.dxf.layer=='ENGRAVE']
                    ys=sorted({round(y,4) for poly in polys+actual for _,y in poly})
                    for a,b in zip(ys,ys[1:]):assert rect_intervals(polys,(a+b)/2)==rect_intervals(actual,(a+b)/2)
        # Invalid geometry/stock must fail rather than publishing a ruler without zero.
        for module in (head_fin,back_fin):
            invalid=module.parse_inputs_from_dict({'wood_thickness':0})
            assert module.validate_inputs(invalid)
    print(f'PASS: {comparisons} SCAD/Python footprint comparisons; 8 complete SCAD/SVG/DXF/PDF export sets; face registration, dry runs, units and invalid inputs')

if __name__=='__main__':verify()
