# 短剧：《重回1983》

- `重回1983-第1集.md`：第 1 集剧本、角色设定、分镜表和每个镜头的提示词
- `build/preview.png`：动态分镜样片的每镜截图
- `build/voice/`：第 1 集全部台词的 AI 配音（开源 Kokoro v1.1-zh 模型生成）
- `lines.py` / `tts.py`：台词表和配音生成脚本
- `art.py` / `render.py`：扁平插画版动态分镜样片的绘制和合成脚本

## 重新生成

```bash
python3 -m venv venv && venv/bin/pip install sherpa-onnx numpy pillow soundfile
mkdir -p models && curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_1.tar.bz2 | tar xj -C models
venv/bin/python -I tts.py "$PWD"            # 配音
venv/bin/python -I render.py "$PWD" preview  # 每镜截图
venv/bin/python -I render.py "$PWD" full     # 完整样片（需要 ffmpeg）
```
