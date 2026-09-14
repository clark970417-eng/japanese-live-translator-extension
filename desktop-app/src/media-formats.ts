/** Containers/codecs accepted by the bundled FFmpeg file-import path. */
export const SUPPORTED_MEDIA_EXTENSIONS = [
  '.3g2', '.3gp', '.aac', '.ac3', '.adts', '.aif', '.aiff', '.amr', '.ape',
  '.asf', '.avi', '.caf', '.dts', '.dv', '.f4a', '.f4v', '.flac', '.m2ts',
  '.m4a', '.m4v', '.mka', '.mkv', '.mov', '.mp3', '.mp4', '.mpeg', '.mpg',
  '.mts', '.oga', '.ogg', '.ogv', '.opus', '.ra', '.rm', '.ts', '.vob',
  '.wav', '.weba', '.webm', '.wma', '.wmv'
] as const

const SUPPORTED_MEDIA_EXTENSION_SET = new Set<string>(SUPPORTED_MEDIA_EXTENSIONS)

export const MEDIA_FILE_ACCEPT = `audio/*,video/*,${SUPPORTED_MEDIA_EXTENSIONS.join(',')}`

export function isSupportedMediaFile(path: string): boolean {
  const filename = path.replaceAll('\\', '/').split('/').pop() ?? ''
  const dot = filename.lastIndexOf('.')
  return dot >= 0 && SUPPORTED_MEDIA_EXTENSION_SET.has(filename.slice(dot).toLowerCase())
}
