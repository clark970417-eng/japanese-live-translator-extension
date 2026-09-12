/** Authored synthetic controls only: not a live-speech accuracy score. */
import { app, powerSaveBlocker } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine'
const { CORPUS_MANIFEST, CORPUS_AUDIO_DIR, CORPUS_REPORT, COMPARE_PROFILE } = process.env
if (!CORPUS_MANIFEST || !CORPUS_AUDIO_DIR || !CORPUS_REPORT || !COMPARE_PROFILE) throw new Error('Set corpus manifest, audio directory, report and isolated profile')
app.setPath('userData', COMPARE_PROFILE)
const normalize = (s:string) => [...s.normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'')]
function distance(a:string[],b:string[]):number {
 let row=Array.from({length:b.length+1},(_,i)=>i)
 for(let i=0;i<a.length;i++) {
  const next=[i+1]
  for(let j=0;j<b.length;j++) next.push(Math.min(next[j]!+1,row[j+1]!+1,row[j]!+(a[i]===b[j]?0:1)))
  row=next
 }
 return row[b.length]!
}
function readPCM(wav:Buffer):Float32Array {
 if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE') throw new Error('Expected WAV')
 let data:Buffer|undefined, valid=false
 for(let p=12;p+8<=wav.length;) {
  const id=wav.toString('ascii',p,p+4),size=wav.readUInt32LE(p+4),start=p+8
  if(start+size>wav.length) throw new Error('Truncated WAV')
  if(id==='fmt '){valid=size>=16&&wav.readUInt16LE(start)===1&&wav.readUInt16LE(start+2)===1&&wav.readUInt32LE(start+4)===16000&&wav.readUInt16LE(start+14)===16}
  if(id==='data')data=wav.subarray(start,start+size)
  p=start+size+(size%2)
 }
 if(!valid||!data||data.length%2)throw new Error('Expected mono PCM16 16kHz audio')
 return Float32Array.from({length:data.length/2},(_,i)=>data!.readInt16LE(i*2)/32768)
}
app.whenReady().then(async()=>{
 const keepAwake=powerSaveBlocker.start('prevent-app-suspension')
 const results:unknown[]=[]
 const cases=JSON.parse(readFileSync(CORPUS_MANIFEST,'utf8')) as Array<{id:string;text:string}>
 try {
  for(const model of (process.env.CORPUS_MODELS||'mlx-community/whisper-base-mlx,mlx-community/whisper-small-mlx,mlx-community/whisper-large-v3-turbo').split(',')) {
   const engine=new MlxWhisperEngine({model,language:'ja'})
   try {
    const init=performance.now();await engine.initialize()
    results.push({model,initializationMs:performance.now()-init})
    for(const c of cases) {
     if(!/^[a-z0-9_-]+$/.test(c.id))throw new Error('Invalid corpus id')
     const wav=readFileSync(join(CORPUS_AUDIO_DIR,c.id+'.wav')),pcm=readPCM(wav)
     const start=performance.now();const result=await engine.processAudio(pcm,16000)
     const durationMs=performance.now()-start,source=result?.text||''
     const row={model,id:c.id,reference:c.text,source,durationMs,audioSeconds:pcm.length/16000,
      characterErrorRate:distance(normalize(c.text),normalize(source))/Math.max(1,normalize(c.text).length),
      sha256:createHash('sha256').update(wav).digest('hex'),synthetic:true}
     results.push(row);console.log(JSON.stringify(row))
    }
   } finally {await engine.dispose()}
  }
 } catch(error){results.push({error:String(error)});process.exitCode=1}
 finally {writeFileSync(CORPUS_REPORT,JSON.stringify(results,null,2));powerSaveBlocker.stop(keepAwake);app.quit()}
})
