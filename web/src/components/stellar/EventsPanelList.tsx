import { useTranslation } from 'react-i18next'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import type { PendingAction } from './EventCard'
import { EventCard } from './EventCard'
import { DigestCard } from './DigestCard'
import { SolveProgressCard, SolveEscalatedCard } from './SolveCards'
import { countSolveAttempts, getSolveStatus } from './lib/derive'

interface GroupConfig {
  key: 'critical' | 'warning' | 'info'
  label: string
  subtitle: string
  color: string
  background: string
}

const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: 'critical',
    label: 'Critical alerts',
    subtitle: 'Auto-investigation in progress',
    color: 'var(--s-critical)',
    background: 'rgba(229,73,73,0.06)',
  },
  {
    key: 'warning',
    label: 'High priority',
    subtitle: 'Investigation complete, awaiting input',
    color: 'var(--s-warning)',
    background: 'rgba(227,179,65,0.05)',
  },
  {
    key: 'info',
    label: 'Info',
    subtitle: 'On-demand investigation',
    color: 'var(--s-info)',
    background: 'transparent',
  },
]

const FLEX_SPACER_STYLE = { flex: 1 } as const

interface BatchSummary {
  timestamp: string
  totalEvents: number
  solvingCount: number
}

interface EventsPanelListProps {
  notifications: StellarNotification[]
  digest: StellarNotification | null
  currentBatch: BatchSummary | null
  activeProgress: StellarSolveProgress[]
  terminalSolves: StellarSolve[]
  groups: Record<'critical' | 'warning' | 'info', StellarNotification[]>
  stellarResolved: StellarNotification[]
  solves: StellarSolve[]
  solveProgress: Record<string, StellarSolveProgress>
  hasAny: boolean
  acknowledgeNotification: (id: string) => Promise<void>
  setDetailNotification: (n: StellarNotification | null) => void
  startSolve?: (eventID: string) => Promise<unknown>
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string, action?: PendingAction) => void
  onOpenBatch: (timestamp: string) => void
}

