import type { StellarNotification, StellarSolve, StellarSolveProgress } from '../../../types/stellar'
import { getSolveStatus } from '../lib/derive'
import type { GroupConfig } from './types'

/** Computes the live subtitle for a notification group. For "critical", this reflects
 *  how many auto-solves are actually running, paused, or already resolved — never the
 *  static "Auto-investigation in progress" placeholder shown when nothing is happening. */
export function getGroupSubtitle(
  group: GroupConfig,
  items: StellarNotification[] = [],
  solves: StellarSolve[] = [],
  solveProgress: Record<string, StellarSolveProgress> = {},
): string {
  if (group.key === 'critical') {
    let active = 0, resolved = 0, escalated = 0
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
    return parts.length > 0 ? parts.join(' · ') : 'Awaiting Stellar pickup'
  }
  if (group.key === 'warning') {
    return 'Click investigate or dismiss'
  }
  return group.subtitle
}
