import { EventEmitter } from 'events'
import { expect, it, vi } from 'vitest'
import { bindPipelineActivity } from './pipeline-activity'

it('holds one background activity assertion only while the pipeline is active', () => {
  const pipeline = new EventEmitter()
  const blocker = {start:vi.fn(()=>0),stop:vi.fn(()=>true)}
  const cleanup = bindPipelineActivity(pipeline,blocker)
  expect(blocker.start).not.toHaveBeenCalled()
  pipeline.emit('state-change','initializing')
  pipeline.emit('state-change','running')
  pipeline.emit('state-change','recovering')
  expect(blocker.start).toHaveBeenCalledExactlyOnceWith('prevent-app-suspension')
  pipeline.emit('state-change','idle')
  expect(blocker.stop).toHaveBeenCalledExactlyOnceWith(0)
  pipeline.emit('state-change','running')
  cleanup();cleanup()
  expect(blocker.stop).toHaveBeenCalledTimes(2)
  expect(pipeline.listenerCount('state-change')).toBe(0)
})
