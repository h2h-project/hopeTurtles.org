from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path
import math

OUT_PDF = Path('/mnt/data/flatpack_ecojoiner_v3_letter_cern_v3.pdf')
BASE_DIR = Path(__file__).resolve().parent

# Font strategy:
# - Place Arvo-Regular.ttf and Mulish-Light.ttf in ./fonts/ to get the desired brand typography.
# - Do not bundle font files in generated downloads unless your site has the right to do so.
# - This script falls back to local system fonts if Arvo/Mulish are unavailable.

def first_existing(paths):
    for p in paths:
        p = Path(p)
        if p.exists():
            return str(p)
    return None

TITLE_FONT_PATH = first_existing([
    BASE_DIR / 'fonts' / 'Arvo-Regular.ttf',
    BASE_DIR / 'Arvo-Regular.ttf',
    '/usr/share/fonts/truetype/arvo/Arvo-Regular.ttf',
    '/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
])
BODY_FONT_PATH = first_existing([
    BASE_DIR / 'fonts' / 'Mulish-Light.ttf',
    BASE_DIR / 'Mulish-Light.ttf',
    '/usr/share/fonts/truetype/mulish/Mulish-Light.ttf',
    '/usr/share/fonts/truetype/lato/Lato-Light.ttf',
    '/usr/share/fonts/truetype/clear-sans/ClearSans-Light.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
])
BODY_BOLD_PATH = first_existing([
    BASE_DIR / 'fonts' / 'Mulish-Bold.ttf',
    BASE_DIR / 'Mulish-Bold.ttf',
    '/usr/share/fonts/truetype/mulish/Mulish-Bold.ttf',
    '/usr/share/fonts/truetype/lato/Lato-Bold.ttf',
    '/usr/share/fonts/truetype/clear-sans/ClearSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
])
SYMBOL_FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
SYMBOL_BOLD_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

pdfmetrics.registerFont(TTFont('EcoTitle', TITLE_FONT_PATH))
pdfmetrics.registerFont(TTFont('EcoBody', BODY_FONT_PATH))
pdfmetrics.registerFont(TTFont('EcoBodyBold', BODY_BOLD_PATH))
pdfmetrics.registerFont(TTFont('EcoSymbol', SYMBOL_FONT_PATH))
pdfmetrics.registerFont(TTFont('EcoSymbolBold', SYMBOL_BOLD_PATH))

# Default Ecojoiner variables
params = dict(
    slat_thickness=12.0,
    port_length=70.0,
    port_height=83.0,
    cap_diameter=32.0,
    collar_diameter=34.0,
    screw_diameter=6.0,
    fit_clearance=0.20,
    bottle_volume_l=1.5,
)

T = params['slat_thickness']
PL = params['port_length']
PH = params['port_height']
CAP = params['cap_diameter']
COL = params['collar_diameter']
SCREW = params['screw_diameter']
CLR = params['fit_clearance']

slot_width = T + CLR
john_height = PH - 2*T
john_length = 2*PL + PH + 4*T
long_end_span = PL
little_end_span = PL + T
standard_slot_depth = math.ceil(john_height / 2)
master_slot_depth = math.floor(PH / 2)
screw_side_offset = 18.0
screw_y_center = john_height / 2
saddler_width = PH
saddler_height = PL + 2*T
saddler_notch_width = john_height + CLR
saddler_notch_depth = 2*T + CLR

PAGE_W_MM = 279.4
PAGE_H_MM = 215.9
SCALE = 0.62

# Letter reference layout positions in millimetres
x0 = 15
# Rebalanced vertical positions after the intro moved to the header.
y_long = 136.0
y_little = 89.0
y_master = 42.0
sx = 203
sy = 103.0

BLACK = colors.HexColor('#111111')
MID = colors.HexColor('#555555')
LIGHT = colors.HexColor('#777777')
FAINT = colors.HexColor('#999999')
BOX = colors.HexColor('#8A8A8A')

# ---------- Geometry helpers ----------

def slat_path_points(L, H, slot_centers, depth):
    slots = sorted([(c - slot_width/2, c + slot_width/2) for c in slot_centers])
    x1a, x1b = slots[0]
    x2a, x2b = slots[1]
    return [
        (0,0), (L,0), (L,H),
        (x2b,H), (x2b,H-depth), (x2a,H-depth), (x2a,H),
        (x1b,H), (x1b,H-depth), (x1a,H-depth), (x1a,H),
        (0,H), (0,0)
    ]

