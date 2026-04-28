/**
 * SPIRE (SPIFFE Runtime Environment) Status Card — Demo Data & Types
 *
 * SPIRE is the reference implementation of SPIFFE — a CNCF graduated
 * workload identity framework. It issues short-lived SVIDs (SPIFFE
 * Verifiable Identity Documents) to workloads based on admission
 * attestation performed by agents running on each node.
 *
 * Operators care about:
 *   - SPIRE server pod health (replicas desired/ready/available)
 *   - Agent DaemonSet coverage across nodes
 *   - How many agents are currently attested (online + trusted)
 *   - Registration entry count (workload identities provisioned)
 *   - Trust bundle age (how long since the last rotation)
 */

import { MS_PER_HOUR, MS_PER_DAY } from '../constants/time'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpireHealth = 'healthy' | 'degraded' | 'not-installed'

export type SpirePodPhase =
  | 'Running'
  | 'Pending'
  | 'Failed'
  | 'Succeeded'
  | 'Unknown'

export interface SpireServerPod {
  name: string
  phase: SpirePodPhase
  ready: boolean
  restarts: number
  /** ISO timestamp — when the pod started. */
  startedAt: string
  /** Node the pod is scheduled onto. */
  node: string
}

export interface SpireAgentDaemonSet {
  name: string
  namespace: string
  /** Nodes that the DaemonSet should schedule onto. */
  desiredNumberScheduled: number
  /** Nodes that have at least one running agent pod. */
  numberReady: number
  /** Nodes where an agent pod is available (ready + min ready seconds). */
  numberAvailable: number
  /** Nodes where scheduling is missing an agent pod. */
  numberMisscheduled: number
}

export interface SpireSummary {
  /** Registration entries currently provisioned. */
  registrationEntries: number
  /** Agents that have completed node attestation and hold a valid SVID. */
  attestedAgents: number
  /** Trust bundle age in hours (since last CA rotation). */
  trustBundleAgeHours: number
  /** Count of SPIRE server pods that are ready. */
  serverReadyReplicas: number
  /** Desired SPIRE server replicas. */
  serverDesiredReplicas: number
}

export interface SpireStatusData {
  health: SpireHealth
  /** SPIRE server version string (e.g. "1.10.4"). */
  version: string
  /** Trust domain configured on the SPIRE server (e.g. "example.org"). */
  trustDomain: string
  serverPods: SpireServerPod[]
  agentDaemonSet: SpireAgentDaemonSet | null
  summary: SpireSummary
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo data — shown when SPIRE is not installed or in demo mode
// ---------------------------------------------------------------------------


// Demo SPIRE server — highly-available 3-replica deployment
const DEMO_SERVER_REPLICAS_DESIRED = 3
const DEMO_SERVER_REPLICAS_READY = 3

// Demo agent DaemonSet scheduled on every worker node
const DEMO_AGENT_DESIRED_NODES = 12
const DEMO_AGENT_READY_NODES = 11
const DEMO_AGENT_AVAILABLE_NODES = 11
const DEMO_AGENT_MISSCHEDULED = 0

// Demo identity counts — realistic for a mid-size cluster
const DEMO_REGISTRATION_ENTRIES = 147
const DEMO_ATTESTED_AGENTS = 11

// Trust bundle rotated ~18 hours ago — a healthy cadence is daily.
const DEMO_TRUST_BUNDLE_AGE_HOURS = 18

const DEMO_VERSION = '1.10.4'
const DEMO_TRUST_DOMAIN = 'kubestellar.demo'

// Server pod uptime values chosen to look realistic (days / hours).
const DEMO_POD_0_UPTIME_DAYS = 14
const DEMO_POD_1_UPTIME_DAYS = 14
const DEMO_POD_2_UPTIME_HOURS = 6

const DEMO_POD_RESTARTS_NONE = 0
const DEMO_POD_RESTARTS_ROLLING = 1

const NOW_MS = Date.now()

const DEMO_SERVER_PODS: SpireServerPod[] = [
  {
    name: 'spire-server-0',
    phase: 'Running',
    ready: true,
    restarts: DEMO_POD_RESTARTS_NONE,
    startedAt: new Date(NOW_MS - DEMO_POD_0_UPTIME_DAYS * MS_PER_DAY).toISOString(),
    node: 'ip-10-0-1-10.ec2.internal',
  },
  {
    name: 'spire-server-1',
    phase: 'Running',
    ready: true,
    restarts: DEMO_POD_RESTARTS_NONE,
    startedAt: new Date(NOW_MS - DEMO_POD_1_UPTIME_DAYS * MS_PER_DAY).toISOString(),
    node: 'ip-10-0-1-11.ec2.internal',
  },
  {
    name: 'spire-server-2',
    phase: 'Running',
    ready: true,
    restarts: DEMO_POD_RESTARTS_ROLLING,
    startedAt: new Date(NOW_MS - DEMO_POD_2_UPTIME_HOURS * MS_PER_HOUR).toISOString(),
    node: 'ip-10-0-1-12.ec2.internal',
  },
]

const DEMO_AGENT_DAEMONSET: SpireAgentDaemonSet = {
  name: 'spire-agent',
  namespace: 'spire-system',
  desiredNumberScheduled: DEMO_AGENT_DESIRED_NODES,
  numberReady: DEMO_AGENT_READY_NODES,
  numberAvailable: DEMO_AGENT_AVAILABLE_NODES,
  numberMisscheduled: DEMO_AGENT_MISSCHEDULED,
}

export const SPIRE_DEMO_DATA: SpireStatusData = {
  // One agent pod is not ready (11/12) — show the card in a "degraded" state
  // so the warning styling is exercised in demo mode.
  health: 'degraded',
  version: DEMO_VERSION,
  trustDomain: DEMO_TRUST_DOMAIN,
  serverPods: DEMO_SERVER_PODS,
  agentDaemonSet: DEMO_AGENT_DAEMONSET,
  summary: {
    registrationEntries: DEMO_REGISTRATION_ENTRIES,
    attestedAgents: DEMO_ATTESTED_AGENTS,
    trustBundleAgeHours: DEMO_TRUST_BUNDLE_AGE_HOURS,
    serverReadyReplicas: DEMO_SERVER_REPLICAS_READY,
    serverDesiredReplicas: DEMO_SERVER_REPLICAS_DESIRED,
  },
  lastCheckTime: new Date(NOW_MS).toISOString(),
}
