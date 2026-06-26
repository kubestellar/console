import { useState } from 'react'
import type { StellarAction } from '../../types/stellar'

export function ApprovalCard({
  action,
  onApprove,
  onReject,
}: {
  action: StellarAction
  onApprove: (confirmToken?: string) => Promise<void>
  onReject: (reason: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="mb-1 px-2.5 py-2" style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-warning)', borderRadius: 'var(--s-r)' }}>
      <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--s-text)' }}>{action.description}</div>
      <div className="mb-2 text-[10px]" style={{ fontFamily: 'var(--s-mono)', color: 'var(--s-text-muted)' }}>
        {action.actionType} · {action.cluster}{action.namespace ? `/${action.namespace}` : ''}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            setBusy(true)
            setError(null)
            onApprove(action.confirmToken).catch((e) => setError(e instanceof Error ? e.message : 'approval failed')).finally(() => setBusy(false))
          }}
          disabled={busy}
          className="px-3 py-1"
          style={{ background: 'var(--s-success)', color: 'var(--s-success-foreground)', border: 'none', borderRadius: 'var(--s-rs)', fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? '...' : 'Approve'}
        </button>
        <button
          onClick={() => {
            setBusy(true)
            setError(null)
            onReject('Rejected by user').catch((e) => setError(e instanceof Error ? e.message : 'reject failed')).finally(() => setBusy(false))
          }}
          disabled={busy}
          className="px-3 py-1"
          style={{ background: 'none', color: 'var(--s-critical)', border: '1px solid var(--s-critical)', borderRadius: 'var(--s-rs)', fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          Reject
        </button>
      </div>
      {error && <div className="mt-1.5" style={{ fontSize: 11, color: 'var(--s-critical)' }}>{error}</div>}
    </div>
  )
}
