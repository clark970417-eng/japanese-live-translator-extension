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
    completions[0]!('譯文')
    await vi.advanceTimersByTimeAsync(1000)
    expect(calls).toEqual(['あいう','あいうえお'])
    completions[1]!('新譯文')
    await Promise.resolve()
  } finally {processor.reset();vi.useRealTimers()}
})
