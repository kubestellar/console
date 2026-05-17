import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { StellarActivity, StellarNotification } from '../../types/stellar'
import { useStellar } from '../../hooks/useStellar'
import { EventsPanel } from './EventsPanel'
import type { PendingAction } from './EventCard'
import { ChatPanel } from './ChatPanel'
import { StellarHeader } from './StellarHeader'
import { TasksPanel } from './TasksPanel'
import { WatchesPanel } from './WatchesPanel'
import { RecommendedTasksPanel } from './RecommendedTasksPanel'
import { StellarActivityPanel } from './StellarActivityPanel'
import { AuditPage } from './AuditPage'
import {
  STELLAR_NAVIGATION_EVENT,
  STELLAR_SECTION_ID,
  getStellarSectionIdFromHash,
  type StellarSectionId,
} from './navigation'

import '../../styles/stellar.css'

// StellarPage — full-route view of the Stellar PA.
// Reuses the same panels as the sidebar but in a roomier 3-column layout
// so the user can see events, chat, and watches/tasks at once.
function normalizeActivitySeverity(severity: StellarActivity['severity']): StellarNotification['severity'] {
  if (severity === 'critical' || severity === 'warning') {
    return severity
  }
  return 'info'
}

function buildActivityDedupeKey(entry: StellarActivity): string | undefined {
  if (entry.cluster && entry.namespace && entry.workload) {
    return `ev:${entry.cluster}:${entry.namespace}:${entry.workload}`
  }
  return entry.eventId || entry.id
}

function buildDetailNotificationFromActivity(eventId: string, entry: StellarActivity): StellarNotification {
  return {
    id: eventId,
    type: 'event',
    severity: normalizeActivitySeverity(entry.severity),
    title: entry.title,
    body: entry.detail || entry.title,
    cluster: entry.cluster,
    namespace: entry.namespace,
    dedupeKey: buildActivityDedupeKey(entry),
    read: true,
    createdAt: entry.ts,
  }
}

