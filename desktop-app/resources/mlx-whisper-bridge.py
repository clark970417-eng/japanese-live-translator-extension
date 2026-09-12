#!/usr/bin/env python3
"""
Python subprocess bridge for mlx-whisper STT.
Receives PCM audio data via stdin (as raw bytes), outputs JSON results via stdout.

Protocol:
  Input (one per line): JSON {"action": "transcribe", "audio_path": "/tmp/audio.pcm", "sample_rate": 16000}
  Input: {"action": "init", "model": "mlx-community/whisper-large-v3-turbo"}
  Input: {"action": "dispose"}
  Output: JSON {"text": "...", "language": "ja"} or {"error": "..."}
"""
import sys
import json
import tempfile
import os
import numpy as np
import contextlib
import wave

whisper_model = None
whisper_processor = None

def init_model(model_name="mlx-community/whisper-large-v3-turbo"):
    global whisper_model, whisper_processor
    try:
        import mlx_whisper
        whisper_model = model_name
        # Resolve/download weights and compile kernels before reporting ready.
        with contextlib.redirect_stdout(sys.stderr):
            mlx_whisper.transcribe(np.zeros(16000, dtype=np.float32),
                path_or_hf_repo=whisper_model, language='ja', verbose=False,
                condition_on_previous_text=False, temperature=0)
        output({"ready": True, "model": model_name})
    except ImportError:
        output({"error": "mlx-whisper not installed. Run: pip install mlx-whisper"})
    except Exception as e:
        whisper_model = None
        output({"error": str(e)})

def transcribe(audio_path, sample_rate=16000, language=None):
    global whisper_model
    if not whisper_model:
        output({"error": "Model not initialized"})
        return

    try:
        import mlx_whisper
        # The native engine already writes mono PCM16 WAV. Decode it directly;
        # a packaged app must not depend on ffmpeg being present in shell PATH.
        with wave.open(audio_path, 'rb') as audio_file:
            if audio_file.getnchannels() != 1 or audio_file.getsampwidth() != 2:
                raise ValueError('Expected mono PCM16 WAV')
            rate = audio_file.getframerate()
            audio = np.frombuffer(audio_file.readframes(audio_file.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
        if rate != 16000:
            audio = np.interp(np.arange(round(len(audio) * 16000 / rate)) * rate / 16000,
                              np.arange(len(audio)), audio).astype(np.float32)
        if not len(audio) or float(np.max(np.abs(audio))) < 0.00003:
            output({"text": "", "language": "ja"})
            return
        with contextlib.redirect_stdout(sys.stderr):
            result = mlx_whisper.transcribe(
                audio, path_or_hf_repo=whisper_model,
                language=language, condition_on_previous_text=False,
                temperature=0, verbose=False,
                sample_len=min(448, max(48, int(len(audio) / 16000 * 24) + 24)),
            )

        segments = result.get("segments", [])
        if segments and all(s.get("no_speech_prob", 0) > 0.6 and s.get("avg_logprob", 0) < -0.8 for s in segments):
            output({"text": "", "language": language or "ja"})
            return
        text = result.get("text", "").strip()
        language = result.get("language", "en")

        # Map to our language codes
        lang = language

        output({"text": text, "language": lang})
    except Exception as e:
        output({"error": str(e)})

_current_req_id = None

def output(data):
    if _current_req_id is not None:
        data["_reqId"] = _current_req_id
    print(json.dumps(data), flush=True)

def main():
    global _current_req_id
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            _current_req_id = msg.get("_reqId")
            action = msg.get("action")

            if action == "init":
                init_model(msg.get("model", "mlx-community/whisper-large-v3-turbo"))
            elif action == "transcribe":
                transcribe(msg["audio_path"], msg.get("sample_rate", 16000), msg.get("language"))
            elif action == "dispose":
                output({"disposed": True})
                sys.exit(0)
            else:
                output({"error": f"Unknown action: {action}"})
        except json.JSONDecodeError:
            _current_req_id = None
            output({"error": "Invalid JSON"})
        except Exception as e:
            output({"error": str(e)})
        finally:
            _current_req_id = None

if __name__ == "__main__":
    main()
