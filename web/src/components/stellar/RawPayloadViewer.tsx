import type { ReactNode } from 'react'

export function RawPayloadViewer({ children }: { children: ReactNode }) {
  return (
    <pre className="whitespace-pre-wrap rounded border border-[var(--s-border)] bg-[var(--s-surface)] p-3 text-xs text-[var(--s-text-muted)]">
      {children}
    </pre>
  )
}