export function EventsPanelList({
  notifications,
  digest,
  currentBatch,
  activeProgress,
  terminalSolves,
  groups,
  stellarResolved,
  solves,
  solveProgress,
  hasAny,
  acknowledgeNotification,
  setDetailNotification,
  startSolve,
  onRollback,
  onAction,
  onOpenBatch,
}: EventsPanelListProps) {
  const { t } = useTranslation()

  return (
    <>
      {digest && (
        <DigestCard
          notification={digest}
          solves={solves}
          onDismiss={() => { void acknowledgeNotification(digest.id) }}
        />
      )}

      {currentBatch && (
        <button
          onClick={() => onOpenBatch(currentBatch.timestamp)}
          className="mx-1 mb-2.5 mt-1.5 px-3 py-2.5"
          style={{
            borderLeft: '3px solid var(--s-info)',
            background: 'rgba(99,150,237,0.08)',
            border: '1px solid rgba(99,150,237,0.3)',
            borderRadius: 'var(--s-r)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            width: 'calc(100% - 8px)',
            textAlign: 'left',
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(99,150,237,0.12)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(99,150,237,0.08)'
          }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, height: 2, width: '100%',
            background: 'linear-gradient(90deg, transparent, var(--s-info), transparent)',
            animation: 'stellar-pulse 1.6s linear infinite',
          }} />
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14 }}>⊙</span>
            <span
              className="font-mono text-xs"
              style={{
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--s-info)',
              }}
            >{t('stellar.batch.processingBatch')}</span>
            <div style={FLEX_SPACER_STYLE} />
            <span style={{
              fontFamily: 'var(--s-mono)',
              fontSize: 10,
              color: 'var(--s-text-muted)',
            }}>
              {currentBatch.solvingCount}/{currentBatch.totalEvents} solving
            </span>
            <span style={{ fontSize: 11, color: 'var(--s-text-dim)' }}>→</span>
          </div>
          <div className="mt-1 text-xs leading-normal" style={{ color: 'var(--s-text)' }}>
            {t('stellar.batch.viewBatchMonitor')} — {currentBatch.solvingCount} event{currentBatch.solvingCount === 1 ? '' : 's'} actively solving
          </div>
        </button>
      )}

      {activeProgress.length > 0 && (
        <div className="mx-1 mb-2 mt-1">
          {activeProgress.map(p => (
            <SolveProgressCard key={p.solveId + p.eventId} progress={p} />
          ))}
        </div>
      )}

      {terminalSolves.length > 0 && (
        <div className="mx-1 mb-2">
          {terminalSolves.map(s => (
            <SolveEscalatedCard key={s.id} solve={s} />
          ))}
        </div>
      )}

      {!hasAny && activeProgress.length === 0 && terminalSolves.length === 0 && !digest && <EmptyState icon="✦" text="No events — all clear" />}

      {GROUP_CONFIGS.map(group => {
        const items = groups[group.key]
        if (items.length === 0) return null

        let subtitle = group.subtitle
        if (group.key === 'critical') {
          let active = 0
          let resolved = 0
          let escalated = 0
          for (const n of items) {
            const status = getSolveStatus(n, solves, solveProgress)
            if (!status) continue
            if (status.isActive) active++
            else if (status.phase === 'resolved') resolved++
            else if (status.phase === 'escalated' || status.phase === 'exhausted') escalated++
          }
          const parts: string[] = []
          if (active > 0) parts.push(`${active} solving`)
          if (resolved > 0) parts.push(`${resolved} resolved`)
          if (escalated > 0) parts.push(`${escalated} needs you`)
          subtitle = parts.length > 0
            ? parts.join(' · ')
            : 'Awaiting Stellar pickup'
        } else if (group.key === 'warning') {
          subtitle = 'Click investigate or dismiss'
        }

        return (
          <Group key={group.key} config={group} count={items.length} subtitle={subtitle}>
            {items.map(notification => (
              <EventCard
                key={notification.id}
                notification={notification}
                allNotifications={notifications}
                solveStatus={getSolveStatus(notification, solves, solveProgress)}
                attemptCount={countSolveAttempts(notification, solves)}
                onSolve={startSolve}
                onDismiss={() => { void acknowledgeNotification(notification.id) }}
                onRollback={onRollback}
                onAction={onAction}
                onOpenDetail={setDetailNotification}
              />
            ))}
          </Group>
        )
      })}

      {stellarResolved.length > 0 && (
        <div className="mt-2 px-1">
          <div className="mb-1 flex items-baseline gap-2 px-1.5 py-1" style={{
            background: 'rgba(63,185,80,0.06)',
            borderLeft: '3px solid var(--s-success)',
            borderRadius: 'var(--s-rs)',
          }}>
            <span style={{
              fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--s-success)',
            }}>✦ Resolved by Stellar</span>
            <span style={{
              fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
              color: 'var(--s-success)', opacity: 0.7,
            }}>{stellarResolved.length}</span>
            <span style={{ fontSize: 10, color: 'var(--s-text-dim)', fontStyle: 'italic' }}>
              Fixed without waiting for approval
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {stellarResolved.map(notification => (
              <EventCard
                key={notification.id}
                notification={notification}
                allNotifications={notifications}
                onDismiss={() => { void acknowledgeNotification(notification.id) }}
                onRollback={onRollback}
                onAction={onAction}
                onOpenDetail={setDetailNotification}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function Group({
  config, count, subtitle, children,
}: { config: GroupConfig; count: number; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 px-1">
      <div className="mb-1 flex items-baseline gap-2 px-1.5 py-1" style={{
        background: config.background,
        borderLeft: `3px solid ${config.color}`,
        borderRadius: 'var(--s-rs)',
      }}>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: config.color,
        }}>{config.label}</span>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
          color: config.color, opacity: 0.7,
        }}>{count}</span>
        <span style={{ fontSize: 10, color: 'var(--s-text-dim)', fontStyle: 'italic' }}>{subtitle ?? config.subtitle}</span>
      </div>
      <div className="flex flex-col gap-1">
        {children}
      </div>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2" style={{ color: 'var(--s-text-dim)' }}>
      <span style={{ fontSize: 22, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{text}</span>
    </div>
  )
}
