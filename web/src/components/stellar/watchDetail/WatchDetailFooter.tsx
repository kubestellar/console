import { footerBtn } from './helpers'

interface WatchDetailFooterProps {
  watchId: string
  onResolve: (id: string) => void
  onDismiss: (id: string) => void
  onSnooze: (id: string, minutes: number) => void
  onClose: () => void
}

export function WatchDetailFooter({
  watchId,
  onResolve,
  onDismiss,
  onSnooze,
  onClose,
}: WatchDetailFooterProps) {
  return (
    <div className="flex flex-shrink-0 flex-wrap gap-1.5 px-4 py-2.5" style={{
      borderTop: '1px solid var(--s-border)',
    }}>
      <button
        className="px-3 py-1"
        onClick={() => { onResolve(watchId); onClose() }}
        style={footerBtn('var(--s-success)')}
      >✓ Mark resolved</button>
      <button
        className="px-3 py-1"
        onClick={() => { onSnooze(watchId, 60); onClose() }}
        style={footerBtn('var(--s-text-muted)')}
      >⏸ Snooze 1h</button>
      <button
        className="px-3 py-1"
        onClick={() => { onDismiss(watchId); onClose() }}
        style={footerBtn('var(--s-text-dim)')}
      >✕ Stop watching</button>
    </div>
  )
}
