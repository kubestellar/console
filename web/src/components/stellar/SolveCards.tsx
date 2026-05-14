import { useState } from 'react'
import type { StellarSolve, StellarSolveProgress } from '../../types/stellar'

/**
 * SolveProgressCard renders a live, non-dismissable card while a Solve loop is
 * running. Each SSE solve_progress message updates the inline status line so
 * the operator sees Stellar working — the "junior engineer giving updates"
 * feeling, not "the AI vanished into a black box".
 */
export function SolveProgressCard({ progress }: { progress: StellarSolveProgress }) {
  return (
    <div style={{
      borderLeft: '3px solid var(--s-info)',
      background: 'var(--s-surface-2)',
      border: '1px solid var(--s-border)',
      borderRadius: 'var(--s-r)',
      padding: '8px 10px',
      marginBottom: 4,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, height: 2, width: '100%',
        background: 'linear-gradient(90deg, transparent, var(--s-info), transparent)',
        animation: 'stellar-pulse 1.6s linear infinite',
      }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-info)',
        }}>✦ Solving</span>
        <span style={{ fontSize: 11, color: 'var(--s-text-muted)', fontFamily: 'var(--s-mono)' }}>
          step: {progress.step}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--s-text-dim)' }}>
          {progress.actionsTaken} action{progress.actionsTaken === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--s-text)', marginTop: 4, lineHeight: 1.4 }}>
        {progress.message}
      </div>
    </div>
  )
}

/**
 * SolveEscalatedCard renders a Solve that ended in escalation or exhaustion.
 * Collapsed: one-line summary. Expanded: counts + raw summary. Dismissable
 * because once acknowledged the user owns it now, not Stellar.
 */
export function SolveEscalatedCard({ solve, onDismiss }: {
  solve: StellarSolve
  onDismiss?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isExhausted = solve.status === 'exhausted'
  const color = isExhausted ? 'var(--s-warning)' : 'var(--s-warning)'
  const tag = isExhausted ? '⏸ Paused at budget' : '⚠ Escalated'
  const limitNote = solve.limitHit ? ` (limit hit: ${solve.limitHit})` : ''
  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      background: 'rgba(227,179,65,0.05)',
      border: '1px solid rgba(227,179,65,0.25)',
      borderRadius: 'var(--s-r)',
      padding: '8px 10px',
      marginBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 9, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color,
        }}>{tag}</span>
        <span style={{ fontSize: 11, color: 'var(--s-text-muted)', fontFamily: 'var(--s-mono)' }}>
          {solve.cluster}/{solve.namespace}/{solve.workload}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--s-text-muted)' }}
        >{expanded ? '▼' : '▶'}</button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            title="Dismiss"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--s-text-dim)' }}
          >✕</button>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--s-text)', marginTop: 4, lineHeight: 1.4 }}>
        {solve.summary}{limitNote}
      </div>
      {expanded && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--s-text-muted)', fontFamily: 'var(--s-mono)' }}>
          <div>actions taken: {solve.actionsTaken}</div>
          <div>started: {new Date(solve.startedAt).toLocaleString()}</div>
          {solve.endedAt && <div>ended: {new Date(solve.endedAt).toLocaleString()}</div>}
          {solve.error && <div style={{ color: 'var(--s-warning)' }}>error: {solve.error}</div>}
        </div>
      )}
    </div>
  )
}
