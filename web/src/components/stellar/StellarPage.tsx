import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type { StellarActivity, StellarNotification } from '../../types/stellar'
import { useStellar } from '../../hooks/useStellar'
import { cn } from '../../lib/cn'
import { EventsPanel } from './EventsPanel'
import type { PendingAction } from './EventCard'
import { ChatPanel } from './ChatPanel'
import { StellarHeader } from './StellarHeader'
import { TasksPanel } from './TasksPanel'
import { WatchesPanel } from './WatchesPanel'
import { RecommendedTasksPanel } from './RecommendedTasksPanel'
import { StellarActivityPanel } from './StellarActivityPanel'
import { StellarAuditLogSection } from './StellarAuditLogSection'
import {
  STELLAR_NAVIGATION_EVENT,
  STELLAR_SECTION_ID,
  getStellarSectionIdFromHash,
  type StellarSectionId,
} from './navigation'

import '../../styles/stellar.css'

const APP_TOP_NAV_OFFSET_PX = 56
const SECTION_SCROLL_MARGIN_PX = 80
const EVENTS_CHAT_HEIGHT_CLASS = 'min-h-[50vh] max-h-[50vh]'
const STANDARD_SECTION_MAX_HEIGHT_CLASS = 'max-h-[24rem]'
const SUGGESTIONS_SECTION_MAX_HEIGHT_CLASS = 'max-h-[36rem]'
const SECTION_SHELL_CLASS = 'overflow-hidden rounded-2xl border border-[var(--s-border)] bg-[var(--s-surface)] shadow-lg shadow-black/20'

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
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  const hasActiveWatches = (watches || []).some(watch => watch.status === 'active')

  return (
    <div
      ref={overviewRef}
      id={STELLAR_SECTION_ID.OVERVIEW}
      tabIndex={-1}
      data-testid="stellar-section-overview"
      className="bg-[var(--s-bg)] text-[var(--s-text)]"
      style={{ minHeight: `calc(100vh - ${APP_TOP_NAV_OFFSET_PX}px)` }}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 md:px-6 lg:px-8">
        <div
          className="sticky z-20 bg-[var(--s-bg)]/95 pb-2 backdrop-blur supports-[backdrop-filter]:bg-[var(--s-bg)]/80"
          style={{ top: APP_TOP_NAV_OFFSET_PX }}
        >
          <div className={SECTION_SHELL_CLASS}>
            <StellarHeader
              isConnected={isConnected}
              unreadCount={unreadCount}
              clusterCount={state?.clustersWatching?.length ?? 0}
              showCollapse={false}
            />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div
            ref={eventsRef}
            id={STELLAR_SECTION_ID.EVENTS}
            tabIndex={-1}
            data-testid="stellar-section-events"
            className={cn(SECTION_SHELL_CLASS, EVENTS_CHAT_HEIGHT_CLASS)}
            style={{ scrollMarginTop: SECTION_SCROLL_MARGIN_PX }}
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

          <div
            ref={chatRef}
            id={STELLAR_SECTION_ID.CHAT}
            tabIndex={-1}
            data-testid="stellar-section-chat"
            className={cn(SECTION_SHELL_CLASS, EVENTS_CHAT_HEIGHT_CLASS)}
            style={{ scrollMarginTop: SECTION_SCROLL_MARGIN_PX }}
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
        </div>

        <section className={cn(SECTION_SHELL_CLASS, STANDARD_SECTION_MAX_HEIGHT_CLASS, 'overflow-y-auto s-scroll')}>
          <TasksPanel
            tasks={tasks}
            expanded={tasksExpanded}
            onToggle={() => setTasksExpanded(value => !value)}
            onStatusChange={(id, status) => { void updateTaskStatus(id, status) }}
          />
        </section>

        {hasActiveWatches && (
          <section className={cn(SECTION_SHELL_CLASS, STANDARD_SECTION_MAX_HEIGHT_CLASS, 'overflow-y-auto s-scroll')}>
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
          </section>
        )}

        <section
          ref={activityRef}
          id={STELLAR_SECTION_ID.ACTIVITY}
          tabIndex={-1}
          data-testid="stellar-section-activity"
          className={cn(SECTION_SHELL_CLASS, STANDARD_SECTION_MAX_HEIGHT_CLASS, 'overflow-y-auto s-scroll')}
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN_PX }}
        >
          <StellarActivityPanel
            activity={activity}
            onOpenEvent={handleOpenActivityEvent}
          />
        </section>

        <section className={cn(SECTION_SHELL_CLASS, SUGGESTIONS_SECTION_MAX_HEIGHT_CLASS, 'overflow-y-auto s-scroll')}>
          <RecommendedTasksPanel createTask={createTask} />
        </section>

        <section
          ref={auditRef}
          id={STELLAR_SECTION_ID.AUDIT}
          tabIndex={-1}
          data-testid="stellar-section-audit"
          style={{ scrollMarginTop: SECTION_SCROLL_MARGIN_PX }}
        >
          <StellarAuditLogSection />
        </section>
      </div>
    </div>
  )
}