def saddler_path_points():
    W,H = saddler_width, saddler_height
    nw, nd = saddler_notch_width, saddler_notch_depth
    lx = (W - nw)/2
    rx = lx + nw
    return [(0,0),(lx,0),(lx,nd),(rx,nd),(rx,0),(W,0),(W,H),(0,H),(0,0)]

def transform_points(points, x, y, s):
    return [(x + px*s, y + py*s) for px,py in points]

# ---------- PDF helpers ----------

def draw_path(c, points, x, y, s, stroke=BLACK, width=0.8):
    p = c.beginPath()
    pts = transform_points(points, x, y, s)
    p.moveTo(pts[0][0]*mm, pts[0][1]*mm)
    for px,py in pts[1:]:
        p.lineTo(px*mm, py*mm)
    c.setFillColor(colors.white)
    c.setStrokeColor(stroke)
    c.setLineWidth(width)
    c.drawPath(p, stroke=1, fill=0)

def text(c, s, x, y, size=8, font='EcoBody', align='left', color=BLACK):
    c.setFillColor(color)
    c.setFont(font, size)
    if align == 'center':
        c.drawCentredString(x*mm, y*mm, s)
    elif align == 'right':
        c.drawRightString(x*mm, y*mm, s)
    else:
        c.drawString(x*mm, y*mm, s)

def wrap_lines(s, w_mm, size=6, font='EcoBody'):
    words = s.split()
    lines = []
    line = ''
    for word in words:
        trial = word if not line else line + ' ' + word
        width_mm = pdfmetrics.stringWidth(trial, font, size) / mm
        if width_mm <= w_mm or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines

def wrapped_text(c, s, x, y, w, size=6, font='EcoBody', leading=3.6, color=BLACK, max_lines=None):
    lines = wrap_lines(s, w, size, font)
    if max_lines:
        lines = lines[:max_lines]
    yy = y
    for line in lines:
        text(c, line, x, yy, size=size, font=font, color=color)
        yy -= leading
    return yy, len(lines)

def draw_circle(c, cx, cy, d, x, y, s, stroke=BLACK, width=0.75, center_mark=True, label=None, label_size=7):
    c.setStrokeColor(stroke)
    c.setLineWidth(width)
    c.circle((x + cx*s)*mm, (y + cy*s)*mm, (d/2*s)*mm, stroke=1, fill=0)
    if center_mark:
        r = 1.1
        c.setLineWidth(0.22)
        c.setStrokeColor(FAINT)
        c.line((x+(cx-r)*s)*mm, (y+cy*s)*mm, (x+(cx+r)*s)*mm, (y+cy*s)*mm)
        c.line((x+cx*s)*mm, (y+(cy-r)*s)*mm, (x+cx*s)*mm, (y+(cy+r)*s)*mm)
    if label:
        text(c, label, x+cx*s, y+cy*s-1.2, size=label_size, font='EcoSymbolBold', align='center')

def draw_dim_h(c, x1, x2, y, label, tick=2.2, size=6, font='EcoBody'):
    c.setStrokeColor(MID)
    c.setLineWidth(0.35)
    c.line(x1*mm, y*mm, x2*mm, y*mm)
    c.line(x1*mm, (y-tick)*mm, x1*mm, (y+tick)*mm)
    c.line(x2*mm, (y-tick)*mm, x2*mm, (y+tick)*mm)
    text(c, label, (x1+x2)/2, y+1.6, size=size, font=font, align='center', color=BLACK)

def draw_dim_v(c, x, y1, y2, label, tick=2.2, size=6, font='EcoBody'):
    c.setStrokeColor(MID)
    c.setLineWidth(0.35)
    c.line(x*mm, y1*mm, x*mm, y2*mm)
    c.line((x-tick)*mm, y1*mm, (x+tick)*mm, y1*mm)
    c.line((x-tick)*mm, y2*mm, (x+tick)*mm, y2*mm)
    c.saveState()
    c.translate((x-2.5)*mm, ((y1+y2)/2)*mm)
    c.rotate(90)
    c.setFont(font, size)
    c.setFillColor(BLACK)
    c.drawCentredString(0, 0, label)
    c.restoreState()

def compute_note_height(title, lines, w, title_size=7, size=5.5, leading=3.6, padding_top=5.4, padding_bottom=4.0, gap_after_title=4.4):
    # Box height in mm from content. Each text line consumes approx leading mm.
    line_count = 0
    for item in lines:
        if isinstance(item, tuple):
            line_text, line_font = item
        else:
            line_text, line_font = item, 'EcoBody'
        line_count += max(1, len(wrap_lines(line_text, w-6, size, line_font)))
    return padding_top + gap_after_title + line_count * leading + padding_bottom

