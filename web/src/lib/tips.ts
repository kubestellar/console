/**
 * Rotating "Did you know?" tips for the dashboard Getting Started banner.
 *
 * Tips cycle through all entries before repeating. Seen tips are tracked
 * in localStorage so the user always sees a fresh tip on each visit.
 */

import { safeGetJSON, safeSetJSON } from './utils/localStorage'
import { STORAGE_KEY_SEEN_TIPS } from './constants/storage'

export const TIPS: string[] = [
  'You can drag cards to rearrange your dashboard',
  'Try the GPU Reservations calendar for scheduling',
  'Use Cmd+K to search anything in the console',
  'The Arcade has Kubernetes-themed games for breaks',
  'You can create custom dashboards from the sidebar',
  'AI Missions can diagnose and repair cluster issues',
  'Click any card header to expand it full-screen',
  'The RBAC Explorer visualizes cluster permissions',
  'You can export mission results as markdown',
  'Deploy supports multi-cluster rollouts with phased deployment',
  'Try browsing the Marketplace for pre-built mission packs',
  'The Performance Timeline card tracks benchmark trends over time',
  'You can pin frequently-used cards to the top of your dashboard',
  'The global cluster filter in the navbar applies to all cards at once',
  'Token usage breakdown shows which AI features use the most tokens',
  'Right-click any cluster row to see quick actions',
  'The Compliance dashboard shows OPA, Kyverno, and Kubescape policies',
  'You can import and export dashboard layouts as JSON',
]

/**
 * Returns a tip the user hasn't seen recently. Cycles through all tips
 * before repeating. Returns the tip string and its index in the TIPS array.
 */
export function getRandomTip(): { tip: string; index: number } {
  const seenIndices = safeGetJSON<number[]>(STORAGE_KEY_SEEN_TIPS) || []

  // Find tips the user hasn't seen yet
  const unseenIndices = TIPS.map((_, i) => i).filter(i => !(seenIndices || []).includes(i))

  // If all tips have been seen, reset and start fresh
  if (unseenIndices.length === 0) {
    const firstIndex = Math.floor(Math.random() * TIPS.length)
    safeSetJSON<number[]>(STORAGE_KEY_SEEN_TIPS, [firstIndex])
    return { tip: TIPS[firstIndex], index: firstIndex }
  }

  // Pick a random unseen tip
  const randomUnseen = unseenIndices[Math.floor(Math.random() * unseenIndices.length)]
  const updatedSeen = [...(seenIndices || []), randomUnseen]
  safeSetJSON<number[]>(STORAGE_KEY_SEEN_TIPS, updatedSeen)

  return { tip: TIPS[randomUnseen], index: randomUnseen }
}
