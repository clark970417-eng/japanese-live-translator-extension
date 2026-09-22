import { spawnSync } from 'node:child_process'
const rounds = Math.max(1, Number(process.env.STABILITY_ROUNDS || 8))
const files = [
  'src/main/pipeline-activity.test.ts',
  'src/main/worker-pool.test.ts',
  'src/main/bounded-translation.test.ts',
  'src/pipeline/TranslationPipeline.test.ts',
  'src/renderer/audio-file.test.ts'
]
for (let round = 1; round <= rounds; round++) {
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...files, '--reporter=dot'], {
    stdio: 'inherit', env: { ...process.env, JTL_STABILITY_ROUND: String(round) }
  })
  if (result.status !== 0) {
    console.error(`Stability gate failed in round ${round}/${rounds}.`)
    process.exit(result.status || 1)
  }
}
console.log(`Stability gate passed ${rounds} consecutive rounds.`)
