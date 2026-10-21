"""Flat-illustration drawing kit: painter, characters, props and backgrounds for episode 1."""
import math
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
SS = 2            # supersampling for anti-aliased edges
CW, CH = 1242, 2208  # shot canvas (output 1080x1920 plus room for camera moves)


def font(px):
    return ImageFont.truetype(FONT, int(px))


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c[:3])


def mix(a, b, f):
    return tuple(int(x + (y - x) * f) for x, y in zip(a[:3], b[:3]))


def ell_pts(cx, cy, rx, ry, a0, a1, n=28):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


class P:
    """Draws in unit coordinates: canvas point = origin + (x, y) * u."""

    def __init__(self, img, ox, oy, u):
        self.img, self.d = img, ImageDraw.Draw(img)
        self.ox, self.oy, self.u = ox, oy, u

    def xy(self, x, y):
        return (self.ox + x * self.u, self.oy + y * self.u)

    def W(self, w):
        return max(1, int(round(w * self.u)))

    def poly(self, pts, fill, ol=None, w=0.018):
        self.d.polygon([self.xy(*q) for q in pts], fill=fill, outline=ol, width=self.W(w) if ol else 1)

    def ell(self, cx, cy, rx, ry, fill, ol=None, w=0.018):
        x0, y0 = self.xy(cx - rx, cy - ry)
        x1, y1 = self.xy(cx + rx, cy + ry)
        self.d.ellipse([x0, y0, x1, y1], fill=fill, outline=ol, width=self.W(w) if ol else 1)

    def line(self, pts, fill, w, caps=True):
        q = [self.xy(*p) for p in pts]
        self.d.line(q, fill=fill, width=self.W(w), joint="curve")
        if caps:
            r = self.W(w) / 2
            for x, y in q:
                self.d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    def rect(self, x0, y0, x1, y1, fill, ol=None, w=0.018, r=0):
        a, b = self.xy(min(x0, x1), min(y0, y1)), self.xy(max(x0, x1), max(y0, y1))
        if r:
            self.d.rounded_rectangle([a, b], radius=r * self.u, fill=fill, outline=ol, width=self.W(w) if ol else 1)
        else:
            self.d.rectangle([a, b], fill=fill, outline=ol, width=self.W(w) if ol else 1)

    def text(self, x, y, s, px, fill, anchor="mm", stroke=0, stroke_fill=None):
        self.d.text(self.xy(x, y), s, font=font(px * self.u), fill=fill, anchor=anchor,
                    stroke_width=int(stroke * self.u), stroke_fill=stroke_fill)


def canvas_painter(w=CW, h=CH, color=(0, 0, 0), mode="RGB"):
    img = Image.new(mode, (w * SS, h * SS), color if mode == "RGB" else (0, 0, 0, 0))
    return img, P(img, 0, 0, SS)


