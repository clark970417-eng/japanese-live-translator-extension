import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { StreamingProcessor, type StreamingDeps } from './StreamingProcessor'
import { LocalAgreement } from './LocalAgreement'
import { ContextBuffer } from './ContextBuffer'

it('does not publish an old interim translation after the segment is finalized', async () => {
  vi.useFakeTimers()
  let complete!: (value: string) => void
  const emitter = new EventEmitter()
  const updates: unknown[] = []
  emitter.on('interim-result', r => updates.push(r))
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({ processAudio: async () => ({text: '今日は魚を見ました。', language: 'ja'}) }),
    getTranslator: () => ({translate: () => new Promise<string>(resolve => { complete = resolve })}),
    translateFinal: async () => '今天看到了魚。',
    getGlossary: () => [], getSimulMtConfig: () => ({enabled:false,waitK:3}),
    resolveTargetLanguage: () => 'zh', incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    const final=await processor.finalizeStreaming(new Float32Array(16000),16000)
    expect(final?.translatedText).toBe('今天看到了魚。')
    const count=updates.length
    complete('過期翻譯')
    await Promise.resolve(); await Promise.resolve()
    expect(updates).toHaveLength(count)
  } finally {processor.reset();vi.useRealTimers()}
})


it('does not restart translation when recognition finishes after reset', async () => {
  vi.useFakeTimers()
  let finish!: (value: unknown) => void
  const translate = vi.fn(async () => '你好')
  const emitter = new EventEmitter()
  const emit = vi.spyOn(emitter, 'emit')
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: () => new Promise(resolve => {finish=resolve})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    const processing = processor.processStreaming(new Float32Array(16000),16000)
    processor.reset()
    finish({text:'こんにちは',language:'ja'})
    expect(await processing).toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(translate).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  } finally {processor.reset();vi.useRealTimers()}
})


it('coalesces newer interim text while translation is busy', async () => {
  vi.useFakeTimers()
  const calls: string[] = []
  const completions: Array<(s:string)=>void> = []
  let source = 'あいう'
  const translator = {translate: (text:string) => {calls.push(text);return new Promise<string>(r=>completions.push(r))}}
  const processor = new StreamingProcessor({
    emitter: new EventEmitter(), agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:source,language:'ja'})}),
    getTranslator: () => translator, getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toEqual(['あいう'])
    source='あいうえ'
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1200)
    expect(calls).toHaveLength(1)
    source='あいうえお'
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(0)
    completions[0]!('譯文')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual(['あいう','あいうえお'])
    completions[1]!('新譯文')
    await Promise.resolve()
  } finally {processor.reset();vi.useRealTimers()}
})

it('starts the first Chinese translation without waiting for another recognition window', async () => {
  vi.useFakeTimers()
  const translate = vi.fn(async () => '大家好')
  const processor = new StreamingProcessor({
    emitter: new EventEmitter(), agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:'みなさんこんにちは',language:'ja'})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    const result = await processor.processStreaming(new Float32Array(16000),16000)
    expect(result?.sourceText).toBe('みなさんこんにちは')
    await vi.advanceTimersByTimeAsync(1)
    expect(translate).toHaveBeenCalledOnce()
    expect(processor.lastTranslatedConfirmed).toBe('大家好')
  } finally {processor.reset();vi.useRealTimers()}
})

it('times out a finalization behind stalled recognition without entering STT concurrently', async () => {
  vi.useFakeTimers()
  let finish!: (value: null) => void
  const processAudio = vi.fn(() => new Promise<null>(r => { finish = r }))
  const processor = new StreamingProcessor({
    emitter: new EventEmitter(), agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio}), getTranslator: () => null, getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    const pending = processor.processStreaming(new Float32Array(16000),16000)
    const final = processor.finalizeStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(10001)
    expect(await final).toBeNull()
    expect(processAudio).toHaveBeenCalledOnce()
    finish(null)
    await pending
  } finally {processor.reset();vi.useRealTimers()}
})

it('does not replace an already translated hypothesis with a shorter clause on confirmation', async () => {
  vi.useFakeTimers()
  let source = '今日は魚を見ました。'
  const translate = vi.fn(async (text: string) => text === '今日は魚を見ました。' ? '今天看到了魚。' : '今天的魚')
  const emitter = new EventEmitter()
  const updates: Array<{translatedText: string}> = []
  emitter.on('interim-result', result => updates.push(result))
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:source,language:'ja'})}),
    getTranslator: () => ({translate}), getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await vi.advanceTimersByTimeAsync(1)
    expect(processor.lastTranslatedConfirmed).toBe('今天看到了魚。')
    await processor.processStreaming(new Float32Array(32000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(translate).toHaveBeenCalledOnce()
    expect(updates.at(-1)?.translatedText).toBe('今天看到了魚。')
    source = '今日は鳥を見ました。'
    await processor.processStreaming(new Float32Array(48000),16000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(translate).toHaveBeenLastCalledWith(source, 'ja', 'zh', expect.anything())
  } finally {processor.reset();vi.useRealTimers()}
})

