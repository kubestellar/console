import { useEffect, useState } from 'react'
import { stellarApi } from '../../services/stellar'
import type { StellarAuditEntry } from '../../types/stellar'

export function AuditPage() {
  const [entries, setEntries] = useState<StellarAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    stellarApi.getAuditLog(50)
      .then(setEntries)
      .catch(() => setError('Failed to load audit log'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{
      padding: '20px 24px',
      fontFamily: 'var(--s-sans)',
      color: 'var(--s-text)',
      maxWidth: 900,
    }}>
      <div style={{
        fontFamily: 'var(--s-mono)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--s-text-muted)',
        marginBottom: 16,
      }}>
        Stellar Audit Log
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--s-text-dim)' }}>Loading…</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: 'var(--s-critical)' }}>{error}</div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--s-text-dim)' }}>No audit entries yet.</div>
      )}

      {!loading && entries.length > 0 && (
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
        }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--s-border)' }}>
              {['Timestamp', 'User', 'Action', 'Entity', 'Cluster', 'Detail'].map(h => (
                <th key={h} style={{
                  textAlign: 'left',
                  padding: '4px 8px',
                  fontFamily: 'var(--s-mono)',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--s-text-muted)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--s-border)' }}>
                <td style={{ padding: '5px 8px', fontFamily: 'var(--s-mono)', fontSize: 11, color: 'var(--s-text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(e.ts).toLocaleString()}
                </td>
                <td style={{ padding: '5px 8px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.userId}
                </td>
                <td style={{ padding: '5px 8px', fontFamily: 'var(--s-mono)', fontSize: 11 }}>
                  {e.action}
                </td>
                <td style={{ padding: '5px 8px', fontFamily: 'var(--s-mono)', fontSize: 11 }}>
                  {e.entityType}/{e.entityId.slice(0, 8)}
                </td>
                <td style={{ padding: '5px 8px', fontSize: 11, color: 'var(--s-text-muted)' }}>
                  {e.cluster || '—'}
                </td>
                <td style={{ padding: '5px 8px', fontSize: 11, color: 'var(--s-text-dim)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
