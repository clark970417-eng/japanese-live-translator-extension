import { expect, it } from 'vitest'
import { SubprocessBridge, type SpawnConfig } from './SubprocessBridge'

class EchoBridge extends SubprocessBridge {
  protected getLogPrefix(): string { return 'bridge-test' }
  protected getInitTimeout(): number { return 3000 }
  protected getCommandTimeout(): number { return 3000 }
  protected getSpawnError(): Error { return new Error('spawn failed') }
  protected onInitComplete(result: Record<string, unknown>): void {
    if (result.error) throw new Error(String(result.error))
  }
  protected getSpawnConfig(): SpawnConfig {
    return {command:process.execPath,args:['-e',`
      require('readline').createInterface({input:process.stdin}).on('line',line=>{
        const message=JSON.parse(line);
        if(message.action==='crash')process.exit(2);
        else console.log(JSON.stringify({_reqId:message._reqId,ok:true}));
      });`],initMessage:{action:'init'}}
  }
  request(action='echo') { return this.sendCommand({action}) }
  get errorListeners() { return this.process?.stdin?.listenerCount('error') }
}

it('keeps one stdin error listener across repeated successful requests', async () => {
  const bridge = new EchoBridge()
  try {
    await bridge.initialize()
    for (let i=0;i<100;i++) expect(await bridge.request()).toMatchObject({ok:true})
    expect(bridge.errorListeners).toBe(1)
  } finally {await bridge.dispose()}
})

it('settles pending work on process exit and can initialize again', async () => {
  const bridge = new EchoBridge()
  try {
    await bridge.initialize()
    expect(await bridge.request('crash')).toMatchObject({error:'Bridge exited with code 2'})
    await bridge.initialize()
    expect(await bridge.request()).toMatchObject({ok:true})
  } finally {await bridge.dispose()}
})
