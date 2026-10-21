"""Assemble episode 1 animatic: 18 shots, lip flap, subtitles, name cards, music/SFX, voice -> mp4."""
import json
import math
import random
import subprocess
import sys

import numpy as np
import soundfile as sf
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = sys.argv[1]
MODE = sys.argv[2] if len(sys.argv) > 2 else "full"   # "full" or "preview"
sys.path.insert(0, ROOT)
import art  # noqa: E402
from art import CH, CW, font, person  # noqa: E402
from lines import LINES  # noqa: E402

FPS = 24
OW, OH = 1080, 1920
SR = 44100
BUILD = f"{ROOT}/build"
META = json.load(open(f"{BUILD}/voice/meta.json"))


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


# ------------------------------------------------------------------ voice envelopes for lip flap
VOICE = {}
for lid in LINES:
    x, sr = sf.read(f"{BUILD}/voice/{lid}.wav", dtype="float32")
    hop = sr // FPS
    rms = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x), hop)])
    VOICE[lid] = {"x": x, "sr": sr, "rms": rms / (rms.max() + 1e-6)}


def talking(lid, t):
    if lid is None or t < 0:
        return False
    rms = VOICE[lid]["rms"]
    i = int(t * FPS)
    return i < len(rms) and rms[i] > 0.28 and (i % 3 != 2)


# ------------------------------------------------------------------ helpers

def paste(img, spr, x, y):
    """Paste RGBA sprite with its top-left at (x, y)."""
    img.paste(spr, (int(x), int(y)), spr)


def place(img, sprite_tuple, x, y):
    """Paste a person sprite so the head-top centre lands on (x, y)."""
    spr, (ax, ay), _ = sprite_tuple
    paste(img, spr, x - ax, y - ay)


def blur_bg(img, r=10, dark=1.0):
    out = img.filter(ImageFilter.GaussianBlur(r))
    if dark != 1.0:
        out = ImageEnhance.Brightness(out).enhance(dark)
    return out


def halo(sprite_tuple, color=(255, 236, 190), r=26, strength=1.0):
    spr = sprite_tuple[0]
    a = spr.getchannel("A").filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(r))
    a = a.point(lambda v: int(min(255, v * 1.4 * strength)))
    g = Image.new("RGBA", spr.size, color + (0,))
    g.putalpha(a)
    return g


def feathers(img, t, x0, y0, seed, n=26, t0=0.0):
    if t < t0:
        return
    rnd = random.Random(seed)
    d = ImageDraw.Draw(img)
    tt = t - t0
    for _ in range(n):
        ang = rnd.uniform(-math.pi, 0)
        sp = rnd.uniform(250, 700)
        vx, vy = math.cos(ang) * sp, math.sin(ang) * sp
        drag = 1 - math.exp(-tt * 3)
        x = x0 + vx / 3 * drag + 30 * math.sin(tt * 3 + rnd.random() * 6)
        y = y0 + vy / 3 * drag + 90 * tt
        rot = tt * rnd.uniform(2, 5)
        L = rnd.uniform(14, 22)
        dx, dy = L * math.cos(rot), L * 0.4 * math.sin(rot)
        d.ellipse([x - abs(dx) - 4, y - abs(dy) - 4, x + abs(dx) + 4, y + abs(dy) + 4], fill=(250, 250, 248),
                  outline=(205, 205, 205))


def motes(img, t, seed, n=40, box=(0, 0, CW, CH), col=(255, 240, 200)):
    rnd = random.Random(seed)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    for _ in range(n):
        bx, by = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        r = rnd.uniform(2, 6)
        x = bx + 20 * math.sin(t * 0.8 + bx)
        y = (by - t * rnd.uniform(10, 40) - y0) % (y1 - y0) + y0
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)


def sparkle(img, x, y, size):
    if size <= 0:
        return
    d = ImageDraw.Draw(img)
    d.polygon([(x, y - size), (x + size * 0.18, y - size * 0.18), (x + size, y), (x + size * 0.18, y + size * 0.18),
               (x, y + size), (x - size * 0.18, y + size * 0.18), (x - size, y), (x - size * 0.18, y - size * 0.18)],
              fill=(255, 255, 230))


class Shot:
    def __init__(self, plan, line=None, off=0.3, tail=0.45):
        self.plan, self.line, self.off = plan, line, off
        self.dur = plan if not line else max(plan, off + META[line]["dur"] + tail)
        self.base = None
        self.fg = None
        self.grade = None
        self.cards = []
        self.titles = []
        self.cam_keys = [(0, CW / 2, CH / 2, 1.0)]
        self.shake = []

    def cam(self, t):
        keys = self.cam_keys
        if t <= keys[0][0]:
            k = keys[0]
            cx, cy, s = k[1:4]
        else:
            cx, cy, s = keys[-1][1:4]
            for a, b in zip(keys, keys[1:]):
                if a[0] <= t <= b[0]:
                    f = (t - a[0]) / max(b[0] - a[0], 1e-6)
                    f = ease_out(f) if (len(b) > 4 and b[4] == "out") else ease(f)
                    cx, cy, s = [a[i] + (b[i] - a[i]) * f for i in (1, 2, 3)]
                    break
        for (t0, t1, amp) in self.shake:
            if t0 <= t <= t1:
                k = (1 - (t - t0) / (t1 - t0)) * amp
                cx += k * math.sin(t * 90)
                cy += k * math.cos(t * 77)
        return cx, cy, s

    def dyn(self, img, t, talk):
        pass

    def post(self, out, t):
        return out