it('bounds draft recognition and drops drafts that arrive after the primary result', async () => {
  let complete!: (value: unknown) => void
  const draft = vi.fn(() => new Promise(resolve => { complete = resolve }))
  const emitter = new EventEmitter()
  const emitted = vi.fn()
  emitter.on('draft-stt-result', emitted)
  const processor = new StreamingProcessor({
    emitter, agreement: new LocalAgreement(), contextBuffer: new ContextBuffer(),
    getSTTEngine: () => ({processAudio: async () => ({text:'午後九時です。',language:'ja'})}),
    getDraftSTTEngine: () => ({processAudio:draft}),
    getTranslator: () => null, getGlossary: () => [],
    getSimulMtConfig: () => ({enabled:false,waitK:3}), resolveTargetLanguage: () => 'zh',
    incrementProcessing() {}, decrementProcessing() {}, getGeneration: () => 1
  } as unknown as StreamingDeps)
  try {
    await processor.processStreaming(new Float32Array(16000),16000)
    await processor.processStreaming(new Float32Array(32000),16000)
    expect(draft).toHaveBeenCalledOnce()
    complete({text:'五時です。',language:'ja'})
    await new Promise(resolve => setTimeout(resolve,0))
    expect(emitted).not.toHaveBeenCalled()
    await processor.processStreaming(new Float32Array(48000),16000)
    expect(draft).toHaveBeenCalledTimes(2)
    processor.reset()
    complete({text:'古い字幕',language:'ja'})
    await new Promise(resolve => setTimeout(resolve,0))
    expect(emitted).not.toHaveBeenCalled()
  } finally {processor.reset()}
})

it('publishes a fast Japanese draft before primary recognition completes', async () => {
  let finish!: (value: unknown) => void
  const emitter = new EventEmitter()
  const draft = vi.fn()
  emitter.on('draft-stt-result', draft)
  const processor = new StreamingProcessor({
    emitter, agreement:new LocalAgreement(), contextBuffer:new ContextBuffer(),
    getSTTEngine:()=>({processAudio:()=>new Promise(resolve=>{finish=resolve})}),
    getDraftSTTEngine:()=>({processAudio:async()=>({text:'こんばんは',language:'ja'})}),
    getTranslator:()=>null,getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),
    resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){},getGeneration:()=>1
  } as unknown as StreamingDeps)
  try {
    const pending=processor.processStreaming(new Float32Array(16000),16000)
    await vi.waitFor(()=>expect(draft).toHaveBeenCalledOnce())
    expect(draft).toHaveBeenCalledWith(expect.objectContaining({sourceText:'こんばんは',translatedText:'',isInterim:true}))
    finish({text:'皆さん、こんばんは。',language:'ja'})
    expect((await pending)?.sourceText).toBe('皆さん、こんばんは。')
  } finally {processor.reset()}
})
it('cancels the interim inference before processing the final utterance', async () => {
 vi.useFakeTimers()
 let signal:AbortSignal|undefined
 const processor=new StreamingProcessor({
  emitter:new EventEmitter(),agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
  getSTTEngine:()=>({processAudio:async()=>({text:'こんにちは',language:'ja'})}),
  getTranslator:()=>({translate:(_t:string,_f:string,_to:string,c:any)=>{signal=c.signal;return new Promise((_r,reject)=>signal!.addEventListener('abort',()=>reject(new Error('cancelled'))))}}),
  translateFinal:async()=>{expect(signal?.aborted).toBe(true);return '你好'},
  getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){}
 } as unknown as StreamingDeps)
 try {
  await processor.processStreaming(new Float32Array(16000),16000)
  await vi.advanceTimersByTimeAsync(0)
  expect(signal?.aborted).toBe(false)
  expect((await processor.finalizeStreaming(new Float32Array(16000),16000))?.translatedText).toBe('你好')
 }finally{processor.reset();vi.useRealTimers()}
})
it('reuses an exact completed translation at speech end but re-translates a changed sentence', async () => {
 vi.useFakeTimers()
 let text='今日は休みです。'
 const final=vi.fn(async()=> '明天休息。')
 const processor=new StreamingProcessor({
  emitter:new EventEmitter(),agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
  getSTTEngine:()=>({processAudio:async()=>({text,language:'ja'})}),
  getTranslator:()=>({translate:async()=> '今天休息。'}),translateFinal:final,
  getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',incrementProcessing(){},decrementProcessing(){}
 } as unknown as StreamingDeps)
 try {
  await processor.processStreaming(new Float32Array(16000),16000);await vi.advanceTimersByTimeAsync(0)
  expect((await processor.finalizeStreaming(new Float32Array(16000),16000))?.translatedText).toBe('今天休息。')
  expect(final).not.toHaveBeenCalled()
  await processor.processStreaming(new Float32Array(16000),16000);await vi.advanceTimersByTimeAsync(0)
  text='明日は休みです。'
  expect((await processor.finalizeStreaming(new Float32Array(16000),16000))?.translatedText).toBe('明天休息。')
  expect(final).toHaveBeenCalledTimes(1)
 }finally{processor.reset();vi.useRealTimers()}
})
