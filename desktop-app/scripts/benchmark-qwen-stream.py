"""Isolated candidate probe. Does not change the production recognizer."""
import argparse,json,time,wave
from pathlib import Path
import numpy as np
from mlx_qwen3_asr import Session
p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--corpus',required=True);p.add_argument('--report',required=True);p.add_argument('--chunk',type=float,default=1.0)
a=p.parse_args();root=Path(a.corpus);report=Path(a.report)
report.write_text('')
def emit(value):
 with report.open('a') as f:f.write(json.dumps(value,ensure_ascii=False)+'\n')
 print(json.dumps(value,ensure_ascii=False),flush=True)
try:
 t=time.perf_counter();session=Session(model=a.model)
 emit({'type':'config','model':a.model,'chunk':a.chunk,'translation':False,'loadMs':(time.perf_counter()-t)*1000})
 for row in json.loads((root/'manifest.json').read_text()):
  with wave.open(str(root/(row['id']+'.wav'))) as f:
   assert f.getframerate()==16000 and f.getnchannels()==1 and f.getsampwidth()==2
   pcm=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(np.float32)/32768
  state=session.init_streaming(language='Japanese',chunk_size_sec=a.chunk,max_context_sec=30,max_new_tokens=160,finalization_mode='accuracy')
  start=time.perf_counter();first=None;updates=[];size=int(16000*a.chunk)
  for offset in range(0,len(pcm),size):
   end=min(offset+size,len(pcm));time.sleep(max(0,end/16000-(time.perf_counter()-start)))
   state=session.feed_audio(pcm[offset:end],state)
   if state.text:
    elapsed=(time.perf_counter()-start)*1000
    if first is None:first=elapsed
    updates.append({'ms':elapsed,'text':state.text,'stable':state.stable_text})
  state=session.finish_streaming(state)
  emit({'type':'trial','id':row['id'],'reference':row['reference'],'source':state.text,'firstJaMs':first,'finalDelayMs':(time.perf_counter()-start)*1000-len(pcm)/16,'updates':updates})
 emit({'type':'complete'})
except Exception as error:
 emit({'type':'fatal','error':repr(error)});raise
