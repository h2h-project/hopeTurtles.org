"""Calibration ruler paths shared by head/rear SCAD, SVG, DXF and PDF exports.

Pure Python at runtime: the website does not require OpenSCAD. Fit rules and
vector glyphs mirror turtle_body/lib/fin_ruler.scad; verify_fin_rulers.py checks
geometric parity against the vendored SCAD at defaults and custom dimensions.
SCAD definitions themselves are extracted verbatim from the vendored bundle.
"""
from __future__ import annotations
import re
from functools import lru_cache
from pathlib import Path
import turtle_body_bundle as tbb

BUNDLE = 'Turtle_Rear_Fin.scad'
ENGRAVE_LAYER = 'ENGRAVE'


@lru_cache(maxsize=1)
def scad_definitions():
    source = tbb.load_bundle(BUNDLE)
    start = source.index('function fr_depth()')
    end = source.index('module fin_ruler_recess(', start)
    opening = source.index('{', end)
    level = 1
    end = opening + 1
    while level:
        level += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + '\n'


@lru_cache(maxsize=8)
def _literal(name):
    match = re.search(r'function '+re.escape(name)+r'\(\)\s*=\s*([\d.]+)\s*;', scad_definitions())
    if not match:
        raise ValueError(f'Upstream {name}() changed: update and verify the Python ruler port')
    return float(match[1])


def _ruler_x(kind, inputs):
    # fr_x(): place beyond each half-lap, retaining the upstream margin.
    match = re.search(r'function fr_joint_margin\(kind\)\s*=\s*kind == "head"\s*\?\s*([\d.]+)\s*:\s*([\d.]+)',scad_definitions())
    if not match:
        raise ValueError('Upstream fr_joint_margin() changed: update and verify the Python ruler port')
    joint = 2*inputs.wood_thickness if kind=='head' else (inputs.fin_board_width-2*inputs.wood_thickness)/2
    return joint+inputs.half_lap_clearance/2+float(match[1 if kind=='head' else 2])


def _rect(x, y, width, height):
    return [(x,y),(x+width,y),(x+width,y+height),(x,y+height)]


def _glyph(char):
    # fr_segments(), fr_char(): square-capped .25 mm strokes, no font dependency.
    stroke = _literal('fr_stroke')
    segments = {'0':[0,1,2,3,4,5],'1':[1,2],'2':[0,1,6,4,3],
                '3':[0,1,6,2,3],'4':[5,6,1,2],'5':[0,5,6,2,3],
                '6':[0,5,6,4,2,3],'7':[0,1,2],'8':[0,1,2,3,4,5,6],
                '9':[0,1,2,3,5,6]}
    endpoints = [((0,3),(1.5,3)),((1.5,3),(1.5,1.5)),((1.5,1.5),(1.5,0)),
                 ((0,0),(1.5,0)),((0,0),(0,1.5)),((0,1.5),(0,3)),((0,1.5),(1.5,1.5))]
    result = []
    for index in segments.get(char,[]):
        (x0,y0),(x1,y1)=endpoints[index]
        result.append(_rect(min(x0,x1)-stroke/2,min(y0,y1)-stroke/2,
                            abs(x1-x0)+stroke,abs(y1-y0)+stroke))
    if char in ('+','-'):
        result.append(_rect(0,1.375,1.5,.25))
        if char=='+':result.append(_rect(.625,.75,.25,1.5))
    if char=='m':
        for x in (0,.75,1.5):
            result.extend([_rect(x,0,.25,1.5),_rect(x,1.25,.5,.25)])
    return result


def _label(value, x, z, mirrored):
    result=[]
    for i,char in enumerate(value):
        for poly in _glyph(char):
            result.append([(x+(len(value)*2.2-.7-(px+i*2.2) if mirrored else px+i*2.2), z+py) for px,py in poly])
    return result