export function StellarPage() {
  const location = useLocation()
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [detailNotification, setDetailNotification] = useState<StellarNotification | null>(null)
  const overviewRef = useRef<HTMLDivElement | null>(null)
  const activityRef = useRef<HTMLDivElement | null>(null)
  const eventsRef = useRef<HTMLDivElement | null>(null)
  const chatRef = useRef<HTMLDivElement | null>(null)
  const auditRef = useRef<HTMLDivElement | null>(null)
  const {
    isConnected,
    unreadCount,
    state,
    notifications,
    pendingActions,
    tasks,
    watches,
    nudge,
    catchUp,
    providerSession,
    setProviderSession,
    acknowledgeNotification,
    dismissAllNotifications,
    approveAction,
    rejectAction,
    updateTaskStatus,
    createTask,
    dismissNudge,
    resolveWatch,
    dismissWatch,
    snoozeWatch,
    dismissCatchUp,
    solves,
    solveProgress,
    startSolve,
    activity,
  } = useStellar()

  const focusSection = useCallback((sectionId: StellarSectionId) => {
    const target = (() => {
      switch (sectionId) {
        case STELLAR_SECTION_ID.ACTIVITY:
          return activityRef.current
        case STELLAR_SECTION_ID.EVENTS:
          return eventsRef.current
        case STELLAR_SECTION_ID.CHAT:
          return chatRef.current
        case STELLAR_SECTION_ID.AUDIT:
          return auditRef.current
        case STELLAR_SECTION_ID.OVERVIEW:
        default:
          return overviewRef.current
      }
    })()

    if (!target) {
      return
    }

    target.focus({ preventScroll: true })
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [])

  useEffect(() => {
    const sectionId = getStellarSectionIdFromHash(location.hash)
    if (!sectionId) {
      return
    }

    const handle = window.requestAnimationFrame(() => focusSection(sectionId))
    return () => window.cancelAnimationFrame(handle)
  }, [focusSection, location.hash])

  useEffect(() => {
    const handleNavigation = (event: Event) => {
      const customEvent = event as CustomEvent<{ sectionId?: StellarSectionId }>
      if (customEvent.detail?.sectionId) {
        focusSection(customEvent.detail.sectionId)
      }
    }

    window.addEventListener(STELLAR_NAVIGATION_EVENT, handleNavigation as EventListener)
    return () => window.removeEventListener(STELLAR_NAVIGATION_EVENT, handleNavigation as EventListener)
  }, [focusSection])

  const handleOpenActivityEvent = useCallback((eventId: string, entry: StellarActivity) => {
    const found = (notifications || []).find(notification => notification.id === eventId)
    setDetailNotification(found ?? buildDetailNotificationFromActivity(eventId, entry))
  }, [notifications])

  return (
    <div
      ref={overviewRef}
      id={STELLAR_SECTION_ID.OVERVIEW}
      tabIndex={-1}
      data-testid="stellar-section-overview"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 320px) 1fr 1fr 1fr',
        gridTemplateRows: '1fr',
        gap: 0,
        height: 'calc(100vh - 56px)', // leave room for top nav
        background: 'var(--s-bg, #0a0e14)',
        fontFamily: 'var(--s-sans)',
        color: 'var(--s-text)',
        overflow: 'hidden',
      }}
    >
      {/* Left rail — header + watches + tasks */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--s-surface)',
          borderRight: '1px solid var(--s-border)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <StellarHeader
          isConnected={isConnected}
          unreadCount={unreadCount}
          clusterCount={state?.clustersWatching?.length ?? 0}
          onCollapse={() => { /* no-op on page view */ }}
        />
        <div
          style={{
            borderBottom: '2px solid var(--s-border)',
            flexShrink: 0,
          }}
        >
          <TasksPanel
            tasks={tasks}
            expanded={tasksExpanded}
            onToggle={() => setTasksExpanded(v => !v)}
            onStatusChange={(id, status) => { void updateTaskStatus(id, status) }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div
            ref={activityRef}
            id={STELLAR_SECTION_ID.ACTIVITY}
            tabIndex={-1}
            data-testid="stellar-section-activity"
          >
            <StellarActivityPanel
              activity={activity}
              onOpenEvent={handleOpenActivityEvent}
            />
          </div>
          <RecommendedTasksPanel createTask={createTask} />
          <WatchesPanel
            watches={watches}
            allNotifications={notifications}
            solves={solves}
            onResolve={(id) => { void resolveWatch(id) }}
            onDismiss={(id) => { void dismissWatch(id) }}
            onSnooze={(id, minutes) => { void snoozeWatch(id, minutes) }}
            onAction={(prompt, action) => {
              setChatInput(prompt)
              setPendingAction(action ?? null)
            }}
          />
        </div>
      </div>

      {/* Middle column — events */}
      <div
        ref={eventsRef}
        id={STELLAR_SECTION_ID.EVENTS}
        tabIndex={-1}
        data-testid="stellar-section-events"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRight: '1px solid var(--s-border)',
          background: 'var(--s-surface)',
        }}
      >
        <EventsPanel
          notifications={notifications}
          pendingActions={pendingActions}
          acknowledgeNotification={acknowledgeNotification}
          dismissAllNotifications={dismissAllNotifications}
          approveAction={approveAction}
          rejectAction={rejectAction}
          solves={solves}
          solveProgress={solveProgress}
          startSolve={startSolve}
          detailNotification={detailNotification}
          setDetailNotification={setDetailNotification}
          onRollback={(prompt) => { setChatInput(prompt); setPendingAction(null) }}
          onAction={(prompt, action) => {
            setChatInput(prompt)
            setPendingAction(action ?? null)
          }}
        />
      </div>

      {/* Right column — chat */}
      <div
        ref={chatRef}
        id={STELLAR_SECTION_ID.CHAT}
        tabIndex={-1}
        data-testid="stellar-section-chat"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--s-surface)',
        }}
      >
        <ChatPanel
          providerSession={providerSession}
          onProviderChange={setProviderSession}
          nudge={nudge}
          onDismissNudge={dismissNudge}
          catchUp={catchUp}
          onDismissCatchUp={dismissCatchUp}
          initialInput={chatInput}
          onInputConsumed={() => setChatInput('')}
          pendingAction={pendingAction}
          onActionConsumed={() => setPendingAction(null)}
          createTask={(title, description, source) => createTask(title, description, source)}
        />
      </div>

      {/* Audit column — audit log */}
      <div
        ref={auditRef}
        id={STELLAR_SECTION_ID.AUDIT}
        tabIndex={-1}
        data-testid="stellar-section-audit"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderLeft: '1px solid var(--s-border)',
          background: 'var(--s-surface)',
          overflowY: 'auto',
        }}
      >
        <AuditPage />
      </div>
    </div>
  )
}
