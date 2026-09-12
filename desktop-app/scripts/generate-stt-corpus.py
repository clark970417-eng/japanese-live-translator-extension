#!/usr/bin/env python3
"""Generate authored synthetic speech controls on macOS; no downloaded recordings."""
import argparse
import json
import shutil
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
args = parser.parse_args()
if not args.ffmpeg or not shutil.which('say'):
    parser.error('Requires macOS say with Kyoko voice, and --ffmpeg or ffmpeg on PATH')
manifest = Path(__file__).resolve().parents[2] / 'tests/corpus/recognition.json'
args.output.mkdir(parents=True, exist_ok=True)
for row in json.loads(manifest.read_text()):
    source = args.output / (row['id'] + '.txt')
    source.write_text(row['text'])
    aiff, wav = (args.output / (row['id'] + suffix) for suffix in ['.aiff', '.wav'])
    subprocess.run(['say', '-v', 'Kyoko', '-r', '180', '-f', str(source), '-o', str(aiff)], check=True)
    subprocess.run([args.ffmpeg, '-y', '-i', str(aiff), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', str(wav)], check=True)
