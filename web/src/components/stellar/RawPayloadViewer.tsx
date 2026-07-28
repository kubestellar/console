interface RawPayloadViewerProps {
  payload: string
}

export function RawPayloadViewer({ payload }: RawPayloadViewerProps) {
  return (
    <pre className="whitespace-pre-wrap rounded border border-[var(--s-border)] bg-[var(--s-surface)] p-3 text-xs text-[var(--s-text-muted)]">
      {payload}
    </pre>
  )
}
