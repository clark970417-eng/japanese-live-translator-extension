/** Verify the archive actually contains the tested runtime before installation. */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const asar = require('@electron/asar')
const app = path.resolve(process.argv[2] || 'dist/mac-arm64/Japanese Live Translate.app')
const build = path.resolve(process.argv[3] || 'out')
const resources = path.join(app, 'Contents/Resources')
const archive = path.join(resources, 'app.asar')
const entries = asar.listPackage(archive)
for (const entry of entries) {
  assert(!/(?:^|\/)(?:\.test-out|benchmark-[^/]*|[^/]*\.gguf)(?:\/|$)/.test(entry), `Test artifact in package: ${entry}`)
}
for (const file of ['main/index.js', 'main/slm-worker.js', 'preload/index.js', 'renderer/index.html']) {
  assert.deepEqual(asar.extractFile(archive, 'out/' + file), fs.readFileSync(path.join(build, file)), `Runtime mismatch: ${file}`)
}
const html = asar.extractFile(archive, 'out/renderer/index.html').toString()
for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"?#]+)"/g)) {
  assert(asar.extractFile(archive, 'out/renderer/' + match[1].slice(2)).length, `Missing renderer asset: ${match[1]}`)
}
const version = JSON.parse(asar.extractFile(archive, 'package.json')).version
assert.equal(version, JSON.parse(fs.readFileSync('package.json')).version)
assert(fs.existsSync(path.join(resources, 'bridge-scripts/mlx-whisper-bridge.py')))
const addon = path.join(resources, 'app.asar.unpacked/node_modules/@kutalia/whisper-node-addon/dist/mac-arm64/whisper.node')
const dylibs = execFileSync('otool', ['-L', addon], {encoding:'utf8'})
assert(!/\/(?:Users|home)\//.test(dylibs.split('\n').slice(1).join('\n')), 'Developer library path in native addon')
const commands = execFileSync('otool', ['-l', addon], {encoding:'utf8'})
const rpaths = [...commands.matchAll(/cmd LC_RPATH\n[\s\S]*?\n\s*path (.+?) \(offset /g)].map(m => m[1])
assert(rpaths.includes('@loader_path') && rpaths.every(p => !/^\/(Users|home)\//.test(p)), 'Non-portable addon search path')
execFileSync('codesign', ['--verify', '--deep', '--strict', app], {stdio:'pipe'})
console.log(JSON.stringify({version, entries:entries.length, runtimeMatches:true, rendererAssetsPresent:true, signatureValid:true, portableAddon:true}))
