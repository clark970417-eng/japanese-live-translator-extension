"""Summarize engine-only replay evidence without dropping failed trials."""
import json, math, statistics, sys
from pathlib import Path
for name in sys.argv[1:]:
    rows = [json.loads(line) for line in Path(name).read_text().splitlines() if line.strip()]
    trials = [r for r in rows if r.get('type') == 'trial']
    summary = {'file': name, 'trials': len(trials),
        'complete': any(r.get('type') == 'complete' for r in rows),
        'missing_finals': sum(bool(r.get('missing')) for r in trials),
        'errors': [r for r in rows if r.get('type') in ('error', 'fatal')],
        'silent_controls': sum(r.get('type') == 'silence' for r in rows),
        'silence_outputs': [r for r in rows if r.get('type') == 'silence' and r.get('result')],
        'restarts': sum(r.get('type') == 'restart' for r in rows)}
    for key in ('firstJaMs', 'firstZhMs', 'finalDelayMs'):
        values = sorted(r[key] for r in trials if isinstance(r.get(key), (int, float)))
        summary[key] = {'valid': len(values), 'median': statistics.median(values),
            'p95': values[math.ceil(len(values)*.95)-1], 'max': max(values)} if values else None
    print(json.dumps(summary, ensure_ascii=False, indent=2))
