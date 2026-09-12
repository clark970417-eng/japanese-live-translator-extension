import { expect, it, vi } from 'vitest'
import { boundedTranslation } from './bounded-translation'
it('aborts stuck generation and allows the next request', async () => {
 const session={promptWithMeta:vi.fn((_p:string,o:any)=>new Promise<any>((_r,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason))))}
 await expect(boundedTranslation(session,'x',{},2,5)).rejects.toThrow('timed out')
 session.promptWithMeta.mockResolvedValueOnce({responseText:'你好',stopReason:'eogToken'})
 expect(await boundedTranslation(session,'x',{},2)).toBe('你好')
})
it('never presents truncated output as a complete translation', async () => {
 const session={promptWithMeta:vi.fn(async(_p:string,_o:any)=>({responseText:'incomplete',stopReason:'maxTokens'}))}
 await expect(boundedTranslation(session,'x',{maxTokens:512},5)).rejects.toThrow('output limit')
 expect(session.promptWithMeta.mock.calls[0]?.[1]).toMatchObject({maxTokens:64})
})
it('responds to caller cancellation rather than waiting for the deadline', async () => {
 const controller=new AbortController()
 const session={promptWithMeta:vi.fn((_p:string,o:any)=>new Promise<any>((_r,reject)=>o.signal.addEventListener('abort',()=>reject(o.signal.reason))))}
 const result=boundedTranslation(session,'x',{},10,15000,controller.signal)
 controller.abort()
 await expect(result).rejects.toThrow('cancelled')
})

it('keeps caller cancellation distinct even if inference returns partial output on abort', async () => {
 const controller=new AbortController()
 const session={promptWithMeta:vi.fn(async()=>{
  controller.abort()
  return {responseText:'unfinished',stopReason:'abort'}
 })}
 await expect(boundedTranslation(session,'x',{},10,15000,controller.signal)).rejects.toMatchObject({name:'TranslationCancelledError'})
})