def crop_cam(img, cx, cy, s):
    w, h = OW / s, OH / s
    w, h = min(w, CW), min(h, CH)
    x0 = clamp(cx - w / 2, 0, CW - w)
    y0 = clamp(cy - h / 2, 0, CH - h)
    return img.resize((OW, OH), Image.BICUBIC, box=(x0, y0, x0 + w, y0 + h))


# ------------------------------------------------------------------ shots

def shot_factory():
    s = Shot(3.0, "L1", off=0.25)
    s.base = art.factory_view()
    letter = art.letter_sprite()
    s.grade = "cold"
    s.cam_keys = [(0, 621, 1300, 1.32), (s.dur, 621, 1180, 1.02)]

    def dyn(img, t, talk):
        motes(img, t, 3, 70, (0, 200, CW, 2000), (225, 230, 236))
        f = ease_out(t / 2.6)
        y = 700 + 1100 * f
        x = 560 + 90 * math.sin(t * 2.4)
        rot = 25 * math.sin(t * 2.0) * (1 - f) + 8
        spr = letter.rotate(rot, Image.BICUBIC, expand=True)
        paste(img, spr, x - spr.width / 2, y - spr.height / 2)
    s.dyn = dyn
    return s


def shot_hall():
    s = Shot(4.0, "L2", off=0.2)
    s.base = art.hall_view()
    s.fg = art.hall_front()
    s.mj = [person("meijuan45", 230, m, "half", expr="smug") for m in (False, True)]
    s.cam_keys = [(0, 621, 1100, 0.95), (0.6, 621, 1100, 0.95), (s.dur, 621, 1400, 1.55)]

    def dyn(img, t, talk):
        place(img, s.mj[int(t * 6) % 2 if t < s.dur - 0.5 else 0], 621, 760)
    s.dyn = dyn
    return s


def shot_flash():
    s = Shot(1.4)
    s.base = Image.new("RGB", (CW, CH), (255, 255, 255))
    return s


def shot_wake():
    s = Shot(4.0)
    s.base = art.room_view()
    s.fg = art.quilt_front()
    s.wq = person("wanqiu", 300, False, "half", expr="shock", sweat=True)
    s.cam_keys = [(0, 621, 1150, 0.92), (0.9, 621, 1000, 1.28, "out"), (s.dur, 621, 990, 1.33)]
    s.cards = [(1.1, "林晚秋", "18岁 · 她重生了")]

    def dyn(img, t, talk):
        bob = 6 * math.sin(t * 9) * max(0, 1 - t / 2)
        place(img, s.wq, 621, 700 + bob)

    def post(out, t):
        if t < 0.5:
            out = Image.blend(out, Image.new("RGB", out.size, (255, 255, 255)), 1 - t / 0.5)
        return out
    s.dyn, s.post = dyn, post
    return s


def shot_calendar():
    s = Shot(3.0, "L5", off=0.2)
    s.base = art.calendar_view()
    s.cam_keys = [(0, 621, 1300, 1.0), (s.dur, 621, 1250, 1.18)]
    s.titles = [(0.6, "重回1983", "这一次，录取通知书是我的")]

    def post(out, t):
        k = 0.5 * ease_out((t - 0.6) / 0.4)
        return ImageEnhance.Brightness(out).enhance(1 - k) if k > 0 else out
    s.post = post
    return s


def shot_postman():
    s = Shot(4.0, "L6", off=0.7)
    s.base = art.gate_view()
    bike = bicycle_sprite()
    paste(s.base, bike, 700, 1020)
    s.pm = [person("postman", 118, m, pose="wave_r", expr="shout", items={"R": "envelope"}) for m in (False, True)]
    s.cam_keys = [(0, 640, 1000, 1.0), (s.dur, 660, 930, 1.22)]

    def dyn(img, t, talk):
        place(img, s.pm[1 if talk else 0], 610, 560)
    s.dyn = dyn
    return s


def shot_ershen_run():
    s = Shot(3.5, "L7", off=0.35)
    s.base = art.yard_view(with_corn=True)
    s.fg = art.coop_front()
    s.es = [person("ershen", 150, m, pose="reach_l", expr="greedy") for m in (False, True)]
    s.cam_keys = [(0, 760, 1050, 1.05), (s.dur, 560, 1000, 1.12)]
    s.cards = [(0.5, "二婶 王桂芬", "最爱占便宜")]

    def dyn(img, t, talk):
        f = ease(t / 2.4)
        x = 1000 - 480 * f
        y = 560 + 18 * abs(math.sin(t * 11)) * (1 if f < 1 else 0)
        place(img, s.es[1 if talk else 0], x, y)
    s.dyn = dyn
    return s


