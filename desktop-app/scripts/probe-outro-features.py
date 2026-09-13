"""Content-independent speech evidence for a window Whisper decoded as an outro."""
import sys, json, wave, contextlib
import numpy as np, mlx_whisper
RATE = 16000
MODEL = 'mlx-community/whisper-large-v3-turbo'

def load(path):
    with wave.open(path) as w: frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype='<i2').astype(np.float32) / 32768.0

def modulation_ratio(audio):
    """Share of envelope modulation power in the syllable band, 2-8 Hz."""
    hop = RATE // 100
    frames = len(audio) // hop
    if frames < 32: return 0.0
    env = np.sqrt(np.mean(audio[:frames * hop].reshape(frames, hop) ** 2, axis=1) + 1e-12)
    env = env - env.mean()
    spec = np.abs(np.fft.rfft(env * np.hanning(len(env)))) ** 2
    freqs = np.fft.rfftfreq(len(env), 1 / 100)
    band = spec[(freqs >= 2) & (freqs <= 8)].sum()
    total = spec[(freqs >= 0.5) & (freqs <= 25)].sum() + 1e-12
    return float(band / total)

def pitch_track(audio):
    """Autocorrelation f0 per 40 ms frame in 70-400 Hz; None when unvoiced."""
    size, hop = 640, 320
    out = []
    for start in range(0, len(audio) - size, hop):
        frame = audio[start:start + size] * np.hanning(size)
        if np.sqrt(np.mean(frame ** 2)) < 0.005: out.append(None); continue
        ac = np.correlate(frame, frame, 'full')[size - 1:]
        lo, hi = RATE // 400, RATE // 70
        lag = lo + int(np.argmax(ac[lo:hi]))
        out.append(RATE / lag if ac[lag] > 0.3 * ac[0] else None)
    return out

def pitch_features(audio):
    track = pitch_track(audio)
    voiced = [f for f in track if f]
    frac = len(voiced) / max(1, len(track))
    # Speech prosody glides; a held or stepped tone repeats exact lags.
    semis = np.diff(12 * np.log2(np.array(voiced))) if len(voiced) > 2 else np.array([0.0])
    glide = float(np.mean((np.abs(semis) > 0.15) & (np.abs(semis) < 3))) if len(semis) else 0.0
    return frac, glide

for path in sys.argv[1:]:
    audio = load(path)
    with contextlib.redirect_stdout(sys.stderr):
        r = mlx_whisper.transcribe(audio, path_or_hf_repo=MODEL, language='ja', condition_on_previous_text=False,
                                   temperature=0, verbose=False, word_timestamps=True,
                                   sample_len=min(448, max(48, int(len(audio) / RATE * 24) + 24)))
    words = [w for s in r.get('segments', []) for w in s.get('words', [])]
    covered = sum(max(0.0, w['end'] - w['start']) for w in words)
    frac, glide = pitch_features(audio)
    print(json.dumps({'file': path.split('/')[-1], 'text': r.get('text', '').strip()[:24],
        'modulation': round(modulation_ratio(audio), 3), 'voicedFraction': round(frac, 3), 'glide': round(glide, 3),
        'wordCoverage': round(covered / (len(audio) / RATE), 3) if words else 0.0,
        'wordProbMean': round(float(np.mean([w.get('probability', 0) for w in words])), 3) if words else 0.0}, ensure_ascii=False))
