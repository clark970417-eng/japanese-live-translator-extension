import type { EventEmitter } from 'events'

interface Blocker {
  start(type: 'prevent-app-suspension'): number
  stop(id: number): boolean
}

/** Keep active audio work running in background; never keep the display awake. */
export function bindPipelineActivity(pipeline: EventEmitter, blocker: Blocker): () => void {
  let id: number | undefined
  const update = (state: string): void => {
    const active = state === 'running' || state === 'initializing' || state === 'recovering'
    if (active && id === undefined) id = blocker.start('prevent-app-suspension')
    if (!active && id !== undefined) { blocker.stop(id); id = undefined }
  }
  pipeline.on('state-change', update)
  return () => { pipeline.off('state-change', update); update('idle') }
}