def shot_window():
    s = Shot(3.0)
    base = Image.new("RGB", (CW, CH), (30, 22, 18))
    s.base = base
    s.fg = art.window_front()
    s.mj = person("meijuan", 330, False, "half", expr="smug")
    s.cam_keys = [(0, 760, 1040, 1.0), (s.dur, 820, 1000, 1.25)]
    s.cards = [(0.4, "堂妹 林美娟", "上辈子顶替了她")]

    def dyn(img, t, talk):
        place(img, s.mj, 760, 640 - 20 * ease_out(t / 1.2))
    s.dyn = dyn
    return s


def shot_threshold():
    s = Shot(4.0, "L9", off=0.7)
    s.base = art.door_view()
    s.wq = [person("wanqiu", 190, m, "full", expr="cold", pose="raise_r", items={"R": "hukou", "L": "seal"},
                   sway=0.0) for m in (False, True)]
    s.halo = halo(s.wq[0], strength=1.3)
    s.cam_keys = [(0, 621, 1250, 0.92), (s.dur, 621, 1000, 1.12)]

    def dyn(img, t, talk):
        spr, (ax, ay), _ = s.wq[1 if talk else 0]
        paste(img, s.halo, 621 - ax, 600 - ay)
        place(img, s.wq[1 if talk else 0], 621, 600)
        motes(img, t, 9, 50, (200, 300, 1050, 1900))
    s.dyn = dyn
    return s


def shot_frozen():
    s = Shot(2.4)
    s.base = blur_bg(art.yard_view(), 14)
    s.es = person("ershen", 420, False, "long", expr="frozen", sweat=True)
    s.cam_keys = [(0, 621, 1100, 0.95), (0.25, 621, 1050, 1.12, "out"), (s.dur, 621, 1040, 1.15)]

    def dyn(img, t, talk):
        place(img, s.es, 621, 520)
        d = ImageDraw.Draw(img)
        if t > 0.4:
            for k in range(6):
                x = 470 + k * 60
                d.line([(x, 560), (x, 560 + 120 + 40 * (k % 2))], fill=(90, 110, 200), width=7)
    s.dyn = dyn
    return s


def shot_envelope():
    s = Shot(3.5, "L11", off=0.3)
    s.base = blur_bg(art.gate_view(), 16, 0.95)
    env = envelope_big()
    paste(s.base, env, CW / 2 - env.width / 2, 900)
    s.cam_keys = [(0, 621, 1250, 1.0), (s.dur, 621, 1280, 1.18)]
    return s


def shot_fall():
    s = Shot(4.0)
    s.base = art.yard_view(with_corn=True)
    s.fg = art.coop_front()
    s.wq = person("wanqiu", 130, False, "full", expr="cold", pose="hold", items={"R": "envelope"})
    s.es = person("ershen", 130, False, "full", expr="greedy", pose="reach_l")
    s.es_fall = person("ershen", 130, False, "full", expr="shock", pose="reach_l")
    s.cam_keys = [(0, 640, 1130, 1.0), (s.dur, 560, 1250, 1.08)]
    s.shake = [(1.45, 1.85, 22)]

    def dyn(img, t, talk):
        wx = 600 - 200 * ease((t - 0.55) / 0.35)
        place(img, s.wq, wx, 720)
        if t < 0.95:
            ex = 1150 - 520 * ease(t / 0.95)
            place(img, s.es, ex, 720)
        else:
            f = ease((t - 0.95) / 0.55)
            spr, (ax, ay), _ = s.es_fall
            r = spr.rotate(78 * f, Image.BICUBIC, expand=True)
            cx0, cy0 = 630, 720 - ay + spr.height / 2
            cx, cy = cx0 - 380 * f, cy0 + 520 * f
            paste(img, r, cx - r.width / 2, cy - r.height / 2)
        if t > 1.45:
            feathers(img, t, 300, 1640, seed=4, t0=1.45)
    s.dyn = dyn
    return s


def shot_nainai():
    s = Shot(4.0, "L13", off=0.45)
    s.base = art.door_view()
    s.nn = [person("nainai", 175, m, "full", expr="stern", pose="point_l", items={"R": "cane"}) for m in (False, True)]
    s.cam_keys = [(0, 621, 1250, 0.95), (2.2, 621, 1050, 1.15), (s.dur, 600, 1000, 1.2)]
    s.cards = [(0.6, "奶奶", "重男轻女，偏心美娟")]

    def dyn(img, t, talk):
        place(img, s.nn[1 if talk else 0], 660, 640)
    s.dyn = dyn
    return s


def shot_flashback():
    s = Shot(4.0, "L14", off=0.3)
    s.base = art.yard_view(with_corn=False)
    wq = person("wanqiu", 150, False, "full", expr="crying", pose="offer_r", items={"R": "envelope"})
    mj = person("meijuan", 140, False, "full", expr="smile", pose="take_l")
    place(s.base, wq, 430, 600)
    place(s.base, mj, 980, 640)
    s.grade = "sepia"
    s.cam_keys = [(0, 640, 1150, 0.95), (s.dur, 640, 1100, 1.1)]
    return s


