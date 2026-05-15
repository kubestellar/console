import { useState } from 'react'
import type { StellarActivity } from '../../types/stellar'

/**
 * StellarActivityPanel — Stellar's first-person activity log.
 *
 * Distinct from the events column (which is "things the cluster did") and the
 * chat panel (which is "things you asked Stellar"). This is "things Stellar
 * did, on its own, without being asked." Every evaluated event, every solve
 * decision, every auto-fix outcome lands here, newest first.
 *
 * The operator should be able to glance at this list and answer "what has
 * Stellar been up to?" without parsing toasts or reading the events column.
 */

interface Props {
  activity: StellarActivity[]
  /** Called when the operator clicks a row that carries an eventId. Wires the
   *  log into the events panel — click a "Tried RestartDeployment" log entry
   *  and the matching event card's modal opens with the full attempt detail. */
  onOpenEvent?: (eventId: string) => void
}

const KIND_LABEL: Record<string, { label: string; icon: string; color: string }> = {
  // Autonomous-solve narrative beats (Stellar v2):
  critical_event:      { label: 'Critical event',   icon: '🚨', color: 'var(--s-critical)' },
  investigating:       { label: 'Investigating',    icon: '🔍', color: 'var(--s-info)' },
  root_cause:          { label: 'Root cause',       icon: '🧠', color: 'var(--s-info)' },
  solving:             { label: 'Solving',          icon: '🔧', color: 'var(--s-info)' },
  // Legacy / non-autonomous beats:
  evaluated:           { label: 'Noticed',          icon: '👁',  color: 'var(--s-text-muted)' },
  diagnosed:           { label: 'Diagnosed',        icon: '🧠', color: 'var(--s-info)' },
  decided_solve:       { label: 'Decided to solve', icon: '✦',  color: 'var(--s-info)' },
  decided_skip:        { label: 'Decided to skip',  icon: '◦',  color: 'var(--s-text-dim)' },
  mission_triggered:   { label: 'AI mission',       icon: '✦',  color: 'var(--s-info)' },
  auto_fixed:          { label: 'Auto-fixed',       icon: '✓',  color: 'var(--s-success)' },
  auto_fix_failed:     { label: 'Auto-fix failed',  icon: '✕',  color: 'var(--s-critical)' },
  solve_started:       { label: 'Solving started',  icon: '▶',  color: 'var(--s-info)' },
  solve_resolved:      { label: 'Resolved',         icon: '✓',  color: 'var(--s-success)' },
  solve_escalated:     { label: 'Escalated to you', icon: '⚠',  color: 'var(--s-warning)' },
  solve_exhausted:     { label: 'Paused at budget', icon: '⏸',  color: 'var(--s-warning)' },
  approval_superseded: { label: 'Superseded',       icon: '↻',  color: 'var(--s-success)' },
  approval_bumped:     { label: 'Bumped approval',  icon: '↑',  color: 'var(--s-warning)' },
}

function describeKind(kind: string) {
  return KIND_LABEL[kind] ?? { label: kind, icon: '·', color: 'var(--s-text-muted)' }
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function StellarActivityPanel({ activity, onOpenEvent }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [filter, setFilter] = useState<'all' | 'actions'>('all')

  // "Actions" filter hides the noisy "evaluated" rows (every event Stellar sees)
  // so the operator gets only material moves: diagnoses, decisions, mission
  // triggers, terminal outcomes. "All" is the full log.
  const visible = filter === 'all'
    ? activity
    : activity.filter(a => a.kind !== 'evaluated' && a.kind !== 'diagnosed')

  return (
    <div style={{ borderBottom: '1px solid var(--s-border)', flexShrink: 0 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--s-text-muted)',
        }}>
          Stellar log
        </span>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10,
          color: 'var(--s-info)', background: 'rgba(56,139,253,0.1)',
          border: '1px solid rgba(56,139,253,0.25)',
          borderRadius: 10, padding: '0 5px',
        }}>
          {activity.length}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--s-text-dim)' }}>{collapsed ? '▾' : '▴'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 8px 8px' }}>
          <div style={{
            display: 'flex', gap: 4, marginBottom: 6, paddingLeft: 4,
          }}>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
            <FilterChip active={filter === 'actions'} onClick={() => setFilter('actions')}>Actions only</FilterChip>
          </div>

          {visible.length === 0 ? (
            <div style={{
              fontSize: 11, color: 'var(--s-text-dim)',
              fontStyle: 'italic', padding: '8px 6px', textAlign: 'center',
            }}>
              Stellar is watching. Nothing to report yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {visible.slice(0, 60).map(entry => {
                const k = describeKind(entry.kind)
                // A row is clickable iff it carries an eventId AND a handler
                // was wired by the parent. Other entries (e.g., stale-approval
                // sweeps with no event) render as plain rows.
                const clickable = !!(entry.eventId && onOpenEvent)
                const baseStyle: React.CSSProperties = {
                  display: 'flex', alignItems: 'baseline', gap: 6,
                  padding: '4px 6px', borderRadius: 'var(--s-rs)',
                  borderLeft: `2px solid ${k.color}`,
                  background: 'var(--s-surface-2)',
                  fontSize: 11, lineHeight: 1.4,
                  border: 'none', textAlign: 'left', width: '100%',
                  cursor: clickable ? 'pointer' : 'default',
                  font: 'inherit', color: 'inherit',
                }
                const body = (
                  <>
                    <span style={{ fontFamily: 'var(--s-mono)', color: 'var(--s-text-dim)', minWidth: 52, fontSize: 10 }}>
                      {formatRelative(entry.ts)}
                    </span>
                    <span style={{ color: k.color, minWidth: 14, textAlign: 'center' }}>{k.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600, color: 'var(--s-text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {entry.title}
                      </div>
                      {entry.detail && (
                        <div style={{
                          fontSize: 10, color: 'var(--s-text-muted)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {entry.detail}
                        </div>
                      )}
                    </div>
                    {clickable && (
                      <span style={{ fontSize: 10, color: 'var(--s-text-dim)', fontFamily: 'var(--s-mono)', flexShrink: 0 }}>
                        details →
                      </span>
                    )}
                  </>
                )
                return clickable ? (
                  <button
                    key={entry.id}
                    type="button"
                    title={`${entry.detail ?? ''}\n\nClick to open the event in the events column.`}
                    onClick={() => entry.eventId && onOpenEvent?.(entry.eventId)}
                    style={baseStyle}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={entry.id} title={entry.detail} style={baseStyle}>
                    {body}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(56,139,253,0.12)' : 'transparent',
        border: `1px solid ${active ? 'var(--s-info)' : 'var(--s-border-muted)'}`,
        color: active ? 'var(--s-info)' : 'var(--s-text-muted)',
        fontFamily: 'var(--s-mono)', fontSize: 10,
        padding: '1px 8px', borderRadius: 10, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