def ruler_geometry(kind, inputs, derived, *, mirrored=False):
    """Return paths in fin-local X/Z mm; shift_z maps into the 2D sheet frame."""
    t,bd,width=inputs.wood_thickness,inputs.bottle_diameter,inputs.fin_board_width
    clearance=inputs.half_lap_clearance
    x=_ruler_x(kind,inputs)
    if kind=='head':
        height,drop=derived.fin_height,derived.drop
        zero=0.
        shift_z=height/2+drop
        def fits(x0,x1,z0,z1):
            return (z0>=-height/2-drop+5 and z1<=height/2-5
                and x0>=derived.overlap/2+clearance/2+5
                and x1+5<=derived.heel_x+(width-derived.heel_x)*(height/2-z1)/(height-derived.toe_h)
                and x1+5<=width-derived.setback)
    else:
        # rf_ruler_zero(): midpoint of the ACTUAL gap between holder shafts;
        # preserve the website's port_fit_mm adjustment to this gap.
        zero=derived.lower_shaft_z0+t+(bd+inputs.port_fit_mm)/2
        shift_z=0.
        def fits(x0,x1,z0,z1):
            return (z0>=max(0,(2/3)*bd-x0)+5 and z1<=3*bd-5
                and x0>=(width-2*t)/2+clearance/2+5 and x1<=width-2*t-5)
    paths=[];ticks=[]
    for value in range(-500,501):
        z=zero+value
        length=8 if value%10==0 else 6 if value%5==0 else 3
        weight=.6 if value==0 else .25
        if fits(x,x+length,z-weight/2,z+weight/2):
            paths.append(_rect(x,z-weight/2,length,weight));ticks.append(value)
        label=('+' if value>0 else '')+str(value)
        if value%10==0 and fits(x+10,x+10+len(label)*2.2,z-1.7,z+1.7):
            paths.extend(_label(label,x+10,z-1.5,mirrored))
    if fits(x+10,x+15,zero+3,zero+6.5):
        paths.extend(_label('mm',x+10,zero+3,mirrored))
    return paths,{'units':'mm','zero_local_z_mm':zero,'drawing_shift_z_mm':shift_z,
                  'reading_sign':'positive above horizontal bottle axis',
                  'engraving_depth_mm':_literal('fr_depth'),
                  'range_mm':[min(ticks),max(ticks)] if ticks else None,
                  'zero_tick_present':0 in ticks,'reference_x_mm':x}


def sheet_paths(kind,inputs,derived,*,face_b=False):
    paths,meta=ruler_geometry(kind,inputs,derived,mirrored=face_b)
    return [[(-x if face_b else x,z+meta['drawing_shift_z_mm']) for x,z in poly] for poly in paths]


def svg_paths(kind,inputs,derived):
    polygons=sheet_paths(kind,inputs,derived)
    return '<g class="engrave" data-operation="engrave" data-depth-mm="0.3" fill="#924531" stroke="none">\n'+''.join(
        '<polygon points="'+' '.join(f'{x:.6f},{y:.6f}' for x,y in poly)+'"/>\n' for poly in polygons)+'</g>\n'


def draw_dxf(msp,kind,inputs,derived,*,offset_y=10.,face_b=False):
    doc=msp.doc
    if ENGRAVE_LAYER not in doc.layers:doc.layers.add(ENGRAVE_LAYER,color=1)
    for poly in sheet_paths(kind,inputs,derived,face_b=face_b):
        msp.add_lwpolyline([(x,y+offset_y) for x,y in poly],close=True,dxfattribs={'layer':ENGRAVE_LAYER})


def write_opposite_dxf(path,kind,inputs,derived):
    import ezdxf
    doc=ezdxf.new('R2010');doc.units=ezdxf.units.MM
    from common import _dxf_setup
    _dxf_setup(doc)
    draw_dxf(doc.modelspace(),kind,inputs,derived,face_b=True)
    doc.header.custom_vars.append('FIN_RULER_REGISTRATION','Same Y=10 mm sheet origin; flip about X=0; do not auto-centre; ENGRAVE ONLY')
    doc.saveas(path)


def draw_pdf(c,kind,inputs,derived,ox,oy,scale):
    c.saveState();c.setFillColorRGB(.57,.27,.19)
    for poly in sheet_paths(kind,inputs,derived):
        p=c.beginPath();p.moveTo(ox+poly[0][0]*scale,oy+poly[0][1]*scale)
        for x,y in poly[1:]:p.lineTo(ox+x*scale,oy+y*scale)
        p.close();c.drawPath(p,fill=1,stroke=0)
    c.restoreState()
