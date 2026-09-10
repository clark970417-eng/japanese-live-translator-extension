"""On-demand native inference companion. stdout is reserved for Chromium framing."""
import base64
import contextlib
import json
import struct
import sys
import time
try:
    from .translation_support import TranslationCache, glossary_prompt
except ImportError:
    from translation_support import TranslationCache, glossary_prompt

ASR = "mlx-community/whisper-small-mlx"
MT = "mlx-community/HY-MT1.5-1.8B-4bit"


class Engine:
    def initialize(self):
        import numpy as np
        import mlx_whisper
        from mlx_lm import load
        from opencc import OpenCC
        self.np, self.asr = np, mlx_whisper
        self.mt, self.tokenizer = load(MT)
        self.converter = OpenCC("s2twp")
        self.cache = TranslationCache()
        # Load and warm the recognizer before accepting tab audio.
        self.asr.transcribe(np.zeros(16000, dtype=np.float32),
                            path_or_hf_repo=ASR, language="ja", verbose=False)
        self.ready = True
        return {"model": "MLX Whisper Small + HY-MT 1.8B", "dtype": "native / 4bit"}

    def handle(self, message):
        if message["op"] == "init":
            if not getattr(self, "ready", False):
                return self.initialize()
            return {"model": "MLX Whisper Small + HY-MT 1.8B", "dtype": "native / 4bit"}
        if not getattr(self, "ready", False):
            raise ValueError("Companion is not initialized")
        started = time.monotonic()
        if message["op"] == "decode":
            audio = self.np.frombuffer(base64.b64decode(message["audio"], validate=True), dtype="<f4")
            if not 1 <= len(audio) <= 16_000 * 15 or not self.np.isfinite(audio).all():
                raise ValueError("Invalid audio")
            result = self.asr.transcribe(audio.copy(), path_or_hf_repo=ASR,
                language="ja", task="transcribe", temperature=0,
                condition_on_previous_text=False, verbose=False)
            return {"text": result["text"].strip(), "ms": round((time.monotonic()-started)*1000)}
        if message["op"] == "translate":
            from mlx_lm import generate
            from mlx_lm.sample_utils import make_sampler
            text = message.get("text", "")
            if not isinstance(text, str) or not 1 <= len(text) <= 3000:
                raise ValueError("Invalid text")
            glossary = message.get("glossary", [])
            direction = message.get("direction", "ja-zh")
            if direction not in ("ja-zh", "zh-ja", "ja-en"):
                raise ValueError("Unsupported translation direction")
            key = self.cache.key(text, glossary, direction)
            cached = self.cache.get(key)
            if cached is not None:
                return {"text": cached, "ms": 0, "cached": True}
            instruction = {"ja-zh": "将以下日文翻译为繁体中文，只输出译文，不要保留日文原文，不要解释。",
                "ja-en": "Translate the following Japanese into English. Output only the translation.",
                "zh-ja": "将以下中文翻译成自然、礼貌、亲切且稍微可爱的日文观众留言。保留原意，不添加告白、亲密关系或原文没有的内容，不夸张卖萌。只输出日文译文，不要解释。"}[direction]
            prompt = self.tokenizer.apply_chat_template([{"role": "user", "content":
                instruction + "\n"
                + glossary_prompt(glossary) + "\n\n" + text}],
                tokenize=False, add_generation_prompt=True)
            result = generate(self.mt, self.tokenizer, prompt=prompt, max_tokens=384,
                              sampler=make_sampler(temp=0), verbose=False)
            result = result.strip()
            if direction == "ja-zh":
                result = self.converter.convert(result)
            if not result:
                raise ValueError("Empty translation")
            self.cache.put(key, result)
            return {"text": result,
                    "ms": round((time.monotonic()-started)*1000)}
        raise ValueError("Unsupported operation")


def read_message(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError("Truncated header")
    size = struct.unpack("<I", header)[0]
    if size > 2_000_000:
        raise ValueError("Message too large")
    payload = stream.read(size)
    if len(payload) != size:
        raise ValueError("Truncated message")
    return json.loads(payload)


def main():
    output = sys.stdout.buffer
    engine = Engine()
    while True:
        message = read_message(sys.stdin.buffer)
        if message is None:
            return
        try:
            with contextlib.redirect_stdout(sys.stderr):
                result = engine.handle(message)
            reply = {"id": message["id"], "ok": True, "result": result}
        except Exception as error:
            reply = {"id": message.get("id"), "ok": False, "error": str(error)}
        payload = json.dumps(reply, ensure_ascii=False).encode()
        output.write(struct.pack("<I", len(payload)) + payload)
        output.flush()


if __name__ == "__main__":
    main()
