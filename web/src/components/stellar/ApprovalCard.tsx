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
    <div style={{ background: 'var(--s-surface-2)', border: '1px solid rgba(227,179,65,0.4)', borderRadius: 'var(--s-r)', padding: '8px 10px', marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--s-text)', marginBottom: 3 }}>{action.description}</div>
      <div style={{ fontFamily: 'var(--s-mono)', fontSize: 10, color: 'var(--s-text-muted)', marginBottom: 8 }}>
        {action.actionType} · {action.cluster}{action.namespace ? `/${action.namespace}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => {
            setBusy(true)
            setError(null)
            onApprove(action.confirmToken).catch((e) => setError(e instanceof Error ? e.message : 'approval failed')).finally(() => setBusy(false))
          }}
          disabled={busy}
          style={{ background: 'var(--s-success)', color: '#0a0e14', border: 'none', borderRadius: 'var(--s-rs)', padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
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
          style={{ background: 'none', color: 'var(--s-critical)', border: '1px solid var(--s-critical)', borderRadius: 'var(--s-rs)', padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          Reject
        </button>
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--s-critical)' }}>{error}</div>}
    </div>
  )
}
