"""Character error on a fixed reference set; punctuation-insensitive, no MT score."""
import json,sys,unicodedata
from pathlib import Path
def normalize(text):
 return ''.join(c for c in unicodedata.normalize('NFKC',text).lower() if not c.isspace() and unicodedata.category(c)[0] not in 'PS')
def distance(a,b):
 row=list(range(len(b)+1))
 for i,x in enumerate(a,1):
  nxt=[i]
  for j,y in enumerate(b,1):nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
  row=nxt
 return row[-1]
for path in sys.argv[1:]:
 rows=[json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
 trials=[r for r in rows if r.get('type')=='trial']
 errors=chars=0
 for r in trials:
  ref=normalize(r['reference']);errors+=distance(ref,normalize(r.get('source','')));chars+=len(ref)
 print(json.dumps({'file':path,'trials':len(trials),'referenceCharacters':chars,'edits':errors,'CER':errors/chars if chars else None}))
