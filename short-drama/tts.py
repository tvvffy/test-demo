"""Synthesize every dialogue line to build/voice/<id>.wav with sherpa-onnx + Kokoro v1.1-zh."""
import json
import os
import sys

import numpy as np
import sherpa_onnx
import soundfile as sf

ROOT = sys.argv[1]
sys.path.insert(0, ROOT)
from lines import LINES, VOICES  # noqa: E402

M = f"{ROOT}/models/kokoro-multi-lang-v1_1"
OUT = f"{ROOT}/build/voice"
os.makedirs(OUT, exist_ok=True)

cfg = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=f"{M}/model.onnx", voices=f"{M}/voices.bin", tokens=f"{M}/tokens.txt",
            data_dir=f"{M}/espeak-ng-data", dict_dir=f"{M}/dict",
            lexicon=f"{M}/lexicon-us-en.txt,{M}/lexicon-zh.txt"),
        num_threads=4),
    rule_fsts=f"{M}/date-zh.fst,{M}/phone-zh.fst,{M}/number-zh.fst")
tts = sherpa_onnx.OfflineTts(cfg)

meta = {}
for lid, (voice, text, _sub, _gold) in LINES.items():
    sid, speed = VOICES[voice]
    audio = tts.generate(text, sid=sid, speed=speed)
    x = np.array(audio.samples, np.float32)
    # trim leading/trailing silence
    idx = np.where(np.abs(x) > 0.01)[0]
    if len(idx):
        x = x[max(idx[0] - 600, 0): idx[-1] + 2400]
    x = x / max(np.max(np.abs(x)), 1e-6) * 0.9
    sf.write(f"{OUT}/{lid}.wav", x, audio.sample_rate)
    meta[lid] = {"sr": audio.sample_rate, "dur": round(len(x) / audio.sample_rate, 3)}
    print(lid, meta[lid]["dur"], flush=True)

with open(f"{OUT}/meta.json", "w") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
