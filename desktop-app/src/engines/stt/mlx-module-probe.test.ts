import { it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { MLX_MODULE_PROBE } from './mlx-module-probe'

const python = process.env.TEST_PYTHON || 'python3'
const available = spawnSync(python, ['--version']).status === 0
it.skipIf(!available)('discovers MLX without executing its expensive import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mlx-probe-'))
  try {
    writeFileSync(join(dir, 'mlx_whisper.py'), 'raise RuntimeError("Package import must not execute during discovery")\n')
    const result = spawnSync(python, ['-S', '-c', MLX_MODULE_PROBE], {
      cwd: dir, env: { ...process.env, PYTHONPATH: dir }, timeout: 5000,
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr?.toString()).toBe(0)
    // Negative control: the old full-import probe fails on this same package.
    const oldProbe = spawnSync(python, ['-S', '-c', 'import mlx_whisper'], {
      cwd: dir, env: { ...process.env, PYTHONPATH: dir }, timeout: 5000,
    })
    expect(oldProbe.status).toBe(1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
