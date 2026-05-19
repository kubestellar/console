const isDevLoggingEnabled = import.meta.env.DEV && import.meta.env.MODE !== 'test'

export const logger = {
  log: (...args: unknown[]) => { if (isDevLoggingEnabled) console.log(...args) },
  debug: (...args: unknown[]) => { if (isDevLoggingEnabled) console.debug(...args) },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
}