def draw_note_box(c, x, y, w, h, title, lines, title_size=7, size=5.8, leading=3.8):
    c.setStrokeColor(BOX)
    c.setLineWidth(0.45)
    c.roundRect(x*mm, y*mm, w*mm, h*mm, 2*mm, stroke=1, fill=0)
    text(c, title, x+3, y+h-5.4, size=title_size, font='EcoTitle')
    yy = y+h-10.2
    for item in lines:
        if isinstance(item, tuple):
            line_text, line_font = item
        else:
            line_text, line_font = item, 'EcoBody'
        yy, _ = wrapped_text(c, line_text, x+3, yy, w-6, size=size, font=line_font, leading=leading)
        yy -= 0.7

def draw_slot_dimensions(c, x, y, s, kind, depth):
    # One clear dimension pair on the left slot for each John.
    center = (long_end_span + T/2) if kind == 'long' else (little_end_span + T/2)
    xa = x + (center - slot_width/2)*s
    xb = x + (center + slot_width/2)*s
    ytop = y + john_height*s
    yfloor = y + (john_height - depth)*s
    # horizontal width dimension, just above the slot mouth
    dim_y = ytop + 2.3
    draw_dim_h(c, xa, xb, dim_y, f'slot width {slot_width:.1f}mm', tick=1.0, size=4.7)
    # vertical depth dimension, just left of slot
    dim_x = xa - 3.6
    draw_dim_v(c, dim_x, yfloor, ytop, f'slot depth {depth:.0f}mm', tick=1.0, size=4.6)

def draw_m6_labels(c, x, y, s):
    for hx_mm in [screw_side_offset, john_length - screw_side_offset]:
        hx = x + hx_mm*s
        hy = y + screw_y_center*s
        # Place label just beside the hole, not using arrows.
        if hx_mm < john_length/2:
            text(c, '⌀M6', hx + 5.0, hy - 1.8, size=6.4, font='EcoSymbolBold')
        else:
            text(c, '⌀M6', hx - 5.0, hy - 1.8, size=6.4, font='EcoSymbolBold', align='right')

def draw_part_pdf(c, name, qty, kind, x, y, s, hole_d=None, slots='standard', screws=False):
    depth = standard_slot_depth if slots == 'standard' else master_slot_depth
    if kind == 'long':
        centers = [long_end_span + T/2, john_length - long_end_span - T/2]
    else:
        centers = [little_end_span + T/2, john_length - little_end_span - T/2]
    pts = slat_path_points(john_length, john_height, centers, depth)
    draw_path(c, pts, x, y, s, width=0.75)
    if hole_d:
        draw_circle(c, john_length/2, john_height/2, hole_d, x, y, s, label=f'⌀{hole_d:.0f}', label_size=7)
    if screws:
        draw_circle(c, screw_side_offset, screw_y_center, SCREW, x, y, s, width=0.6, center_mark=False)
        draw_circle(c, john_length - screw_side_offset, screw_y_center, SCREW, x, y, s, width=0.6, center_mark=False)
        draw_m6_labels(c, x, y, s)
    text(c, f'{name} x {qty}', x+2, y+john_height*s-5, size=8.3, font='EcoTitle')
    draw_slot_dimensions(c, x, y, s, kind, depth)

# ---------- Generate PDF ----------

