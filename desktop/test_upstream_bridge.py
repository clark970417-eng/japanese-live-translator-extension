import contextlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
import wave
import numpy as np

class UpstreamBridgeTests(unittest.TestCase):
    def load(self):
        path = Path(__file__).resolve().parent.parent / 'desktop-app/resources/mlx-whisper-bridge.py'
        spec = importlib.util.spec_from_file_location('tested_bridge', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_ready_requires_successful_warmup(self):
        bridge = self.load()
        def fail(*args, **kwargs): raise RuntimeError('Model unavailable')
        out = io.StringIO()
        with patch.dict('sys.modules', {'mlx_whisper': SimpleNamespace(transcribe=fail)}), contextlib.redirect_stdout(out):
            bridge.init_model('test')
        self.assertIn('error', json.loads(out.getvalue()))
        self.assertIsNone(bridge.whisper_model)

    def test_wav_is_decoded_without_ffmpeg_and_silence_skips_model(self):
        bridge = self.load(); bridge.whisper_model = 'test'
        calls = []
        def transcribe(audio, **kwargs):
            calls.append(audio)
            return {'text': 'こんにちは', 'language': 'ja'}
        with tempfile.TemporaryDirectory() as folder, patch.dict('sys.modules', {'mlx_whisper': SimpleNamespace(transcribe=transcribe)}):
            for level in (1000, 0):
                path = str(Path(folder) / 'audio.wav')
                with wave.open(path, 'wb') as out:
                    out.setnchannels(1); out.setsampwidth(2); out.setframerate(16000)
                    out.writeframes(np.full(1600, level, dtype='<i2').tobytes())
                result = io.StringIO()
                with contextlib.redirect_stdout(result): bridge.transcribe(path)
                self.assertEqual(json.loads(result.getvalue())['text'], 'こんにちは' if level else '')
        self.assertEqual(len(calls), 1)
        self.assertIsInstance(calls[0], np.ndarray)

if __name__ == '__main__': unittest.main()
