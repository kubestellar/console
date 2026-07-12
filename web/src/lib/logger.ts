// Guard import.meta.env access: it is undefined when src/ modules are imported
// directly by Playwright test workers (Node.js, no Vite transform). Safe to
// default to false — logger.warn/error always emit regardless of this flag.
let isDevLoggingEnabled = false
try {
  isDevLoggingEnabled = import.meta.env.DEV === true && import.meta.env.MODE !== 'test'
} catch {
  // Node.js / non-Vite context — dev logging stays disabled
}

export const logger = {
  log: (...args: unknown[]) => { if (isDevLoggingEnabled) console.log(...args) },
  debug: (...args: unknown[]) => { if (isDevLoggingEnabled) console.debug(...args) },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
}
