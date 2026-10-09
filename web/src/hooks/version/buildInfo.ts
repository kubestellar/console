// Build-time version metadata injected by Vite (`define`).
// Extracted from useVersionCheckCore.tsx (issue #24058) — logic unchanged.

declare const __APP_VERSION__: string

declare const __COMMIT_HASH__: string

export function readBuildVersion(): string {
  try {
    return __APP_VERSION__ || 'unknown'
  } catch {
    return 'unknown'
  }
}

export function readBuildCommitHash(): string {
  try {
    return __COMMIT_HASH__ || 'unknown'
  } catch {
    return 'unknown'
  }
}
