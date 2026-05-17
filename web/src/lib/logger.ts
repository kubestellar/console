const isDev = import.meta.env.DEV

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args) },
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args) },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
}
