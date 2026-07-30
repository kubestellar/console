import { useEffect, useRef, useState } from 'react'
import type { StellarSolve } from '../types/stellar'

/**
 * Durability monitor hook for resolved_monitored solves.
 * Tracks recheck countdowns and triggers UI updates when recheckAt approaches.
 */

const DEFAULT_RECHECK_INTERVAL_MS = 5 * 60_000 // 5 minutes

interface MonitorState {
  solveId: string
  nextRecheckAt: number
  countdown: number
}

export function useDurabilityMonitor(solves: StellarSolve[]) {
  const [monitoredSolves, setMonitoredSolves] = useState<Record<string, MonitorState>>({})
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    const monitored: Record<string, MonitorState> = {}
    const now = Date.now()

    for (const solve of solves || []) {
      if (solve.status === 'resolved_monitored' && solve.nextRecheckAt) {
        const nextRecheckAt = new Date(solve.nextRecheckAt).getTime()
        const countdown = Math.max(0, nextRecheckAt - now)
        monitored[solve.id] = {
          solveId: solve.id,
          nextRecheckAt,
          countdown,
        }
      }
    }

    setMonitoredSolves(monitored)
  }, [solves])

  // Update countdown every second for monitored solves
  useEffect(() => {
    if (Object.keys(monitoredSolves).length === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = window.setInterval(() => {
      const now = Date.now()
      setMonitoredSolves(prev => {
        const updated: Record<string, MonitorState> = {}
        for (const [id, state] of Object.entries(prev)) {
          const countdown = Math.max(0, state.nextRecheckAt - now)
          updated[id] = { ...state, countdown }
        }
        return updated
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [monitoredSolves])

  return {
    monitoredSolves,
    /** Get the countdown string for a solve (e.g., "2m 30s") */
    getCountdown: (solveId: string): string => {
      const state = monitoredSolves[solveId]
      if (!state || state.countdown === 0) return ''
      const seconds = Math.floor(state.countdown / 1000)
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`
      }
      return `${remainingSeconds}s`
    },
    /** Check if a solve is being monitored */
    isMonitored: (solveId: string): boolean => {
      return !!monitoredSolves[solveId]
    },
  }
}

/**
 * Calculate the default next recheck time from now.
 */
export function getDefaultNextRecheckAt(): Date {
  return new Date(Date.now() + DEFAULT_RECHECK_INTERVAL_MS)
}

/**
 * Format a countdown in milliseconds to a human-readable string.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  return `${seconds}s`
}
