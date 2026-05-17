import { useEffect, useState } from 'react'
import { stellarApi } from '../../services/stellar'
import type { StellarAuditEntry } from '../../types/stellar'

export function AuditPage() {
  const [entries, setEntries] = useState<StellarAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const ctrl = new AbortController()

    stellarApi.getAuditLog(50, ctrl.signal)
      .then((data) => {
        if (mounted) {
          setEntries(data)
        }
      })
      .catch(() => {
        if (mounted && !ctrl.signal.aborted) {
          setError('Failed to load audit log')
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })

    return () => {
      mounted = false
      ctrl.abort()
    }
  }, [])

  return (
    <div
      className="font-sans"
      style={{
        padding: '20px 24px',
        color: 'var(--s-text)',
        maxWidth: 900,
      }}
    >
      <div
        className="font-mono text-xs"
        style={{
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--s-text-muted)',
          marginBottom: 16,
        }}
      >
        Stellar Audit Log
      </div>

      {loading && (
        <div className="text-xs" style={{ color: 'var(--s-text-dim)' }}>Loading…</div>
      )}
      {error && (
        <div className="text-xs" style={{ color: 'var(--s-critical)' }}>{error}</div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--s-text-dim)' }}>No audit entries yet.</div>
      )}

      {!loading && entries.length > 0 && (
        <table
          className="text-xs"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--s-border)' }}>
              {['Timestamp', 'User', 'Action', 'Entity', 'Cluster', 'Detail'].map(h => (
                <th
                  key={h}
                  className="font-mono text-xs"
                  style={{
                    textAlign: 'left',
                    padding: '4px 8px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--s-text-muted)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--s-border)' }}>
                <td className="font-mono text-xs" style={{ padding: '5px 8px', color: 'var(--s-text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(e.ts).toLocaleString()}
                </td>
                <td style={{ padding: '5px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.userId}
                </td>
                <td className="font-mono text-xs" style={{ padding: '5px 8px' }}>
                  {e.action}
                </td>
                <td className="font-mono text-xs" style={{ padding: '5px 8px' }}>
                  {e.entityType}/{e.entityId.slice(0, 8)}
                </td>
                <td className="text-xs" style={{ padding: '5px 8px', color: 'var(--s-text-muted)' }}>
                  {e.cluster || '—'}
                </td>
                <td className="text-xs" style={{ padding: '5px 8px', color: 'var(--s-text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