def shot_vow():
    s = Shot(3.5, "L15", off=0.6)
    s.base = blur_bg(art.door_view(), 18, 0.7)
    s.wq = [person("wanqiu", 400, m, "long", expr="cold", pose="pocket", pocket_env=True) for m in (False, True)]
    s.halo = halo(s.wq[0], strength=1.1)
    s.cam_keys = [(0, 621, 1250, 0.95), (s.dur, 621, 1010, 1.22)]

    def dyn(img, t, talk):
        spr, (ax, ay), _ = s.wq[1 if talk else 0]
        paste(img, s.halo, 621 - ax, 640 - ay)
        place(img, s.wq[1 if talk else 0], 621, 640)
    s.dyn = dyn
    return s


def shot_officials():
    s = Shot(4.0, "L16", off=0.5)
    s.base = art.gate_view()
    zs = person("zhishu", 120, False, "full", expr="stern", pose="pipe", items={"R": "pipe"})
    place(s.base, zs, 460, 620)
    s.gb = [person("ganbu", 124, m, "full", expr="calm", pose="glasses", items={"L": "briefcase"}) for m in (False, True)]
    watch = s.gb[0][2]["watch"]
    s.watch = (800 - s.gb[0][1][0] + watch[0], 600 - s.gb[0][1][1] + watch[1])
    s.cam_keys = [(0, 640, 1050, 1.0), (s.dur, 740, 1000, 1.18)]
    s.cards = [(0.8, "县招办干部", "？？？")]

    def dyn(img, t, talk):
        place(img, s.gb[1 if talk else 0], 800, 600)
        k = clamp(1 - abs(t - 2.6) / 0.35)
        sparkle(img, s.watch[0], s.watch[1], 46 * k)
    s.dyn = dyn
    return s


def shot_smug():
    s = Shot(3.0)
    s.base = blur_bg(art.yard_view(), 8)
    es = person("ershen", 230, False, "full", expr="shock", feathers=True)
    place(s.base, es, 860, 760)
    s.mj = person("meijuan", 240, False, "full", expr="smug", pose="help_r")
    s.cam_keys = [(0, 621, 1150, 1.0), (s.dur, 560, 1100, 1.12)]

    def dyn(img, t, talk):
        place(img, s.mj, 440, 720)
    s.dyn = dyn
    return s


