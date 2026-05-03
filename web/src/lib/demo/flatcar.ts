/**
 * Flatcar Container Linux — Demo Data & Type Definitions
 *
 * Flatcar Container Linux is an immutable, container-focused Linux
 * distribution (CNCF incubating) that auto-updates via a release-channel
 * model (stable, beta, alpha, lts). Each node reports its running OS
 * version, update channel, whether a newer release is pending, and whether
 * a reboot is required to activate the update.
 *
 * This module is the canonical demo seed for the new Flatcar scaffolding
 * (useCachedFlatcar + flatcar-status config). The legacy card under
 * `components/cards/flatcar_status/demoData.ts` uses a simpler shape that
 * predates the unified card pattern; this module supersedes it for new
 * consumers.
 *
 * This is scaffolding — the card renders via demo fallback today. When a
 * real Flatcar update-operator / node-inspector bridge lands
 * (`/api/flatcar/status`), the hook's fetcher will pick up live data
 * automatically with no component changes.
 */

import { MS_PER_MINUTE, MS_PER_HOUR } from '../constants/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FlatcarHealth = 'healthy' | 'degraded' | 'not-installed' | 'unknown'
export type FlatcarChannel = 'stable' | 'beta' | 'alpha' | 'lts'
export type FlatcarNodeState =
  | 'up-to-date'
  | 'update-available'
  | 'reboot-required'
  | 'updating'
  | 'unknown'

export interface FlatcarNode {
  name: string
  cluster: string
  osImage: string
  currentVersion: string
  availableVersion: string | null
  channel: FlatcarChannel
  state: FlatcarNodeState
  rebootRequired: boolean
  lastCheckTime: string
}

export interface FlatcarStats {
  totalNodes: number
  upToDateNodes: number
  updateAvailableNodes: number
  rebootRequiredNodes: number
  channelsInUse: FlatcarChannel[]
}

export interface FlatcarSummary {
  latestStableVersion: string
  latestBetaVersion: string
  totalClusters: number
}

export interface FlatcarStatusData {
  health: FlatcarHealth
  nodes: FlatcarNode[]
  stats: FlatcarStats
  summary: FlatcarSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo-data constants (named — no magic numbers)
// ---------------------------------------------------------------------------

const DEMO_LATEST_STABLE = '3975.2.2'
const DEMO_LATEST_BETA = '4012.0.0'
const DEMO_PRIOR_STABLE = '3975.2.1'
const DEMO_PRIOR_BETA = '4011.0.0'
const DEMO_TOTAL_CLUSTERS = 2

const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE
const FIFTEEN_MINUTES_MS = 15 * MS_PER_MINUTE
const THIRTY_MINUTES_MS = 30 * MS_PER_MINUTE
const TWO_HOURS_MS = 2 * MS_PER_HOUR

// ---------------------------------------------------------------------------
// Demo nodes — 6 total:
//   - 2 up-to-date on stable
//   - 1 up-to-date on beta
//   - 2 update-available (1 stable, 1 beta)
//   - 1 reboot-required (stable)
// ---------------------------------------------------------------------------

const DEMO_NODES: FlatcarNode[] = [
  {
    name: 'flatcar-node-1',
    cluster: 'prod-east',
    osImage: `Flatcar Container Linux by Kinvolk ${DEMO_LATEST_STABLE} (Oklo)`,
    currentVersion: DEMO_LATEST_STABLE,
    availableVersion: null,
    channel: 'stable',
    state: 'up-to-date',
    rebootRequired: false,
    lastCheckTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
  },
  {
    name: 'flatcar-node-2',
    cluster: 'prod-east',
    osImage: `Flatcar Container Linux by Kinvolk ${DEMO_LATEST_STABLE} (Oklo)`,
    currentVersion: DEMO_LATEST_STABLE,
    availableVersion: null,
    channel: 'stable',
    state: 'up-to-date',
    rebootRequired: false,
    lastCheckTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
  },
  {
    name: 'flatcar-node-3',
    cluster: 'prod-east',
    osImage: `Flatcar Container Linux by Kinvolk ${DEMO_PRIOR_STABLE} (Oklo)`,
    currentVersion: DEMO_PRIOR_STABLE,
    availableVersion: DEMO_LATEST_STABLE,
    channel: 'stable',
    state: 'update-available',
    rebootRequired: false,
    lastCheckTime: new Date(Date.now() - FIFTEEN_MINUTES_MS).toISOString(),
  },
  {
    name: 'flatcar-node-4',
    cluster: 'prod-west',
    osImage: `Flatcar Container Linux by Kinvolk ${DEMO_PRIOR_STABLE} (Oklo)`,
    currentVersion: DEMO_PRIOR_STABLE,
    availableVersion: DEMO_LATEST_STABLE,
    channel: 'stable',
    state: 'reboot-required',
    rebootRequired: true,
    lastCheckTime: new Date(Date.now() - THIRTY_MINUTES_MS).toISOString(),
  },
  {
    name: 'flatcar-beta-1',
    cluster: 'prod-west',
    osImage: `Flatcar Container Linux by Kinvolk ${DEMO_LATEST_BETA} (Oklo)`,
    currentVersion: DEMO_LATEST_BETA,
    availableVersion: null,
    channel: 'beta',
    state: 'up-to-date',
    rebootRequired: false,
    lastCheckTime: new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
  },
  {
    name: 'flatcar-beta-2',
    cluster: 'prod-west',
    osImage: `Flatcar Container Linux by Kinvolk ${DEMO_PRIOR_BETA} (Oklo)`,
    currentVersion: DEMO_PRIOR_BETA,
    availableVersion: DEMO_LATEST_BETA,
    channel: 'beta',
    state: 'update-available',
    rebootRequired: false,
    lastCheckTime: new Date(Date.now() - TWO_HOURS_MS).toISOString(),
  },
]

const DEMO_UP_TO_DATE = DEMO_NODES.filter(n => n.state === 'up-to-date').length
const DEMO_UPDATE_AVAILABLE = DEMO_NODES.filter(
  n => n.state === 'update-available',
).length
const DEMO_REBOOT_REQUIRED = DEMO_NODES.filter(n => n.rebootRequired).length

export const FLATCAR_DEMO_DATA: FlatcarStatusData = {
  health: 'degraded',
  nodes: DEMO_NODES,
  stats: {
    totalNodes: DEMO_NODES.length,
    upToDateNodes: DEMO_UP_TO_DATE,
    updateAvailableNodes: DEMO_UPDATE_AVAILABLE,
    rebootRequiredNodes: DEMO_REBOOT_REQUIRED,
    channelsInUse: ['stable', 'beta'],
  },
  summary: {
    latestStableVersion: DEMO_LATEST_STABLE,
    latestBetaVersion: DEMO_LATEST_BETA,
    totalClusters: DEMO_TOTAL_CLUSTERS,
  },
  lastCheckTime: new Date().toISOString(),
}
