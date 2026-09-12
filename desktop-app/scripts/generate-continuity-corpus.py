#!/usr/bin/env python3
"""Generate authored streaming-continuity controls on macOS; no downloaded recordings.

Every clip is synthesized with the Kyoko voice and transformed locally, so these
are failure-hunting controls, not real livestream speech.
"""
import argparse
import json
import shutil
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
parser.add_argument('--manifest', default='tests/corpus/continuity.json',
                    help='manifest path relative to the repository root')
args = parser.parse_args()
if not args.ffmpeg or not shutil.which('say'):
    parser.error('Requires macOS say with Kyoko voice, and --ffmpeg or ffmpeg on PATH')

manifest = Path(__file__).resolve().parents[2] / args.manifest
args.output.mkdir(parents=True, exist_ok=True)
RATE = '16000'
# A plain three-tone bed stands in for background music. It is synthetic, not a
# recording, so nothing is redistributed.
MUSIC_TONES = [294, 370, 440]


def run(command):
    subprocess.run(command, check=True, capture_output=True)


def speak(text, rate, destination):
    source = destination.with_suffix('.txt')
    source.write_text(text)
    aiff = destination.with_suffix('.aiff')
    run(['say', '-v', 'Kyoko', '-r', str(rate), '-f', str(source), '-o', str(aiff)])
    run([args.ffmpeg, '-y', '-i', str(aiff), '-ar', RATE, '-ac', '1', '-c:a', 'pcm_s16le', str(destination)])
    aiff.unlink()
    source.unlink()


def music_bed(seconds, destination, volume):
    command = [args.ffmpeg, '-y']
    for tone in MUSIC_TONES:
        command += ['-f', 'lavfi', '-i', f'sine=frequency={tone}:duration={seconds}']
    inputs = ''.join(f'[{index}:a]' for index in range(len(MUSIC_TONES)))
    command += ['-filter_complex', f'{inputs}amix=inputs={len(MUSIC_TONES)}:duration=longest,volume={volume}[out]',
                '-map', '[out]', '-ar', RATE, '-ac', '1', '-c:a', 'pcm_s16le', str(destination)]
    run(command)


def duration(path):
    output = subprocess.run([args.ffmpeg, '-i', str(path), '-f', 'null', '-'],
                            check=True, capture_output=True, text=True).stderr
    line = [part for part in output.split() if part.startswith('time=')][-1]
    hours, minutes, seconds = line.split('=')[1].split(':')
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


written = []
for row in json.loads(manifest.read_text()):
    target = args.output / (row['id'] + '.wav')
    if 'silenceSeconds' in row:
        run([args.ffmpeg, '-y', '-f', 'lavfi', '-i', f"anullsrc=r={RATE}:cl=mono",
             '-t', str(row['silenceSeconds']), '-c:a', 'pcm_s16le', str(target)])
    elif 'musicOnlySeconds' in row:
        music_bed(row['musicOnlySeconds'], target, 0.3)
    else:
        speech = args.output / (row['id'] + '-speech.wav')
        speak(row['text'], row['rate'], speech)
        if 'tailText' in row:
            tail = args.output / (row['id'] + '-tail.wav')
            gap = args.output / (row['id'] + '-gap.wav')
            speak(row['tailText'], row['rate'], tail)
            run([args.ffmpeg, '-y', '-f', 'lavfi', '-i', f"anullsrc=r={RATE}:cl=mono",
                 '-t', str(row['gapSeconds']), '-c:a', 'pcm_s16le', str(gap)])
            listing = args.output / (row['id'] + '-parts.txt')
            listing.write_text(''.join(f"file '{part.name}'\n" for part in [speech, gap, tail]))
            run([args.ffmpeg, '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
                 '-ar', RATE, '-ac', '1', '-c:a', 'pcm_s16le', str(target)])
            for part in [tail, gap, listing]:
                part.unlink()
            speech.unlink()
        elif 'music' in row:
            bed = args.output / (row['id'] + '-bed.wav')
            music_bed(duration(speech), bed, row['music'])
            run([args.ffmpeg, '-y', '-i', str(speech), '-i', str(bed), '-filter_complex',
                 '[0:a][1:a]amix=inputs=2:duration=first:normalize=0[out]',
                 '-map', '[out]', '-ar', RATE, '-ac', '1', '-c:a', 'pcm_s16le', str(target)])
            bed.unlink()
            speech.unlink()
        elif 'filter' in row:
            run([args.ffmpeg, '-y', '-i', str(speech), '-af', row['filter'],
                 '-ar', RATE, '-ac', '1', '-c:a', 'pcm_s16le', str(target)])
            speech.unlink()
        else:
            speech.replace(target)
    written.append({'id': row['id'], 'condition': row['condition'], 'expect': row['expect'],
                    'reference': row.get('text', '') + row.get('tailText', ''),
                    'seconds': round(duration(target), 3)})

(args.output / 'manifest.json').write_text(json.dumps(written, ensure_ascii=False, indent=1))
print(json.dumps(written, ensure_ascii=False, indent=1))