def finish(img):
    return img.resize((img.width // SS, img.height // SS), Image.LANCZOS)


# ------------------------------------------------------------------ characters

INK = (45, 34, 38)
LIP = (196, 96, 96)
MOUTH = (125, 42, 48)

ARMS = {  # elbow, hand (x>0 is screen right); shoulders at (+-0.8, 1.38)
    "down":    {"L": [(-0.95, 2.25), (-0.98, 3.0)], "R": [(0.95, 2.25), (0.98, 3.0)]},
    "raise_r": {"L": [(-0.98, 2.25), (-0.6, 2.5)], "R": [(1.28, 0.95), (1.36, 0.15)]},
    "reach_l": {"L": [(-1.35, 1.75), (-1.95, 1.55)], "R": [(0.5, 2.15), (-0.4, 1.95)]},
    "point_l": {"L": [(-1.35, 1.55), (-1.95, 1.35)], "R": [(0.98, 2.25), (1.02, 2.95)]},
    "hold":    {"L": [(-0.95, 2.3), (-0.3, 2.2)], "R": [(0.95, 2.3), (0.3, 2.2)]},
    "offer_r": {"L": [(-0.95, 2.25), (-0.98, 3.0)], "R": [(1.35, 1.95), (1.95, 1.85)]},
    "take_l":  {"L": [(-1.35, 1.95), (-1.95, 1.85)], "R": [(0.95, 2.25), (0.98, 3.0)]},
    "glasses": {"L": [(-0.98, 2.25), (-1.0, 3.0)], "R": [(1.0, 2.2), (0.2, 0.62)]},
    "pipe":    {"L": [(-0.95, 2.25), (-0.98, 3.0)], "R": [(1.0, 2.2), (0.28, 0.88)]},
    "help_r":  {"L": [(-0.95, 2.25), (-0.98, 3.0)], "R": [(1.3, 2.0), (1.75, 2.35)]},
    "pocket":  {"L": [(-0.95, 2.25), (-0.98, 3.0)], "R": [(0.95, 2.35), (0.42, 1.95)]},
    "wave_r":  {"L": [(-1.0, 2.2), (-0.8, 2.9)], "R": [(1.3, 1.0), (1.45, 0.2)]},
}

EXPR = {  # eyes, brows, mouth
    "neutral": ("normal", "normal", "small"),
    "cold": ("narrow", "angry", "flat"),
    "shock": ("wide", "raised", "o"),
    "smug": ("half", "one_up", "smirk"),
    "greedy": ("wide", "raised", "grin"),
    "stern": ("narrow", "angry", "down"),
    "crying": ("squeeze", "worried", "wobble"),
    "smile": ("happy", "normal", "smile_open"),
    "shout": ("normal", "raised", "o"),
    "frozen": ("blank", "raised", "o"),
    "smirk_cold": ("narrow", "angry", "smirk"),
    "calm": ("normal", "normal", "flat"),
}


def head_pts():
    pts = []
    for i in range(56):
        t = 2 * math.pi * i / 56
        s, c = math.sin(t), math.cos(t)
        if s > 0:
            pts.append((0.40 * c * (1 - 0.2 * s * s), 0.47 + 0.52 * s))
        else:
            pts.append((0.41 * c, 0.47 + 0.47 * s))
    return pts


HEAD = head_pts()

HAIRLINES = {
    "braid1": [(0.41, 0.52), (0.36, 0.36), (0.22, 0.24), (0.06, 0.2), (-0.02, 0.25), (-0.18, 0.28), (-0.34, 0.37), (-0.41, 0.52)],
    "braids2": [(0.41, 0.52), (0.38, 0.38), (0.3, 0.37), (0.2, 0.395), (0.1, 0.37), (0.0, 0.395), (-0.1, 0.37),
                (-0.2, 0.395), (-0.3, 0.37), (-0.38, 0.38), (-0.41, 0.52)],
    "bob": [(0.45, 0.66), (0.38, 0.4), (0.2, 0.26), (0.02, 0.22), (-0.12, 0.28), (-0.3, 0.36), (-0.45, 0.66)],
    "bun": [(0.41, 0.48), (0.32, 0.3), (0.15, 0.22), (0.0, 0.2), (-0.15, 0.22), (-0.32, 0.3), (-0.41, 0.48)],
    "perm": [(0.44, 0.6), (0.36, 0.34), (0.15, 0.26), (0.0, 0.3), (-0.15, 0.26), (-0.36, 0.34), (-0.44, 0.6)],
    "short_m": [(0.41, 0.44), (0.34, 0.27), (0.1, 0.21), (-0.1, 0.21), (-0.34, 0.27), (-0.41, 0.44)],
}


def in_poly(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def draw_item(p, kind, x, y):
    if kind == "envelope":
        p.rect(x - 0.3, y - 0.2, x + 0.3, y + 0.2, (180, 58, 44), ol=(120, 35, 28), w=0.02, r=0.02)
        p.rect(x - 0.2, y - 0.07, x + 0.2, y + 0.07, (240, 228, 205))
    elif kind == "hukou":
        y -= 0.28
        p.rect(x - 0.22, y - 0.32, x + 0.22, y + 0.32, (135, 40, 32), ol=(90, 25, 20), w=0.02, r=0.03)
        p.rect(x - 0.12, y - 0.2, x + 0.12, y - 0.12, (230, 190, 90))
        p.rect(x - 0.15, y + 0.05, x + 0.15, y + 0.08, (200, 160, 80))
    elif kind == "seal":
        y += 0.2
        p.rect(x - 0.07, y - 0.22, x + 0.07, y + 0.12, (160, 110, 65), ol=(110, 70, 40), w=0.015, r=0.03)
        p.rect(x - 0.08, y + 0.1, x + 0.08, y + 0.17, (200, 40, 40), r=0.02)
    elif kind == "cane":
        p.line([(x, y - 0.25), (x + 0.06, 6.35)], (120, 78, 42), 0.09)
        p.ell(x - 0.02, y - 0.27, 0.11, 0.08, (130, 85, 46))
    elif kind == "briefcase":
        p.rect(x - 0.4, y + 0.08, x + 0.4, y + 0.62, (30, 30, 34), ol=(10, 10, 12), w=0.02, r=0.05)
        p.line([(x - 0.15, y + 0.08), (x - 0.12, y - 0.05), (x + 0.12, y - 0.05), (x + 0.15, y + 0.08)], (20, 20, 22), 0.04)
        p.rect(x - 0.06, y + 0.2, x + 0.06, y + 0.27, (200, 180, 100))
    elif kind == "pipe":
        p.line([(x - 0.08, y - 0.02), (x + 0.45, y + 0.25)], (90, 60, 35), 0.04)
        p.rect(x + 0.4, y + 0.14, x + 0.55, y + 0.34, (80, 50, 30), r=0.03)


def render_person(sp, hpx, mouth_open=False, crop="full", sway=0.0):
    """Return (RGBA sprite, (anchor_x, anchor_y) = head-top centre, points dict) at head height hpx."""
    u = hpx * SS
    pose = ARMS[sp.get("pose", "down")]
    max_x = max(abs(q[0]) for side in pose.values() for q in side) + 0.45
    half_w = max(max_x, 1.25)
    top = 1.35
    h_units = {"full": top + 6.6, "long": top + 4.8, "half": top + 3.5, "bust": top + 2.45}[crop]
    Wp, Hp = int(2 * half_w * u), int(h_units * u)
    img = Image.new("RGBA", (Wp, Hp), (0, 0, 0, 0))
    p = P(img, Wp / 2, top * u, u)
    pts = {}

    skin = sp["skin"]
    skin_d = shade(skin, 0.86)
    hair = sp.get("hair_col", (38, 32, 36))
    top_c = sp["top"]
    bottom_c = sp.get("bottom", (40, 50, 80))
    female = sp.get("female", True)
    fx = 0.92 if female else 1.0
    style = sp["hair"]

    # back hair
    if style in ("braid1", "braids2", "worker_cap"):
        p.ell(0, 0.47, 0.435, 0.52, hair)
    elif style == "bob":
        p.rect(-0.49, 0.25, 0.49, 0.95, hair, r=0.18)
        p.ell(0, 0.45, 0.5, 0.5, hair)
    elif style == "bun":
        p.ell(0, -0.03, 0.19, 0.16, hair, ol=shade(hair, 0.8), w=0.015)
        p.ell(0, 0.47, 0.435, 0.52, hair)
    elif style == "perm":
        p.ell(0, 0.5, 0.48, 0.5, hair)
        for a in range(140, 400, 20):
            p.ell(0.47 * math.cos(math.radians(a)), 0.5 + 0.5 * math.sin(math.radians(a)), 0.13, 0.13, hair)

    # legs
    if crop in ("full", "long"):
        shoe = sp.get("shoe", (35, 30, 30))
        if sp.get("outfit") == "dress":
            for s in (-1, 1):
                p.rect(s * 0.14, 4.3, s * 0.4, 6.3, skin, ol=skin_d, w=0.012)
                p.ell(s * 0.3, 6.36, 0.22, 0.11, (180, 50, 60))
        else:
            for s in (-1, 1):
                p.rect(s * 0.05, 3.0, s * 0.52, 6.3, bottom_c, ol=shade(bottom_c, 0.7), w=0.015)
                p.ell(s * 0.3, 6.38, 0.28, 0.12, shoe)

    # neck
    p.rect(-0.13, 0.82, 0.13, 1.3, skin_d)

    # torso
    torso = [(-0.30, 1.12), (0.30, 1.12), (0.78 * fx, 1.28), (0.9 * fx, 1.55), (0.74 * fx, 3.1),
             (-0.74 * fx, 3.1), (-0.9 * fx, 1.55), (-0.78 * fx, 1.28)]
    outfit = sp.get("outfit", "shirt")
    if outfit == "dress":
        torso = [(-0.30, 1.12), (0.30, 1.12), (0.74, 1.28), (0.84, 1.55), (0.64, 2.7), (1.0, 4.45),
                 (-1.0, 4.45), (-0.64, 2.7), (-0.84, 1.55), (-0.74, 1.28)]
    p.poly(torso, top_c, ol=shade(top_c, 0.72), w=0.018)
    p.poly([(0.55 * fx, 1.5), (0.88 * fx, 1.56), (0.72 * fx, 3.08), (0.5 * fx, 3.08)], shade(top_c, 0.93))
    if outfit == "floral":
        rnd = random.Random(7)
        for gy in range(13):
            for gx in range(-5, 6):
                x, y = gx * 0.17 + (0.085 if gy % 2 else 0), 1.3 + gy * 0.14
                if in_poly(x, y, torso):
                    c = (80, 120, 200) if rnd.random() > 0.3 else (120, 160, 220)
                    for a in range(0, 360, 90):
                        p.ell(x + 0.022 * math.cos(math.radians(a)), y + 0.022 * math.sin(math.radians(a)), 0.016, 0.016, c)
        for s in (-1, 1):
            p.poly([(s * 0.3, 1.1), (0, 1.38), (s * 0.34, 1.36)], (250, 250, 246), ol=(170, 170, 175), w=0.012)
        p.line([(0, 1.38), (0, 3.05)], (190, 190, 195), 0.012, caps=False)
        for y in (1.65, 2.05, 2.45, 2.85):
            p.ell(0, y, 0.025, 0.025, (200, 200, 205))
    elif outfit == "dress":
        for s in (-1, 1):
            p.ell(s * 0.15, 1.2, 0.17, 0.09, (250, 248, 245), ol=(220, 200, 205), w=0.01)
        p.rect(-0.62, 2.62, 0.62, 2.74, shade(top_c, 0.85))
    elif outfit == "side":
        p.rect(-0.27, 1.05, 0.27, 1.17, shade(top_c, 0.85), r=0.03)
        p.line([(0.0, 1.17), (0.2, 1.45), (0.62 * fx, 1.62), (0.66 * fx, 3.05)], shade(top_c, 0.65), 0.018, caps=False)
        for q in ((0.2, 1.46), (0.45, 1.56), (0.66 * fx, 2.1), (0.66 * fx, 2.6)):
            p.ell(q[0], q[1], 0.03, 0.03, shade(top_c, 0.55))
    elif outfit in ("zhongshan", "uniform"):
        for s in (-1, 1):
            p.poly([(s * 0.3, 1.08), (s * 0.04, 1.4), (s * 0.4, 1.36)], shade(top_c, 0.85), ol=shade(top_c, 0.6), w=0.012)
            p.rect(s * 0.28, 1.6, s * 0.58, 1.86, shade(top_c, 0.94), ol=shade(top_c, 0.65), w=0.012)
            p.rect(s * 0.25, 2.45, s * 0.6, 2.85, shade(top_c, 0.94), ol=shade(top_c, 0.65), w=0.012)
        for y in (1.55, 1.9, 2.25, 2.6, 2.95):
            p.ell(0, y, 0.03, 0.03, (190, 180, 150) if outfit == "uniform" else shade(top_c, 0.55))
        if outfit == "uniform":
            p.ell(-0.43, 1.5, 0.05, 0.05, (210, 50, 45))
    elif outfit == "suit":
        p.poly([(-0.22, 1.12), (0.22, 1.12), (0, 1.8)], (250, 250, 250))
        for s in (-1, 1):
            p.poly([(s * 0.3, 1.12), (s * 0.02, 1.85), (s * 0.18, 1.6), (s * 0.42, 1.3)], shade(top_c, 0.86),
                   ol=shade(top_c, 0.7), w=0.012)
        p.ell(0, 2.3, 0.035, 0.035, shade(top_c, 0.6))
        for a in range(0, 360, 60):
            p.ell(-0.48 + 0.07 * math.cos(math.radians(a)), 1.62 + 0.07 * math.sin(math.radians(a)), 0.06, 0.06, (220, 40, 50))
        p.ell(-0.48, 1.62, 0.04, 0.04, (250, 210, 80))
    elif outfit == "work":
        p.line([(0, 1.15), (0, 3.05)], shade(top_c, 0.6), 0.02, caps=False)
        for s in (-1, 1):
            p.poly([(s * 0.3, 1.08), (s * 0.05, 1.32), (s * 0.38, 1.32)], shade(top_c, 0.85))

    if sp.get("pocket_env"):
        p.rect(0.22, 1.52, 0.56, 1.66, (185, 60, 45))
        p.rect(0.2, 1.62, 0.6, 1.95, top_c, ol=shade(top_c, 0.7), w=0.012)

    # arms
    sleeve = sp.get("sleeve", "long")
    hand_pos = {}
    for side, (elbow, hand) in pose.items():
        sx = -1 if side == "L" else 1
        sh = (sx * 0.8 * fx, 1.38)
        upper_c = top_c
        fore_c = top_c if sleeve == "long" else skin
        if sleeve == "short":
            mid = (sh[0] + (elbow[0] - sh[0]) * 0.55, sh[1] + (elbow[1] - sh[1]) * 0.55)
            p.line([sh, mid], top_c, 0.32)
            p.line([mid, elbow], skin, 0.22)
        else:
            p.line([sh, elbow], upper_c, 0.3)
        p.line([elbow, hand], fore_c, 0.24 if fore_c != skin else 0.2)
        if sleeve != "long":
            p.line([elbow, hand], skin, 0.2)
        hand_pos[side] = hand
        if sp.get("watch") and side == "L":
            wx, wy = elbow[0] + (hand[0] - elbow[0]) * 0.82, elbow[1] + (hand[1] - elbow[1]) * 0.82
            p.ell(wx, wy, 0.1, 0.09, (230, 190, 70), ol=(160, 120, 40), w=0.015)
            p.ell(wx, wy, 0.055, 0.05, (250, 250, 240))
            pts["watch"] = p.xy(wx, wy)
    for side, kind in sp.get("items", {}).items():
        if side in hand_pos:
            draw_item(p, kind, *hand_pos[side])
    for side, hand in hand_pos.items():
        p.ell(hand[0], hand[1], 0.12, 0.12, skin, ol=skin_d, w=0.012)

    # front braids (behind the head, over the chest)
    if style == "braid1":
        seq = [(0.33, 0.9), (0.4, 1.2), (0.43, 1.5), (0.42, 1.8), (0.39, 2.1), (0.37, 2.38)]
        for i, (x, y) in enumerate(seq):
            x += sway * (y - 0.9) * 0.25
            p.ell(x, y, 0.11, 0.16, hair, ol=shade(hair, 0.6), w=0.012)
        x, y = seq[-1]
        x += sway * (y - 0.9) * 0.25
        p.ell(x, y + 0.15, 0.07, 0.05, (180, 40, 40))
        p.poly([(x - 0.07, y + 0.18), (x + 0.07, y + 0.18), (x + 0.03, y + 0.4), (x - 0.04, y + 0.38)], hair)
    elif style == "braids2":
        for s in (-1, 1):
            seq = [(s * 0.38, 0.85), (s * 0.46, 1.15), (s * 0.5, 1.45), (s * 0.51, 1.75)]
            for x, y in seq:
                p.ell(x, y, 0.1, 0.15, hair, ol=shade(hair, 0.6), w=0.012)
            p.ell(s * 0.51, 1.9, 0.08, 0.06, (220, 40, 50))
            p.poly([(s * 0.45, 1.93), (s * 0.57, 1.93), (s * 0.54, 2.15), (s * 0.47, 2.13)], hair)

    # head
    for s in (-1, 1):
        p.ell(s * 0.4, 0.58, 0.065, 0.1, skin_d)
    p.poly(HEAD, skin, ol=shade(skin, 0.78), w=0.015)
    pts["face"] = p.xy(0, 0.55)
    draw_face(p, sp, mouth_open)

    # front hair / caps
    if style in HAIRLINES:
        cap = ell_pts(0, 0.47, 0.43, 0.505, 180, 360) + HAIRLINES[style]
        p.poly(cap, hair)
        p.line(ell_pts(0, 0.47, 0.33, 0.4, 205, 250, 8), shade(hair, 1.6) if hair[0] < 120 else shade(hair, 1.08), 0.03)
    if style == "perm":
        for x in (-0.28, -0.1, 0.1, 0.28):
            p.ell(x, 0.2, 0.12, 0.11, hair)
    if style == "bob":
        p.rect(0.22, 0.3, 0.36, 0.36, (20, 20, 20), r=0.02)
    if style == "cap_post":
        p.rect(0.37, 0.32, 0.42, 0.55, (35, 30, 30))
        p.rect(-0.42, 0.32, -0.37, 0.55, (35, 30, 30))
        p.poly(ell_pts(0, 0.31, 0.46, 0.33, 180, 360), (45, 100, 62))
        p.rect(-0.46, 0.24, 0.46, 0.36, (38, 85, 52))
        p.ell(0, 0.37, 0.5, 0.06, (30, 70, 42))
        p.ell(0, 0.18, 0.06, 0.06, (220, 50, 45))
    if style == "worker_cap":
        p.poly(ell_pts(0, 0.33, 0.45, 0.34, 180, 360), (238, 238, 232), ol=(190, 190, 185), w=0.012)
        p.rect(-0.45, 0.26, 0.45, 0.38, (225, 225, 218))
        for s in (-1, 1):
            p.line([(s * 0.38, 0.4), (s * 0.4, 0.62)], (170, 170, 170), 0.03)
    if sp.get("glasses"):
        for s in (-1, 1):
            p.rect(s * 0.06, 0.5, s * 0.27, 0.66, None, ol=(20, 20, 20), w=0.025, r=0.03)
        p.line([(-0.06, 0.56), (0.06, 0.56)], (20, 20, 20), 0.02)
    if sp.get("feathers"):
        rnd = random.Random(3)
        for _ in range(9):
            x, y = rnd.uniform(-0.6, 0.6), rnd.uniform(0.0, 2.6)
            p.ell(x, y, 0.09, 0.035, (250, 250, 250), ol=(200, 200, 200), w=0.008)

    out = finish(img)
    anchor = (out.width / 2, top * hpx)
    pts = {k: (v[0] / SS, v[1] / SS) for k, v in pts.items()}
    return out, anchor, pts


def draw_face(p, sp, mouth_open):
    skin = sp["skin"]
    eyes, brows, mouth = EXPR[sp.get("expr", "neutral")]
    female = sp.get("female", True)
    ey = 0.585
    for sx in (-1, 1):
        ex = sx * 0.155
        if eyes == "normal":
            p.ell(ex, ey, 0.048, 0.062, INK)
            p.ell(ex + 0.016, ey - 0.022, 0.016, 0.016, (255, 255, 255))
            if female:
                p.line([(ex - 0.065, ey - 0.03), (ex, ey - 0.06), (ex + 0.065, ey - 0.035)], INK, 0.02)
        elif eyes == "narrow":
            p.ell(ex, ey, 0.054, 0.034, INK)
            p.ell(ex + 0.016, ey - 0.012, 0.012, 0.012, (255, 255, 255))
            p.line([(ex + sx * 0.075, ey - 0.045), (ex - sx * 0.065, ey - 0.025)], INK, 0.026)
        elif eyes in ("wide", "blank"):
            p.ell(ex, ey, 0.072, 0.082, (255, 255, 255), ol=INK, w=0.016)
            if eyes == "wide":
                p.ell(ex, ey + 0.005, 0.034, 0.042, INK)
                p.ell(ex + 0.012, ey - 0.012, 0.012, 0.012, (255, 255, 255))
            else:
                p.ell(ex, ey, 0.01, 0.01, INK)
        elif eyes == "happy":
            p.line([(ex - 0.06, ey + 0.012), (ex, ey - 0.035), (ex + 0.06, ey + 0.012)], INK, 0.026)
        elif eyes == "half":
            p.ell(ex, ey + 0.008, 0.05, 0.045, INK)
            p.rect(ex - 0.075, ey - 0.08, ex + 0.075, ey - 0.004, skin)
            p.line([(ex - 0.068, ey - 0.004), (ex + 0.068, ey - 0.004)], INK, 0.024)
        elif eyes == "squeeze":
            p.line([(ex - 0.06, ey - 0.012), (ex, ey + 0.02), (ex + 0.06, ey - 0.012)], INK, 0.026)
            p.line([(ex + sx * 0.03, ey + 0.04), (ex + sx * 0.045, ey + 0.2)], (130, 185, 240), 0.03)
            p.ell(ex + sx * 0.05, ey + 0.24, 0.025, 0.035, (130, 185, 240))
        # brows
        by = 0.44
        if brows == "normal":
            b = [(ex - 0.07, by + 0.015), (ex, by - 0.005), (ex + 0.07, by + 0.01)]
        elif brows == "angry":
            b = [(ex + sx * 0.08, by - 0.012), (ex - sx * 0.07, by + 0.035)]
        elif brows == "raised":
            b = [(ex - 0.07, by - 0.04), (ex, by - 0.07), (ex + 0.07, by - 0.045)]
        elif brows == "worried":
            b = [(ex + sx * 0.08, by + 0.035), (ex - sx * 0.07, by - 0.02)]
        else:  # one_up
            b = ([(ex - 0.07, by - 0.03), (ex, by - 0.06), (ex + 0.07, by - 0.035)] if sx > 0
                 else [(ex - 0.07, by + 0.015), (ex, by), (ex + 0.07, by + 0.015)])
        p.line(b, shade(sp.get("hair_col", INK), 0.9) if sp.get("hair_col", INK)[0] < 150 else (150, 140, 135), 0.03)
    # nose
    p.line([(-0.012, 0.69), (0.005, 0.715), (0.022, 0.705)], shade(skin, 0.75), 0.016)
    if female and sp.get("age", "young") == "young":
        for sx in (-1, 1):
            p.ell(sx * 0.235, 0.705, 0.07, 0.038, mix(skin, (250, 140, 140), 0.38))
    if sp.get("age") == "old":
        for y in (0.24, 0.3):
            p.line([(-0.14, y), (0, y - 0.012), (0.14, y)], shade(skin, 0.8), 0.012)
        for sx in (-1, 1):
            p.line([(sx * 0.1, 0.72), (sx * 0.15, 0.86)], shade(skin, 0.8), 0.014)
            p.line([(sx * 0.25, 0.56), (sx * 0.31, 0.6)], shade(skin, 0.8), 0.01)
    if sp.get("sweat"):
        p.ell(0.36, 0.32, 0.035, 0.05, (150, 200, 245))
        p.ell(-0.33, 0.42, 0.028, 0.04, (150, 200, 245))
    # mouth
    my = 0.8
    if mouth_open and mouth in ("small", "flat", "smirk", "down", "wobble"):
        dx = 0.02 if mouth == "smirk" else 0
        p.ell(dx, my + 0.01, 0.045, 0.04, MOUTH)
        return
    if mouth == "small":
        p.line([(-0.05, my - 0.005), (0, my + 0.01), (0.05, my - 0.005)], LIP, 0.02)
    elif mouth == "flat":
        p.line([(-0.06, my), (0.06, my)], shade(LIP, 0.85), 0.022)
    elif mouth == "o":
        k = 1.25 if mouth_open else 1.0
        p.ell(0, my + 0.01, 0.05 * k, 0.065 * k, MOUTH)
    elif mouth == "smirk":
        p.line([(-0.06, my + 0.01), (0.0, my + 0.006), (0.06, my - 0.018), (0.08, my - 0.034)], shade(LIP, 0.9), 0.022)
    elif mouth in ("grin", "smile_open"):
        w = 0.11 if mouth == "grin" else 0.08
        h = (0.1 if mouth == "grin" else 0.07) * (1.25 if mouth_open else 1.0)
        p.poly([(-w, my - 0.02), (w, my - 0.02)] + ell_pts(0, my - 0.02, w, h, 0, 180, 12), MOUTH)
        p.rect(-w * 0.8, my - 0.02, w * 0.8, my + 0.01, (255, 255, 255))
    elif mouth == "down":
        p.line([(-0.06, my + 0.02), (0, my - 0.005), (0.06, my + 0.02)], shade(LIP, 0.85), 0.022)
    elif mouth == "wobble":
        p.line([(-0.06, my + 0.01), (-0.03, my - 0.005), (0, my + 0.01), (0.03, my - 0.005), (0.06, my + 0.01)],
               shade(LIP, 0.9), 0.02)


# cast ---------------------------------------------------------------------------
SKIN_Y = (250, 220, 196)
CAST = {
    "wanqiu": dict(skin=SKIN_Y, hair="braid1", top=(246, 246, 240), outfit="floral", sleeve="short",
                   bottom=(40, 52, 88), female=True),
    "meijuan": dict(skin=(252, 224, 202), hair="braids2", top=(244, 160, 180), outfit="dress", sleeve="short",
                    female=True),
    "ershen": dict(skin=(236, 198, 165), hair="bob", top=(128, 132, 138), outfit="side", sleeve="rolled",
                   bottom=(38, 38, 42), female=True, age="mid"),
    "nainai": dict(skin=(228, 194, 164), hair="bun", hair_col=(222, 222, 216), top=(186, 186, 180), outfit="side",
                   bottom=(36, 36, 40), female=True, age="old"),
    "postman": dict(skin=(234, 194, 158), hair="cap_post", top=(46, 98, 64), outfit="uniform",
                    bottom=(40, 80, 54), female=False),
    "zhishu": dict(skin=(206, 162, 124), hair="short_m", hair_col=(110, 108, 104), top=(118, 118, 112),
                   outfit="zhongshan", bottom=(90, 90, 86), female=False, age="old"),
    "ganbu": dict(skin=(240, 206, 178), hair="short_m", top=(38, 54, 92), outfit="zhongshan",
                  bottom=(34, 46, 80), female=False, glasses=True, watch=True),
    "wanqiu48": dict(skin=(226, 190, 160), hair="worker_cap", hair_col=(70, 66, 66), top=(48, 72, 112),
                     outfit="work", bottom=(40, 60, 95), female=True, age="old"),
    "meijuan45": dict(skin=(246, 214, 190), hair="perm", hair_col=(62, 42, 36), top=(218, 196, 160),
                      outfit="suit", bottom=(200, 180, 150), female=True, age="mid"),
}


def person(key, hpx, mouth_open=False, crop="full", sway=0.0, **over):
    sp = dict(CAST[key])
    sp.update(over)
    return render_person(sp, hpx, mouth_open, crop, sway)


# ------------------------------------------------------------------ backgrounds

def vgrad(p, x0, y0, x1, y1, c0, c1, steps=60):
    for i in range(steps):
        ya = y0 + (y1 - y0) * i / steps
        yb = y0 + (y1 - y0) * (i + 1) / steps + 1
        p.rect(x0, ya, x1, yb, mix(c0, c1, i / (steps - 1)))


def specks(p, x0, y0, x1, y1, n, cols, rmin=2, rmax=6, seed=1):
    rnd = random.Random(seed)
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        r = rnd.uniform(rmin, rmax)
        p.ell(x, y, r * 1.6, r * 0.7, rnd.choice(cols))


def trees(p, y, seed=2, w=CW):
    rnd = random.Random(seed)
    x = -60
    while x < w + 60:
        r = rnd.uniform(70, 130)
        p.ell(x, y, r, r * 0.8, rnd.choice([(96, 146, 86), (112, 160, 92), (84, 132, 80)]))
        x += r * 0.9


def brick_wall(p, x0, y0, x1, y1, base=(198, 156, 106)):
    p.rect(x0, y0, x1, y1, base)
    rnd = random.Random(int(x0 + y0))
    row = 0
    y = y0 + 20
    while y < y1:
        p.line([(x0, y), (x1, y)], shade(base, 0.88), 2.2, caps=False)
        off = 0 if row % 2 else 55
        x = x0 + off
        while x < x1:
            p.line([(x, y - 46), (x, y)], shade(base, 0.9), 2, caps=False)
            x += 110
        y += 46
        row += 1
    specks(p, x0, y0, x1, y1, int((x1 - x0) * (y1 - y0) / 4000), [shade(base, 0.92), shade(base, 1.06)], seed=rnd.randint(0, 99))
    p.rect(x0, y0 - 18, x1, y0 + 6, shade(base, 0.72))


def ground(p, y0, y1=CH, base=(214, 182, 136)):
    vgrad(p, 0, y0, CW, y1, shade(base, 0.96), shade(base, 1.04), 30)
    specks(p, 0, y0, CW, y1, 260, [shade(base, 0.9), shade(base, 1.08), shade(base, 0.85)], 2, 7, seed=int(y0))


def chicken(p, x, y, s=1.0, flip=False):
    d = -1 if flip else 1
    p.ell(x, y, 34 * s, 26 * s, (250, 250, 245), ol=(200, 200, 195), w=2)
    p.ell(x + d * 30 * s, y - 26 * s, 16 * s, 16 * s, (250, 250, 245), ol=(200, 200, 195), w=2)
    p.ell(x + d * 30 * s, y - 44 * s, 9 * s, 8 * s, (220, 50, 50))
    p.poly([(x + d * 44 * s, y - 28 * s), (x + d * 58 * s, y - 24 * s), (x + d * 44 * s, y - 20 * s)], (240, 160, 40))
    p.ell(x + d * 34 * s, y - 29 * s, 3 * s, 3 * s, INK)
    p.poly([(x - d * 30 * s, y - 10 * s), (x - d * 52 * s, y - 34 * s), (x - d * 40 * s, y)], (240, 240, 235))
    for lx in (-8, 8):
        p.line([(x + lx * s, y + 22 * s), (x + lx * s, y + 42 * s)], (230, 150, 40), 3 * s, caps=False)


def coop_fence(p, x0, x1, y_top, y_bot):
    p.line([(x0, y_top + 40), (x1, y_top + 40)], (140, 98, 58), 12, caps=False)
    p.line([(x0, y_bot - 40), (x1, y_bot - 40)], (140, 98, 58), 12, caps=False)
    x = x0
    while x <= x1:
        p.rect(x, y_top, x + 16, y_bot, (166, 120, 72), ol=(120, 82, 48), w=2)
        p.poly([(x, y_top), (x + 8, y_top - 18), (x + 16, y_top)], (166, 120, 72))
        x += 44


def jujube(p, x, y_base, h):
    p.poly([(x - 40, y_base), (x - 18, y_base - h * 0.6), (x - 60, y_base - h), (x - 30, y_base - h),
            (x + 4, y_base - h * 0.68), (x + 40, y_base - h * 0.95), (x + 60, y_base - h * 0.92),
            (x + 22, y_base - h * 0.55), (x + 40, y_base)], (112, 76, 46), ol=(80, 52, 30), w=3)
    rnd = random.Random(int(x))
    for _ in range(26):
        cx, cy = x + rnd.uniform(-260, 260), y_base - h + rnd.uniform(-120, 120)
        r = rnd.uniform(70, 120)
        p.ell(cx, cy, r, r * 0.8, rnd.choice([(92, 140, 70), (108, 156, 78), (78, 124, 62)]))
    for _ in range(30):
        cx, cy = x + rnd.uniform(-240, 240), y_base - h + rnd.uniform(-100, 120)
        p.ell(cx, cy, 9, 11, (196, 52, 40))


def pump(p, x, y):
    p.rect(x - 60, y - 20, x + 60, y + 30, (150, 150, 148), r=8)
    p.rect(x - 22, y - 230, x + 22, y - 20, (70, 90, 110), ol=(40, 55, 70), w=3, r=6)
    p.line([(x + 10, y - 220), (x + 130, y - 300)], (60, 76, 94), 12)
    p.line([(x - 22, y - 120), (x - 80, y - 100)], (60, 76, 94), 16)


def gate_view():
    img, p = canvas_painter()
    vgrad(p, 0, 0, CW, 760, (138, 192, 232), (246, 234, 204))
    p.ell(980, 300, 110, 110, (255, 246, 214))
    trees(p, 700)
    p.rect(0, 760, CW, 1400, (226, 200, 156))
    specks(p, 0, 760, CW, 1400, 80, [(212, 186, 142), (236, 212, 170)], seed=5)
    brick_wall(p, 0, 520, 360, 1330)
    brick_wall(p, 900, 520, CW, 1330)
    for x in (330, 880):
        p.rect(x, 480, x + 60, 1340, (98, 64, 40), ol=(70, 44, 26), w=3)
    p.rect(330, 470, 940, 520, (88, 58, 36))
    for s, x in ((-1, 330), (1, 940)):
        door = [(x, 520), (x + s * 190, 470), (x + s * 190, 1480), (x, 1330)]
        p.poly(door, (146, 104, 64), ol=(96, 66, 40), w=3)
        for k in range(1, 4):
            xa = x + s * 190 * k / 4
            p.line([(xa, 520 - 50 * k / 4), (xa, 1330 + 150 * k / 4)], (110, 76, 46), 3, caps=False)
    ground(p, 1330)
    p.rect(0, 1330, CW, 1360, (190, 158, 112))
    return finish(img)


def yard_view(with_corn=True):
    img, p = canvas_painter()
    vgrad(p, 0, 0, CW, 520, (138, 192, 232), (246, 234, 204))
    trees(p, 460, seed=4)
    brick_wall(p, 0, 400, CW, 820)
    p.rect(60, 360, 110, 830, (98, 64, 40))
    p.rect(390, 360, 440, 830, (98, 64, 40))
    p.rect(110, 420, 390, 820, (226, 200, 156))
    trees(p, 560, seed=9, w=0)
    p.poly([(110, 420), (40, 380), (40, 900), (110, 830)], (146, 104, 64), ol=(96, 66, 40), w=3)
    p.poly([(390, 420), (470, 380), (470, 900), (390, 830)], (146, 104, 64), ol=(96, 66, 40), w=3)
    ground(p, 820)
    p.line([(200, 600), (1000, 640)], (90, 90, 90), 3, caps=False)
    for x, c in ((360, (90, 130, 190)), (520, (240, 240, 235)), (690, (200, 80, 70))):
        p.rect(x, 610, x + 110, 760, c, ol=shade(c, 0.75), w=2)
    jujube(p, 1080, 1150, 700)
    pump(p, 860, 1120)
    p.ell(860, 1160, 120, 30, (190, 160, 118))
    if with_corn:
        rnd = random.Random(11)
        p.ell(1000, 1560, 150, 55, (205, 168, 96), ol=(160, 125, 70), w=4)
        for _ in range(140):
            x, y = 1000 + rnd.gauss(0, 120), 1560 + rnd.gauss(0, 50)
            p.ell(x, y, 9, 7, (245, 200, 60))
    for x, y, f in ((160, 1600, False), (330, 1640, True), (250, 1720, False)):
        chicken(p, x, y, 1.0, f)
    return finish(img)


def coop_front():
    img, p = canvas_painter(mode="RGBA")
    coop_fence(p, -20, 520, 1560, 1900)
    return finish(img)


def door_view():
    img, p = canvas_painter()
    p.rect(0, 0, CW, 440, (112, 112, 118))
    for row in range(9):
        y = row * 50
        for x in range(-40 if row % 2 else 0, CW, 80):
            p.ell(x + 40, y + 40, 44, 26, (124, 124, 130), ol=(92, 92, 98), w=2)
    p.rect(0, 420, CW, 470, (70, 60, 56))
    p.rect(0, 470, CW, 1760, (206, 166, 116))
    specks(p, 0, 470, CW, 1760, 500, [(190, 150, 102), (220, 182, 132), (180, 140, 95)], 2, 8, seed=13)
    p.rect(340, 600, 900, 1740, (112, 74, 42))
    vgrad(p, 380, 640, 860, 1740, (52, 38, 28), (24, 18, 14), 30)
    p.rect(380, 640, 430, 1740, (90, 60, 36))
    p.rect(810, 640, 860, 1740, (90, 60, 36))
    for x in (250, 920):
        p.rect(x, 640, x + 70, 1520, (196, 70, 58))
        for i, ch in enumerate("春回大地" if x < 600 else "福满人间"):
            p.text(x + 35, 760 + i * 190, ch, 52, (40, 26, 20))
    p.rect(470, 520, 770, 590, (196, 70, 58))
    p.text(620, 555, "五谷丰登", 48, (40, 26, 20))
    p.rect(1000, 800, 1242, 1250, (110, 72, 40))
    p.rect(1030, 830, 1242, 1220, (236, 222, 186))
    for k in range(1, 5):
        p.line([(1030 + k * 50, 830), (1030 + k * 50, 1220)], (120, 80, 46), 8, caps=False)
        p.line([(1030, 830 + k * 78), (1242, 830 + k * 78)], (120, 80, 46), 8, caps=False)
    p.rect(300, 1730, 940, 1790, (150, 142, 132))
    ground(p, 1790)
    return finish(img)


def room_view():
    img, p = canvas_painter()
    p.rect(0, 0, CW, CH, (226, 212, 178))
    rnd = random.Random(21)
    for _ in range(26):
        x, y = rnd.uniform(-100, CW), rnd.uniform(-100, 1500)
        w, h = rnd.uniform(260, 420), rnd.uniform(320, 480)
        tone = rnd.choice([(232, 220, 188), (220, 206, 170), (236, 226, 198)])
        p.rect(x, y, x + w, y + h, tone, ol=shade(tone, 0.9), w=2)
        p.rect(x + 20, y + 20, x + w * 0.7, y + 50, (150, 140, 120))
        for ly in range(int(y + 70), int(y + h - 20), 22):
            p.line([(x + 20, ly), (x + w - 20, ly)], (190, 178, 150), 4, caps=False)
    p.rect(60, 380, 500, 920, (122, 82, 46))
    p.rect(90, 410, 470, 890, (250, 238, 200))
    for k in range(1, 5):
        p.line([(90 + k * 76, 410), (90 + k * 76, 890)], (122, 82, 46), 10, caps=False)
        p.line([(90, 410 + k * 96), (470, 410 + k * 96)], (122, 82, 46), 10, caps=False)
    calendar(p, 860, 300, 0.3)
    p.rect(0, 1430, CW, 1520, (124, 84, 50))
    p.rect(0, 1520, CW, CH, (176, 126, 84))
    base = finish(img)
    rays = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    rd.polygon([(120, 450), (470, 420), (1150, 1500), (420, 1600)], fill=(255, 236, 180, 70))
    rays = rays.filter(ImageFilter.GaussianBlur(40))
    base = Image.alpha_composite(base.convert("RGBA"), rays).convert("RGB")
    return base


def quilt_front():
    img, p = canvas_painter(mode="RGBA")
    pts = [(-40, 1560), (200, 1480), (500, 1500), (800, 1470), (1080, 1510), (1300, 1490), (1300, CH), (-40, CH)]
    p.poly(pts, (188, 42, 50), ol=(140, 28, 34), w=4)
    rnd = random.Random(5)
    for _ in range(40):
        x, y = rnd.uniform(0, CW), rnd.uniform(1560, CH)
        c = rnd.choice([(250, 200, 60), (90, 160, 90), (250, 240, 230)])
        for a in range(0, 360, 72):
            p.ell(x + 16 * math.cos(math.radians(a)), y + 16 * math.sin(math.radians(a)), 12, 12, c)
        p.ell(x, y, 8, 8, (250, 230, 120))
    return finish(img)


def calendar(p, x0, y0, s):
    """Old-style wall calendar showing August 1983; top-left at (x0, y0), scale s (1 = 900px wide)."""
    def X(v): return x0 + v * s
    def Y(v): return y0 + v * s
    p.line([(X(450), Y(-60)), (X(300), Y(10))], (120, 100, 80), max(2, 6 * s), caps=False)
    p.line([(X(450), Y(-60)), (X(600), Y(10))], (120, 100, 80), max(2, 6 * s), caps=False)
    p.ell(X(450), Y(-62), 10 * s, 10 * s, (90, 90, 90))
    p.rect(X(0), Y(0), X(900), Y(1560), (246, 240, 226), ol=(200, 190, 170), w=max(2, 4 * s))
    vgrad(p, X(40), Y(40), X(860), Y(640), (250, 214, 160), (236, 150, 110), 24)
    p.ell(X(620), Y(260), 110 * s, 110 * s, (230, 60, 40))
    p.poly([(X(40), Y(640)), (X(40), Y(470)), (X(260), Y(330)), (X(460), Y(500)), (X(640), Y(380)),
            (X(860), Y(520)), (X(860), Y(640))], (70, 130, 90))
    p.poly([(X(40), Y(640)), (X(40), Y(560)), (X(300), Y(470)), (X(560), Y(580)), (X(860), Y(500)), (X(860), Y(640))],
           (50, 104, 74))
    p.text(X(450), Y(780), "1983", 190 * s, (205, 34, 34))
    p.text(X(450), Y(950), "8月", 130 * s, (205, 34, 34))
    days = "日一二三四五六"
    for i, ch in enumerate(days):
        p.text(X(110 + i * 113), Y(1080), ch, 46 * s, (205, 34, 34) if i in (0, 6) else (60, 50, 45))
    start = 1  # 1 Aug 1983 was a Monday
    for d in range(1, 32):
        k = start + d - 1
        r, c = divmod(k, 7)
        x, y = X(110 + c * 113), Y(1170 + r * 80)
        p.text(x, y, str(d), 50 * s, (205, 34, 34) if c in (0, 6) else (50, 44, 40))
        if d == 20:
            p.ell(x, y, 44 * s, 36 * s, None, ol=(220, 30, 30), w=max(2, 6 * s))


def calendar_view():
    img, p = canvas_painter()
    p.rect(0, 0, CW, CH, (226, 212, 178))
    rnd = random.Random(8)
    for _ in range(14):
        x, y = rnd.uniform(-200, CW), rnd.uniform(-200, CH)
        w, h = rnd.uniform(400, 700), rnd.uniform(500, 800)
        tone = rnd.choice([(232, 220, 188), (220, 206, 170)])
        p.rect(x, y, x + w, y + h, tone, ol=shade(tone, 0.9), w=3)
        for ly in range(int(y + 60), int(y + h - 30), 34):
            p.line([(x + 30, ly), (x + w - 30, ly)], (190, 178, 150), 7, caps=False)
    calendar(p, 170, 360, 1.0)
    return finish(img)


def factory_view():
    img, p = canvas_painter()
    vgrad(p, 0, 0, CW, CH, (34, 44, 60), (16, 20, 28))
    for y, sc in ((640, 0.5), (900, 0.72), (1230, 1.0)):
        x = -100
        while x < CW + 100:
            w = 520 * sc
            p.rect(x, y, x + w, y + 240 * sc, (62, 74, 92), ol=(40, 48, 60), w=3)
            p.rect(x, y - 20 * sc, x + w, y, (88, 100, 118))
            for k in range(10):
                sx = x + 26 * sc + k * 48 * sc
                p.rect(sx, y - 90 * sc, sx + 14 * sc, y - 20 * sc, (190, 192, 198))
                p.ell(sx + 7 * sc, y - 60 * sc, 18 * sc, 26 * sc, (236, 236, 236))
            p.rect(x + 20 * sc, y + 240 * sc, x + 50 * sc, y + 330 * sc, (30, 34, 42))
            p.rect(x + w - 50 * sc, y + 240 * sc, x + w - 20 * sc, y + 330 * sc, (30, 34, 42))
            x += w + 40 * sc
    p.rect(0, 1700, CW, CH, (44, 48, 58))
    specks(p, 0, 1700, CW, CH, 120, [(150, 155, 165), (120, 126, 136)], 3, 10, seed=6)
    for x in (200, 700):
        p.rect(x, 100, x + 360, 124, (236, 246, 250))
    p.poly(ell_pts(820, 2010, 90, 50, 180, 360), (226, 226, 220))
    p.ell(820, 2012, 104, 18, (210, 210, 204))
    base = finish(img)
    glow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for x in (200, 700):
        gd.polygon([(x, 124), (x + 360, 124), (x + 560, 1700), (x - 200, 1700)], fill=(200, 230, 255, 26))
    glow = glow.filter(ImageFilter.GaussianBlur(30))
    return Image.alpha_composite(base.convert("RGBA"), glow).convert("RGB")


def letter_sprite():
    img, p = canvas_painter(320, 420, mode="RGBA")
    p.rect(4, 4, 316, 416, (236, 222, 180), ol=(180, 160, 120), w=4)
    p.text(160, 80, "录取通知书", 46, (196, 40, 36))
    for y in range(150, 380, 34):
        p.line([(40, y), (280, y)], (170, 150, 120), 4, caps=False)
    p.ell(230, 340, 50, 50, None, ol=(200, 50, 40), w=6)
    return finish(img)


def hall_view():
    img, p = canvas_painter()
    for i in range(0, CW, 60):
        k = (math.sin(i / 60 * 1.3) + 1) / 2
        p.rect(i, 0, i + 62, CH, mix((118, 16, 22), (176, 34, 38), k))
    p.rect(0, 150, CW, 330, (204, 30, 32))
    p.text(CW / 2, 240, "先进工作者表彰大会", 92, (252, 218, 96))
    base = finish(img)
    glow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([200, 500, 1040, 1500], fill=(255, 220, 160, 80))
    return Image.alpha_composite(base.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(120))).convert("RGB")


def hall_front():
    img, p = canvas_painter(mode="RGBA")
    p.rect(-20, 1500, CW + 20, CH, (184, 30, 32))
    p.rect(-20, 1490, CW + 20, 1560, (210, 48, 46))
    p.line([(900, 1490), (930, 1280)], (30, 30, 30), 8)
    p.ell(935, 1262, 26, 34, (40, 40, 44))
    p.poly([(400, 1500), (842, 1500), (822, 1330), (420, 1330)], (252, 252, 250), ol=(180, 180, 180), w=3)
    p.text(621, 1418, "林晚秋", 112, (20, 20, 20))
    return finish(img)


def window_front():
    img, p = canvas_painter(mode="RGBA")
    wall = (206, 166, 116)
    p.rect(0, 0, CW, 620, wall)
    p.rect(0, 1440, CW, CH, wall)
    p.rect(0, 620, 430, 1440, wall)
    p.rect(1150, 620, CW, 1440, wall)
    for i, box in enumerate(((0, 0, CW, 620), (0, 1440, CW, CH), (0, 620, 430, 1440), (1150, 620, CW, 1440))):
        specks(p, *box, 150, [(190, 150, 102), (220, 182, 132)], 2, 8, seed=31 + i)
    p.rect(400, 590, 1180, 640, (112, 74, 42))
    p.rect(400, 1420, 1180, 1470, (112, 74, 42))
    p.rect(400, 590, 450, 1470, (112, 74, 42))
    p.rect(1130, 590, 1180, 1470, (112, 74, 42))
    p.rect(450, 640, 770, 1420, (236, 222, 186), ol=(112, 74, 42), w=10)
    for k in range(1, 4):
        p.line([(450 + k * 80, 640), (450 + k * 80, 1420)], (112, 74, 42), 9, caps=False)
    for k in range(1, 8):
        p.line([(450, 640 + k * 98), (770, 640 + k * 98)], (112, 74, 42), 9, caps=False)
    return finish(img)