def shot_finale():
    s = Shot(3.0, "L18", off=0.4, tail=2.2)
    s.base = blur_bg(art.door_view(), 18, 0.62)
    s.wq = [person("wanqiu", 430, m, "long", expr="smirk_cold") for m in (False, True)]
    s.halo = halo(s.wq[0], strength=0.9)
    s.cam_keys = [(0, 621, 1150, 1.0), (s.dur - 2.0, 621, 1000, 1.25)]
    s.freeze = s.dur - 1.9

    def dyn(img, t, talk):
        t2 = min(t, s.freeze)
        spr, (ax, ay), _ = s.wq[1 if talk and t < s.freeze else 0]
        paste(img, s.halo, 621 - ax, 600 - ay)
        place(img, s.wq[1 if talk and t < s.freeze else 0], 621, 600)

    def post(out, t):
        if t >= s.freeze:
            k = clamp((t - s.freeze) / 0.3)
            out = ImageEnhance.Color(out).enhance(1 - 0.75 * k)
            out = ImageEnhance.Brightness(out).enhance(1 - 0.45 * k)
            if t - s.freeze < 0.12:
                out = Image.blend(out, Image.new("RGB", out.size, (255, 255, 255)), 0.6)
            ov = Image.new("RGBA", out.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(ov)
            a = int(255 * clamp((t - s.freeze - 0.2) / 0.4))
            d.text((OW / 2, 520), "第1集 完", font=font(96), fill=(255, 255, 255, a), anchor="mm",
                   stroke_width=5, stroke_fill=(0, 0, 0, a))
            d.text((OW / 2, 1660), "下集", font=font(54), fill=(255, 214, 80, a), anchor="mm",
                   stroke_width=4, stroke_fill=(0, 0, 0, a))
            d.text((OW / 2, 1750), "招办干部腕上那块表，她上辈子见过", font=font(48), fill=(255, 255, 255, a),
                   anchor="mm", stroke_width=4, stroke_fill=(0, 0, 0, a))
            out = Image.alpha_composite(out.convert("RGBA"), ov).convert("RGB")
        return out

    def cam_freeze(t, _orig=s.cam):
        return _orig(min(t, s.freeze))
    s.dyn, s.post, s.cam = dyn, post, cam_freeze
    return s


def bicycle_sprite():
    img, p = art.canvas_painter(420, 300, mode="RGBA")
    g = (40, 96, 62)
    for cx in (80, 330):
        p.ell(cx, 210, 78, 78, None, ol=(30, 30, 30), w=10)
        for a in range(0, 180, 30):
            p.line([(cx + 74 * math.cos(math.radians(a)), 210 + 74 * math.sin(math.radians(a))),
                    (cx - 74 * math.cos(math.radians(a)), 210 - 74 * math.sin(math.radians(a)))], (150, 150, 150), 2,
                   caps=False)
    p.line([(80, 210), (170, 110), (300, 110), (330, 210)], g, 12)
    p.line([(170, 110), (200, 210), (80, 210)], g, 12)
    p.line([(200, 210), (300, 110)], g, 12)
    p.line([(300, 110), (290, 60), (250, 50)], (40, 40, 40), 8)
    p.rect(140, 80, 200, 96, (30, 30, 30), r=6)
    p.rect(20, 90, 140, 170, (60, 120, 70), ol=(40, 80, 50), w=4, r=10)
    return art.finish(img)


def envelope_big():
    img, p = art.canvas_painter(860, 600, mode="RGBA")
    for s in (-1, 1):
        x = 430 + s * 400
        p.rect(x - 70, 200, x + 70, 420, (240, 200, 170), ol=(200, 160, 130), w=4, r=40)
    p.rect(40, 40, 820, 560, (182, 62, 46), ol=(120, 36, 28), w=6, r=10)
    p.rect(150, 210, 760, 400, (246, 236, 214), ol=(200, 180, 150), w=3)
    p.text(455, 305, "林晚秋同志  收", 64, (30, 30, 30))
    p.text(300, 470, "京华大学招生委员会", 34, (250, 225, 200))
    p.ell(700, 120, 62, 62, None, ol=(250, 210, 80), w=6)
    p.text(700, 120, "挂号", 40, (250, 210, 80))
    for s in (-1, 1):
        x = 430 + s * 380
        p.rect(x - 34, 210, x + 34, 300, (244, 206, 176), ol=(200, 160, 130), w=4, r=30)
    return art.finish(img).rotate(-3, Image.BICUBIC, expand=True)


SHOTS = [shot_factory, shot_hall, shot_flash, shot_wake, shot_calendar, shot_postman, shot_ershen_run, shot_window,
         shot_threshold, shot_frozen, shot_envelope, shot_fall, shot_nainai, shot_flashback, shot_vow, shot_officials,
         shot_smug, shot_finale]


# ------------------------------------------------------------------ overlays (output coordinates)

def text_img(s, px, fill, stroke=6, stroke_fill=(0, 0, 0)):
    f = font(px)
    l, t, r, b = f.getbbox(s, stroke_width=stroke)
    img = Image.new("RGBA", (r - l + 8, b - t + 8), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((4 - l, 4 - t), s, font=f, fill=fill, stroke_width=stroke, stroke_fill=stroke_fill)
    return img


def split_sub(s):
    chunks, cur = [], ""
    for ch in s:
        cur += ch
        if ch in "，。！？" or (ch == "—" and cur.endswith("——")) or (ch == "…" and cur.endswith("……")):
            chunks.append(cur)
            cur = ""
    if cur:
        chunks.append(cur)
    out = []
    for c in chunks:
        c = c.rstrip("，。")
        if out and len(out[-1]) + len(c) <= 9:
            out[-1] += "，" + c if not out[-1].endswith(("！", "？", "——", "……")) else c
        else:
            out.append(c)
    return [c for c in out if c]


SUB_CACHE = {}


def subtitle_imgs(lid):
    if lid not in SUB_CACHE:
        _v, _t, sub, gold = LINES[lid]
        chunks = split_sub(sub)
        total = sum(len(c) for c in chunks)
        dur = META[lid]["dur"]
        items, acc = [], 0.0
        for c in chunks:
            d = dur * len(c) / total
            img = text_img(c, 84 if gold else 64, (255, 222, 70) if gold else (255, 255, 255), 7 if gold else 6)
            items.append((acc, acc + d, img))
            acc += d
        SUB_CACHE[lid] = items
    return SUB_CACHE[lid]


def cached(fn):
    memo = {}

    def wrap(*a):
        if a not in memo:
            memo[a] = fn(*a)
        return memo[a]
    return wrap


@cached
def card_img(name, desc):
    a = text_img(name, 64, (255, 255, 255), 0)
    b = text_img(desc, 40, (255, 230, 170), 0)
    w = max(a.width, b.width) + 70
    img = Image.new("RGBA", (w, 190), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w, 190], 18, fill=(20, 16, 18, 170))
    d.rectangle([0, 0, 14, 190], fill=(214, 46, 46, 255))
    img.paste(a, (40, 22), a)
    img.paste(b, (40, 110), b)
    return img


@cached
def title_img(big, small):
    a = text_img(big, 150, (255, 222, 90), 10, (120, 20, 20))
    b = text_img(small, 52, (255, 255, 255), 5)
    w = max(a.width, b.width)
    img = Image.new("RGBA", (w, a.height + b.height + 30), (0, 0, 0, 0))
    img.paste(a, ((w - a.width) // 2, 0), a)
    img.paste(b, ((w - b.width) // 2, a.height + 30), b)
    return img


def fade_paste(out, im, x, y, alpha):
    if alpha <= 0:
        return
    if alpha < 1:
        im = im.copy()
        im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    out.paste(im, (int(x), int(y)), im)


TAG = text_img("重回1983 · 第1集", 36, (255, 255, 255), 3)

VIGNETTE = None


def vignette():
    global VIGNETTE
    if VIGNETTE is None:
        y, x = np.mgrid[0:OH, 0:OW].astype(np.float32)
        r = np.sqrt(((x - OW / 2) / (OW / 2)) ** 2 + ((y - OH / 2) / (OH / 2)) ** 2)
        v = np.clip(1.08 - 0.32 * r ** 2, 0.55, 1.0)
        VIGNETTE = Image.fromarray((np.stack([v] * 3, -1) * 255).astype(np.uint8))
    return VIGNETTE


def grade(out, kind, t):
    if kind == "cold":
        a = np.asarray(out).astype(np.float32)
        g = a.mean(-1, keepdims=True)
        a = (a * 0.6 + g * 0.4) * np.array([0.85, 0.95, 1.12])
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if kind == "sepia":
        g = ImageOps.grayscale(out.filter(ImageFilter.GaussianBlur(1.2)))
        s = ImageOps.colorize(g, black=(46, 30, 18), white=(250, 226, 182))
        rnd = np.random.default_rng(int(t * 100))
        n = rnd.normal(0, 10, (OH // 4, OW // 4)).astype(np.float32)
        n = Image.fromarray(np.clip(128 + n, 0, 255).astype(np.uint8)).resize((OW, OH))
        s = ImageChops.add(s, Image.merge("RGB", [n] * 3), 1.0, -128)
        return ImageChops.multiply(s, vignette())
    return out


# ------------------------------------------------------------------ audio

def env_exp(n, k):
    return np.exp(-np.arange(n) / SR * k)


def tone(f, dur, harm=(1, 0.5, 0.25, 0.12), decay=3.0, attack=0.005):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * (i + 1) * t) for i, a in enumerate(harm))
    return x * np.minimum(t / attack, 1) * np.exp(-t * decay)


def pad(f, dur, amp=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * f * 1.004 * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t)
    e = np.minimum(t / 0.6, 1) * np.minimum((dur - t) / 0.6, 1)
    return amp * x * np.clip(e, 0, 1) / 2.3


def noise(dur, seed=0):
    return np.random.default_rng(seed).standard_normal(int(dur * SR))


def lowpass(x, a):
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


def boom(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 45 + 80 * np.exp(-t * 12)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 3) + 0.4 * noise(dur, 1) * np.exp(-t * 40)


def bell_ring():
    out = np.zeros(int(1.1 * SR))
    for k in range(3):
        r = sum(a * np.sin(2 * np.pi * f * np.arange(int(0.5 * SR)) / SR) for f, a in ((2400, 1), (3550, 0.6), (5200, 0.3)))
        r = r * env_exp(len(r), 9)
        s = int(k * 0.13 * SR)
        out[s:s + len(r)] += r
    return out * 0.5


def scratch():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 1800 * np.exp(-t * 6) + 200
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * noise(0.35, 2) * 0.5 * np.exp(-t * 4)


def whoosh(dur=0.6):
    x = lowpass(noise(dur, 3), 0.08)
    t = np.arange(len(x)) / SR
    return x * np.sin(np.pi * t / dur) ** 2 * 3


def cluck(seed):
    rnd = np.random.default_rng(seed)
    out = np.zeros(int(1.2 * SR))
    for k in range(4):
        n = int(0.07 * SR)
        t = np.arange(n) / SR
        f = rnd.uniform(650, 900) * (1 + 0.3 * np.sin(2 * np.pi * 30 * t))
        c = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.07)
        s = int((k * 0.16 + rnd.uniform(0, 0.05)) * SR)
        out[s:s + n] += c
    return out * 0.35


def knock():
    return tone(380, 0.25, (1, 0.6), decay=28) + tone(900, 0.25, (1,), decay=40) * 0.4


def applause(dur):
    out = np.zeros(int(dur * SR))
    rnd = np.random.default_rng(9)
    for _ in range(int(dur * 60)):
        s = int(rnd.uniform(0, dur - 0.05) * SR)
        n = int(0.02 * SR)
        out[s:s + n] += noise(0.02, int(rnd.integers(1 << 30))) * env_exp(n, 200) * rnd.uniform(0.3, 1)
    e = np.minimum(np.arange(len(out)) / SR / 0.6, 1)
    return lowpass(out, 0.5) * e * 0.5


def cicadas(dur):
    x = noise(dur, 5)
    x = x - lowpass(x, 0.6)
    t = np.arange(len(x)) / SR
    return x * (0.6 + 0.4 * np.sin(2 * np.pi * 34 * t)) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.3 * t))


NOTE = {n: 440 * 2 ** ((i - 9) / 12 + o - 4) for o in range(2, 7) for i, n0 in enumerate(
    ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]) for n in [f"{n0}{o}"]}


def build_audio(starts, durs, total):
    n = int(total * SR) + SR
    music = np.zeros(n)
    sfx = np.zeros(n)
    voice = np.zeros(n)

    def put(buf, t, x, amp=1.0):
        s = int(t * SR)
        e = min(len(buf), s + len(x))
        if e > s:
            buf[s:e] += amp * x[:e - s]

    S = starts
    # 1-2 sad piano
    seq = ["A3", "E4", "A4", "C5", "F3", "C4", "F4", "A4", "C4", "G4", "C5", "E5", "G3", "D4", "G4", "B4"]
    t = 0.0
    i = 0
    while t < S[2] - 0.2:
        put(music, t, tone(NOTE[seq[i % 16]], 2.0, decay=2.2), 0.16)
        t += 0.36
        i += 1
    put(sfx, S[1] + 0.1, applause(durs[1] - 0.2), 0.35)
    # 3 flash drone + whoosh
    put(sfx, S[2] - 0.5, whoosh(0.9), 0.5)
    put(music, S[2], pad(55, durs[2] + 0.6, 1.0) + pad(82.4, durs[2] + 0.6, 0.6), 0.5)
    # 4 heartbeat + low pad
    for k in range(4):
        put(sfx, S[3] + 0.3 + k * 0.9, boom(0.35), 0.5)
        put(sfx, S[3] + 0.55 + k * 0.9, boom(0.3), 0.35)
    put(music, S[3], pad(NOTE["A2"], durs[3] + durs[4]) + pad(NOTE["E3"], durs[3] + durs[4]), 0.22)
    # 5 title chime
    for k, nn in enumerate(["A4", "C5", "E5", "A5"]):
        put(music, S[4] + 0.6 + k * 0.08, tone(NOTE[nn], 2.5, (1, 0.3), decay=1.5), 0.12)
    # 6-8 rural tense plucks
    pent = ["D4", "F4", "G4", "A4", "C5", "A4", "G4", "F4"]
    t = S[5]
    i = 0
    while t < S[8]:
        put(music, t, tone(NOTE[pent[i % 8]], 0.4, (1, 0.4, 0.2), decay=14), 0.14)
        if i % 4 == 0:
            put(music, t, tone(NOTE["D3"], 0.6, (1, 0.5), decay=6), 0.16)
        t += 0.25
        i += 1
    put(sfx, S[5] + 0.05, bell_ring(), 0.6)
    # 9 power hit
    put(sfx, S[8] + shots[8].off - 0.05, boom(), 0.9)
    for nn in ("D3", "A3", "D4"):
        put(music, S[8] + 0.6, pad(NOTE[nn], durs[8] - 0.3), 0.3)
    # 10 record scratch, then silence
    put(sfx, S[9], scratch(), 0.8)
    # 11 warm chord
    for nn in ("F3", "A3", "C4", "F4"):
        put(music, S[10], pad(NOTE[nn], durs[10]), 0.18)
    # 12 slapstick
    put(sfx, S[11] + 0.2, whoosh(0.7), 0.7)
    put(sfx, S[11] + 1.45, boom(0.6), 0.9)
    for k in range(3):
        put(sfx, S[11] + 1.55 + k * 0.5, cluck(k), 0.9)
    t = S[11] + 1.6
    i = 0
    while t < S[12]:
        put(music, t, tone(NOTE[["C5", "E5", "G5", "E5"][i % 4]], 0.3, (1, 0.3), decay=16), 0.12)
        t += 0.2
        i += 1
    # 13 tense low strings + cane knock
    put(sfx, S[12] + 0.15, knock(), 0.8)
    n13 = durs[12]
    tt = np.arange(int(n13 * SR)) / SR
    trem = (np.sin(2 * np.pi * NOTE["A2"] * tt) + 0.6 * np.sin(2 * np.pi * NOTE["E3"] * tt)) * (0.6 + 0.4 * np.sin(2 * np.pi * 7 * tt))
    put(music, S[12], trem * np.minimum(tt / 0.5, 1) * np.minimum((n13 - tt) / 0.4, 1), 0.12)
    # 14 sad piano (sparser)
    t = S[13]
    i = 0
    while t < S[14] - 0.3:
        put(music, t, tone(NOTE[seq[i % 16]], 2.0, decay=2.0), 0.14)
        t += 0.5
        i += 1
    # 15 hit + rising pad
    put(sfx, S[14] + shots[14].off - 0.05, boom(), 0.85)
    for nn in ("A2", "E3", "A3", "C4"):
        put(music, S[14], pad(NOTE[nn], durs[14]), 0.24)
    # 16-17 suspense pulse
    t = S[15]
    while t < S[17]:
        put(music, t, tone(49, 0.45, (1, 0.3), decay=7), 0.45)
        t += 0.5
    d1617 = S[17] - S[15]
    tt = np.arange(int(d1617 * SR)) / SR
    hi = (np.sin(2 * np.pi * 880 * tt) + np.sin(2 * np.pi * 932 * tt)) * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * tt))
    put(music, S[15], hi * np.minimum(tt / 1.5, 1), 0.025)
    put(sfx, S[15] + 2.45, tone(3200, 0.6, (1, 0.5), decay=8), 0.15)
    # 18 tension + freeze hit
    t = S[17]
    while t < S[17] + shots[17].freeze:
        put(music, t, tone(49, 0.4, (1, 0.3), decay=8), 0.5)
        t += 0.4
    put(sfx, S[17] + shots[17].freeze - 0.3, whoosh(0.35), 0.6)
    put(sfx, S[17] + shots[17].freeze, boom(2.0), 1.0)
    for nn in ("D3", "A3", "F4"):
        put(music, S[17] + shots[17].freeze, pad(NOTE[nn], 2.0), 0.2)
    # cicadas in the yard
    for k in (5, 6, 7, 8, 10, 11, 12, 14, 15, 16):
        put(sfx, S[k], cicadas(durs[k]) * np.minimum(np.arange(int(durs[k] * SR)) / SR / 0.3, 1), 0.035)
    # voices
    for k, sh in enumerate(shots):
        if sh.line:
            v = VOICE[sh.line]
            x = np.interp(np.arange(0, len(v["x"]) * SR / v["sr"]) * v["sr"] / SR, np.arange(len(v["x"])), v["x"])
            put(voice, S[k] + sh.off, x, 1.0)
    m = np.concatenate([[0.0], np.cumsum((np.abs(voice) > 0.02).astype(float))])
    k = 4410
    duck = np.zeros(n)
    duck[k // 2: k // 2 + n - k + 1] = (m[k:] - m[:-k]) / k
    music *= 1 - 0.55 * np.clip(duck * 3, 0, 1)
    mixx = voice * 0.95 + music * 0.75 + sfx * 0.6
    mixx = np.tanh(mixx * 1.1) / np.tanh(1.1)
    mixx = mixx[:int(total * SR)]
    mixx = mixx / max(np.abs(mixx).max(), 1e-6) * 0.92
    fade = np.minimum((len(mixx) - np.arange(len(mixx))) / (0.4 * SR), 1)
    mixx *= fade
    sf.write(f"{BUILD}/mix.wav", np.stack([mixx, mixx], -1).astype(np.float32), SR, subtype="PCM_16")


# ------------------------------------------------------------------ render

print("building shots...", flush=True)
shots = [f() for f in SHOTS]
durs = [s.dur for s in shots]
starts = list(np.cumsum([0] + durs[:-1]))
total = sum(durs)
print("total", round(total, 2), "s; shots:", [round(d, 2) for d in durs], flush=True)


def render_frame(k, t):
    s = shots[k]
    img = s.base.copy()
    talk = talking(s.line, t - s.off) if s.line else False
    s.dyn(img, t, talk)
    if s.fg is not None:
        img.paste(s.fg, (0, 0), s.fg)
    out = crop_cam(img, *s.cam(t))
    out = s.post(out, t)
    if s.grade:
        out = grade(out, s.grade, t)
    elif k != 2:
        out = ImageChops.multiply(out, vignette())
    for (t0, big, small) in s.titles:
        if t >= t0:
            ti = title_img(big, small)
            a = ease_out((t - t0) / 0.4)
            fade_paste(out, ti, OW / 2 - ti.width / 2, 780 - 60 * (1 - a), a)
    for (t0, name, desc) in s.cards:
        if t >= t0:
            c = card_img(name, desc)
            a = ease_out((t - t0) / 0.35) * clamp((s.dur - 0.25 - t) / 0.25)
            fade_paste(out, c, 50 - 120 * (1 - ease_out((t - t0) / 0.35)), 300, a)
    if s.line and not (hasattr(s, "freeze") and t >= s.freeze):
        lt = t - s.off
        for a0, a1, im in subtitle_imgs(s.line):
            if a0 - 0.05 <= lt < a1 + 0.25:
                out.paste(im, (int(OW / 2 - im.width / 2), int(1560 - im.height / 2)), im)
                break
    if k != 2:
        out.paste(TAG, (34, 40), TAG)
    return out


if MODE == "preview":
    picks = [(k, min(s.dur * 0.75, s.dur - 0.05)) for k, s in enumerate(shots)]
    thumbs = [render_frame(k, t).resize((270, 480)) for k, t in picks]
    sheet = Image.new("RGB", (270 * 6, 480 * 3), (0, 0, 0))
    for i, th in enumerate(thumbs):
        sheet.paste(th, ((i % 6) * 270, (i // 6) * 480))
    sheet.save(f"{BUILD}/preview.png")
    for k in (8, 11, 14):
        render_frame(k, shots[k].dur * 0.6).save(f"{BUILD}/frame_{k + 1:02d}.png")
    print("preview written")
    sys.exit(0)

build_audio(starts, durs, total)
print("audio done", flush=True)
mp4 = f"{ROOT}/重回1983-第1集-动态分镜.mp4"
ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}",
                       "-r", str(FPS), "-i", "-", "-i", f"{BUILD}/mix.wav", "-c:v", "libx264", "-preset", "medium",
                       "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest",
                       "-movflags", "+faststart", mp4], stdin=subprocess.PIPE)
frame_no = 0
for k, s in enumerate(shots):
    n = int(round(s.dur * FPS))
    for i in range(n):
        ff.stdin.write(render_frame(k, i / FPS).tobytes())
        frame_no += 1
    print(f"shot {k + 1} done ({frame_no} frames)", flush=True)
ff.stdin.close()
sys.exit(ff.wait())
