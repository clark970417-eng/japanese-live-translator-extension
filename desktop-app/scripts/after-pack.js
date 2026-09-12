// After-pack hook for electron-builder:
// Recreate whisper-node-addon symlinks and fix rpath in the unpacked asar directory.
// Handles both macOS (symlinks + rpath) and Windows (junctions).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

exports.default = async function afterPack(context) {
  const platform = context.packager.platform.name // 'mac', 'windows', 'linux'

  if (platform === 'mac') {
    await fixMacOS(context)
  } else if (platform === 'windows') {
    await fixWindows(context)
  }
}

async function fixMacOS(context) {
  const appOutDir = context.appOutDir
  const unpackedBase = path.join(
    appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
    '@kutalia',
    'whisper-node-addon',
    'dist'
  )

  if (!fs.existsSync(unpackedBase)) {
    console.log('[after-pack] whisper-node-addon dist not found in unpacked asar, skipping')
    return
  }

  // Recreate platform symlinks (may be lost during packaging)
  const symlinkMappings = [
    { from: 'mac-arm64', to: 'darwin-arm64' },
    { from: 'mac-x64', to: 'darwin-x64' }
  ]

  for (const { from, to } of symlinkMappings) {
    const source = path.join(unpackedBase, from)
    const target = path.join(unpackedBase, to)

    if (fs.existsSync(source) && !fs.existsSync(target)) {
      fs.symlinkSync(from, target, 'dir')
      console.log(`[after-pack] Created symlink: ${to} -> ${from}`)
    }
  }

  // Resolve bundled dylibs relative to the addon, never to the build machine.
  for (const archDir of ['mac-arm64', 'mac-x64']) {
    const whisperNode = path.join(unpackedBase, archDir, 'whisper.node')
    if (!fs.existsSync(whisperNode)) continue
    const commands = execFileSync('/usr/bin/otool', ['-l', whisperNode], { encoding: 'utf8' })
    const rpaths = [...commands.matchAll(/cmd LC_RPATH\n[\s\S]*?\n\s*path (.+?) \(offset /g)].map(match => match[1])
    for (const rpath of rpaths) {
      if (rpath.startsWith('/Users/') || rpath.startsWith('/home/')) {
        execFileSync('/usr/bin/install_name_tool', ['-delete_rpath', rpath, whisperNode])
      }
    }
    if (!rpaths.includes('@loader_path')) {
      execFileSync('/usr/bin/install_name_tool', ['-add_rpath', '@loader_path', whisperNode])
    }
    console.log(`[after-pack] Portable loader path configured: ${archDir}`)
  }

  console.log('[after-pack] macOS whisper-node-addon fixes applied')
}

async function fixWindows(context) {
  const appOutDir = context.appOutDir
  const unpackedBase = path.join(
    appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    '@kutalia',
    'whisper-node-addon',
    'dist'
  )

  if (!fs.existsSync(unpackedBase)) {
    console.log('[after-pack] whisper-node-addon dist not found in unpacked asar, skipping')
    return
  }

  // Recreate win-x64 → win32-x64 junction (may be lost during packaging)
  const symlinkMappings = [
    { from: 'win-x64', to: 'win32-x64' }
  ]

  for (const { from, to } of symlinkMappings) {
    const source = path.join(unpackedBase, from)
    const target = path.join(unpackedBase, to)

    if (fs.existsSync(source) && !fs.existsSync(target)) {
      try {
        fs.symlinkSync(source, target, 'junction')
        console.log(`[after-pack] Created junction: ${to} -> ${from}`)
      } catch (e) {
        // Fallback: copy directory
        fs.cpSync(source, target, { recursive: true })
        console.log(`[after-pack] Copied directory: ${from} -> ${to}`)
      }
    }
  }

  console.log('[after-pack] Windows whisper-node-addon fixes applied')
}
