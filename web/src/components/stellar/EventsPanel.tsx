import { useMemo, useRef, useState } from 'react'
import type { StellarAction, StellarNotification, StellarSolve, StellarSolveProgress } from '../../types/stellar'
import { EventModal } from './EventModal'
import type { PendingAction } from './EventCard'
import { BatchMonitorModal } from './BatchMonitorModal'
import { EventsPanelHeader } from './EventsPanelHeader'
import { EventsPanelList } from './EventsPanelList'
import { getSolveStatus } from './lib/derive'

const EVENTS_PANEL_LAYOUT_STYLE = { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } as const

interface EventsPanelProps {
  notifications: StellarNotification[]
  pendingActions: StellarAction[]
  acknowledgeNotification: (id: string) => Promise<void>
  dismissAllNotifications: () => Promise<void>
  approveAction: (id: string, confirmToken?: string) => Promise<void>
  rejectAction: (id: string, reason: string) => Promise<void>
  solves?: StellarSolve[]
  solveProgress?: Record<string, StellarSolveProgress>
  startSolve?: (eventID: string) => Promise<unknown>
  detailNotification?: StellarNotification | null
  setDetailNotification?: (n: StellarNotification | null) => void
  onRollback?: (prompt: string) => void
  onAction?: (prompt: string, action?: PendingAction) => void
}

export function EventsPanel({
  notifications,
  pendingActions,
  acknowledgeNotification,
  dismissAllNotifications,
  approveAction,
  rejectAction,
  solves = [],
  solveProgress = {},
  startSolve,
  detailNotification: detailNotificationProp,
  setDetailNotification: setDetailNotificationProp,
  onRollback,
  onAction,
}: EventsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [detailLocal, setDetailLocal] = useState<StellarNotification | null>(null)
  const detailNotification = detailNotificationProp !== undefined ? detailNotificationProp : detailLocal
  const setDetailNotification = setDetailNotificationProp ?? setDetailLocal

  const [batchMonitorOpen, setBatchMonitorOpen] = useState(false)
  const [selectedBatchTimestamp, setSelectedBatchTimestamp] = useState<string | null>(null)

  const digest = useMemo(() => {
    return (notifications || []).find(n => n.type === 'digest' && !n.read) || null
  }, [notifications])

  const terminalSolves = useMemo(() => {
    return (solves || []).filter(s => s.status === 'escalated' || s.status === 'exhausted').slice(0, 5)
  }, [solves])

  const activeProgress = useMemo(() => Object.values(solveProgress || {}), [solveProgress])

  const currentBatch = useMemo(() => {
    if (activeProgress.length === 0) return null

    const batchTimestamps = new Set<string>()
    for (const progress of activeProgress) {
      const notification = (notifications || []).find(n => n.id === progress.eventId)
      if (notification?.batchTimestamp) {
        batchTimestamps.add(notification.batchTimestamp)
      }
    }

    if (batchTimestamps.size === 1) {
      const batchTimestamp = Array.from(batchTimestamps)[0]
      const batchEvents = (notifications || []).filter(n => n.batchTimestamp === batchTimestamp)
      const solving = batchEvents.filter(n => solveProgress[n.id]).length

      return {
        timestamp: batchTimestamp,
        totalEvents: batchEvents.length,
        solvingCount: solving,
      }
    }

    return null
  }, [activeProgress, notifications, solveProgress])

  const { unreadCount, groups, stellarResolved, hasAny } = useMemo(() => {
    const unreadItems = notifications.filter(n => !n.read)
    const readItems = notifications
      .filter(n => n.read)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const isStellarResolution = (n: StellarNotification) =>
      n.type === 'action' && (
        n.title.startsWith('Stellar auto-fixed') ||
        n.title.startsWith('Stellar auto-fix failed') ||
        n.title.startsWith('Action completed')
      )

    const stellarActed: StellarNotification[] = []
    const remainingUnread: StellarNotification[] = []
    for (const n of unreadItems) {
      if (isStellarResolution(n)) stellarActed.push(n)
      else remainingUnread.push(n)
    }
    for (const n of readItems) {
      if (isStellarResolution(n)) stellarActed.push(n)
    }
    stellarActed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const byKey: Record<'critical' | 'warning' | 'info', StellarNotification[]> = { critical: [], warning: [], info: [] }
    for (const n of remainingUnread) {
      const key = (n.severity === 'critical' || n.severity === 'warning' || n.severity === 'info') ? n.severity : 'info'
      byKey[key].push(n)
    }
    for (const key of Object.keys(byKey) as Array<'critical' | 'warning' | 'info'>) {
      byKey[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }

    return {
      unreadCount: unreadItems.length,
      groups: byKey,
      stellarResolved: stellarActed,
      hasAny: notifications.length > 0,
    }
  }, [notifications])

  return (
    <div style={EVENTS_PANEL_LAYOUT_STYLE}>
      <EventsPanelHeader
        notifications={notifications}
        unreadCount={unreadCount}
        pendingActions={pendingActions}
        dismissAllNotifications={dismissAllNotifications}
        approveAction={approveAction}
        rejectAction={rejectAction}
      />

      <div
        ref={scrollRef}
        className="s-scroll flex min-h-0 flex-1 flex-col px-1 py-2"
        style={{ overflowY: 'auto' }}
      >
        <EventsPanelList
          notifications={notifications}
          digest={digest}
          currentBatch={currentBatch}
          activeProgress={activeProgress}
          terminalSolves={terminalSolves}
          groups={groups}
          stellarResolved={stellarResolved}
          solves={solves}
          solveProgress={solveProgress}
          hasAny={hasAny}
          acknowledgeNotification={acknowledgeNotification}
          setDetailNotification={setDetailNotification}
          startSolve={startSolve}
          onRollback={onRollback}
          onAction={onAction}
          onOpenBatch={(timestamp) => {
            setSelectedBatchTimestamp(timestamp)
            setBatchMonitorOpen(true)
          }}
        />
      </div>

      {detailNotification && (
        <EventModal
          notification={detailNotification}
          allNotifications={notifications}
          pendingActions={pendingActions}
          solveStatus={getSolveStatus(detailNotification, solves, solveProgress)}
          solves={solves}
          onClose={() => setDetailNotification(null)}
          onAction={onAction}
        />
      )}

      {batchMonitorOpen && selectedBatchTimestamp && (
        <BatchMonitorModal
          batchTimestamp={selectedBatchTimestamp}
          notifications={notifications}
          solves={solves}
          solveProgress={solveProgress}
          onClose={() => {
            setBatchMonitorOpen(false)
            setSelectedBatchTimestamp(null)
          }}
        />
      )}
    </div>
  )
}
