import { useMemo } from 'react'
import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../../types/stellar'
import type { CurrentBatch } from './types'

interface UseEventsPanelDataArgs {
  notifications: StellarNotification[]
  solves: StellarSolve[]
  solveProgress: Record<string, StellarSolveProgress>
}

/** Derives all grouped/aggregated view state for the EventsPanel — the active digest,
 *  in-flight solve progress, current batch banner, and the critical/warning/info
 *  notification groups — keeping the view component focused on rendering. */
export function useEventsPanelData({ notifications, solves, solveProgress }: UseEventsPanelDataArgs) {
  // Pull the latest digest notification (if any) so we can pin it at the top.
  const digest = useMemo(() => {
    return (notifications || []).find(n => n.type === 'digest' && !n.read) || null
  }, [notifications])

  // Stellar v2: derive escalated/exhausted solves that don't have a live
  // progress entry — these are completed terminal states the operator needs
  // to acknowledge.
  const terminalSolves = useMemo(() => {
    return (solves || []).filter(s => s.status === 'escalated' || s.status === 'exhausted')
      .slice(0, 5)
  }, [solves])

  const activeProgress = useMemo(() => Object.values(solveProgress || {}), [solveProgress])

  // Detect current batch being processed
  const currentBatch = useMemo<CurrentBatch | null>(() => {
    if (activeProgress.length === 0) return null

    // Find the batch timestamp from events being solved
    const batchTimestamps = new Set<string>()
    for (const progress of activeProgress) {
      const notification = (notifications || []).find(n => n.id === progress.eventId)
      if (notification?.batchTimestamp) {
        batchTimestamps.add(notification.batchTimestamp)
      }
    }

    // If we have exactly one batch being processed, show the banner
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

  const { unread, groups, stellarResolved, hasAny } = useMemo(() => {
    const unreadItems = notifications.filter(n => !n.read)
    const readItems = notifications.filter(n => n.read)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Pull out "Stellar acted on its own" notifications — both unread and read —
    // into a dedicated band so the user can see at a glance what Stellar did.
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
    const remainingResolved: StellarNotification[] = []
    for (const n of readItems) {
      if (isStellarResolution(n)) stellarActed.push(n)
      else remainingResolved.push(n)
    }
    stellarActed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const byKey: Record<string, StellarNotification[]> = { critical: [], warning: [], info: [] }
    for (const n of remainingUnread) {
      const key = byKey[n.severity] ? n.severity : 'info'
      byKey[key].push(n)
    }
    for (const key of Object.keys(byKey)) {
      byKey[key].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    void remainingResolved // user dismissed — gone from view; see note below
    return {
      unread: unreadItems,
      groups: byKey as Record<'critical' | 'warning' | 'info', StellarNotification[]>,
      stellarResolved: stellarActed,
      hasAny: notifications.length > 0,
    }
  }, [notifications])

  return { digest, terminalSolves, activeProgress, currentBatch, unread, groups, stellarResolved, hasAny }
}
