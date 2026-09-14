/** naudiodon is optional: builds must type-check even when PortAudio is unavailable. */
declare module 'naudiodon' {
  const api: unknown
  export = api
}