def make_pdf():
    c = canvas.Canvas(str(OUT_PDF), pagesize=landscape(letter))
    c.setTitle('Flatpack Ecojoiner v3.0 - Letter carpenter sheet')
    c.setAuthor('Russell Maier and Richard Graham')
    c.setSubject('Flatpack Ecojoiner v3.0 reference drawing, CERN-OHL-S-2.0')

    mission = (
        'The ecojoiner is shared freely with the world to help people everywhere design, build, and innovate with bottles and wood — '
        'creating furniture, structures, shelters, and anything else that helps make life on Earth greener for humans, creatures, '
        'and the ecosystems we share. Derivatives and future versions should carry the Ecojoiner name, credit ecobricks.org, '
        'and be shared reciprocally under the same CERN-OHL-S-2.0 license.'
    )

    # Header
    text(c, 'Flatpack Ecojoiner v3.0', 12, 204, size=18.0, font='EcoTitle')
    text(c, 'Scaled reference drawing: 62%; dimensions in mm. Do not trace as 1:1.', 268, 204, size=7.1, align='right')
    text(c, 'All pieces: 12mm plywood / wood thickness.', 268, 198.5, size=7.1, align='right')
    # Keep the vision paragraph aligned to the Long John below it.
    wrapped_text(c, mission, x0, 193.0, john_length*SCALE, size=5.7, font='EcoBody', leading=3.35, color=MID)

    # Parts
    draw_part_pdf(c, 'Long John', 6, 'long', x0, y_long, SCALE, hole_d=CAP, slots='standard', screws=False)
    draw_part_pdf(c, 'Little John', 5, 'little', x0, y_little, SCALE, hole_d=COL, slots='standard', screws=True)
    draw_part_pdf(c, 'Master John', 1, 'little', x0, y_master, SCALE, hole_d=COL, slots='master', screws=True)

    # Main dimensions for Johns
    part_w = john_length*SCALE
    part_h = john_height*SCALE
    draw_dim_h(c, x0, x0+part_w, y_long+part_h+5.5, f'{john_length:.0f}mm overall John length')
    draw_dim_v(c, x0-5.2, y_long, y_long+part_h, f'{john_height:.0f}mm')

    # Saddler
    draw_path(c, saddler_path_points(), sx, sy, SCALE, width=0.75)
    text(c, 'Saddler x 12', sx+2, sy+saddler_height*SCALE-5, size=8.3, font='EcoTitle')
    notch_cx = sx + saddler_width*SCALE/2
    notch_ty = sy + 9
    text(c, f'notch {saddler_notch_width:.1f} x {saddler_notch_depth:.1f}mm', notch_cx, notch_ty, size=5.1, align='center')
    draw_dim_v(c, notch_cx - saddler_notch_width*SCALE/2 - 2.2, sy, sy+saddler_notch_depth*SCALE, f'{saddler_notch_depth:.1f}mm', tick=0.8, size=4.2)
    draw_dim_h(c, sx, sx+saddler_width*SCALE, sy+saddler_height*SCALE+5.5, f'{saddler_width:.0f}mm')
    draw_dim_v(c, sx-5, sy, sy+saddler_height*SCALE, f'{saddler_height:.0f}mm')

    # Input variables box (carpenter/form check)
    draw_note_box(c, 193, 52, 75, 44, 'Default input variables', [
        f'slat thickness: {T:.0f}mm',
        f'port length: {PL:.0f}mm',
        f'port height: {PH:.0f}mm',
        f'cap hole: ⌀{CAP:.0f}mm',
        f'collar hole: ⌀{COL:.0f}mm',
        f'screw holes: ⌀M6 / ⌀{SCREW:.0f}mm',
        f'fit clearance: {CLR:.2f}mm',
    ], title_size=7.0, size=5.5, leading=3.55)

    # Derived formulas in footer area
    text(c, 'Derived dimensions:', 12, 35.0, size=7.5, font='EcoTitle')
    formula_lines = [
        f'john height = port height - 2 x slat thickness = {PH:.0f} - 24 = {john_height:.0f}mm',
        f'john length = 2 x port length + port height + 4 x slat thickness = {john_length:.0f}mm',
        f'slot width = slat thickness + fit clearance = {slot_width:.1f}mm',
        f'saddler = {saddler_width:.0f}mm wide x {saddler_height:.0f}mm high; bottom notch {saddler_notch_width:.1f}mm x {saddler_notch_depth:.1f}mm',
    ]
    yy = 29.8
    for line in formula_lines:
        text(c, line, 12, yy, size=6.0)
        yy -= 4.2

    # Credits / license box. Height is computed from content instead of fixed.
    license_line = (
        'This autogenerated ecojoiner design is developed and shared under the CERN Open Hardware Licence, '
        'Strongly Reciprocal license (CERN-OHL-S-2.0).'
    )
    credit_lines = [
        'Invention by Russell Maier',
        'Engineering by Richard Graham',
        (license_line, 'EcoBodyBold'),
        'See ecobricks.org/ecojoiner',
    ]
    box_w = 156
    box_h = compute_note_height('Version 3.0 of the Ecojoiner', credit_lines, box_w, title_size=7.0, size=5.2, leading=3.25)
    draw_note_box(c, 112, 8.0, box_w, box_h, 'Version 3.0 of the Ecojoiner', credit_lines, title_size=7.0, size=5.2, leading=3.25)

    text(c, 'Generated from parametric Ecojoiner variables.', 268, 4.8, size=5.5, align='right', color=LIGHT)
    c.showPage()
    c.save()

if __name__ == '__main__':
    make_pdf()
    print('wrote', OUT_PDF)
    print('title font path:', TITLE_FONT_PATH)
    print('body font path:', BODY_FONT_PATH)
