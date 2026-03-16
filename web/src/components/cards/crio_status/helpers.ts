export interface CrioPodContainer {
  image?: string
  state?: 'running' | 'waiting' | 'terminated'
  reason?: string
}

export interface CrioPodInfo {
  status?: string
  ready?: string
  containers?: CrioPodContainer[]
}

export interface CrioEventInfo {
  reason?: string
  message?: string
  lastSeen?: string
}

export interface CrioRecentImagePull {
  image: string
  status: 'success' | 'failed'
  time: string
}

/** Maximum number of recent pull events shown in the card list. */
export const MAX_RECENT_IMAGE_PULLS = 5

/** Runtime prefix expected from Kubernetes node runtime value. */
export const CRIO_RUNTIME_PREFIX = 'cri-o://'

/** Fallback version value when runtime string has no semver. */
export const UNKNOWN_CRIO_VERSION = 'unknown'

/** Regex for extracting semver from a CRI-O runtime string. */
const CRIO_VERSION_REGEX = /cri-o:\/\/(\d+\.\d+\.\d+)/

/** Regex for extracting image references from event message text. */
const IMAGE_IN_MESSAGE_REGEX = /([\w.-]+(?:\/[\w.-]+)+(?::[\w.-]+)?)/

export function isCrioRuntime(containerRuntime?: string): boolean {
  const normalized = (containerRuntime ?? '').toLowerCase()
  return normalized.includes('cri-o')
}

export function extractCrioVersion(containerRuntime?: string): string {
  const runtimeVersion = containerRuntime ?? ''
  const versionMatch = runtimeVersion.match(CRIO_VERSION_REGEX)
  return versionMatch?.[1] ?? UNKNOWN_CRIO_VERSION
}

export function parseReadyCount(ready?: string): { ready: number; total: number } {
  const [readyPart, totalPart] = String(ready ?? '').split('/')
  const readyCount = Number.parseInt(readyPart, 10)
  const totalCount = Number.parseInt(totalPart, 10)
  return {
    ready: Number.isFinite(readyCount) ? readyCount : 0,
    total: Number.isFinite(totalCount) ? totalCount : 0,
  }
}

function extractImageFromMessage(message?: string): string | undefined {
  const match = String(message ?? '').match(IMAGE_IN_MESSAGE_REGEX)
  return match?.[1]
}

export function buildRecentImagePulls(events: CrioEventInfo[]): CrioRecentImagePull[] {
  const pulls = (events || [])
    .filter((event) => {
      const reason = String(event.reason ?? '').toLowerCase()
      return reason === 'pulled' || reason === 'failed' || reason === 'backoff' || reason === 'errimagepull'
    })
    .map((event) => {
      const reason = String(event.reason ?? '').toLowerCase()
      const status: 'success' | 'failed' = reason === 'pulled' ? 'success' : 'failed'
      return {
        image: extractImageFromMessage(event.message) ?? 'unknown',
        status,
        time: event.lastSeen ?? new Date().toISOString(),
      }
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  return pulls.slice(0, MAX_RECENT_IMAGE_PULLS)
}

export function summarizeCrioPods(pods: CrioPodInfo[]): {
  runningContainers: number
  pausedContainers: number
  stoppedContainers: number
  totalContainers: number
  imagePullFailed: number
  podSandboxesReady: number
  podSandboxesTotal: number
} {
  let runningContainers = 0
  let pausedContainers = 0
  let stoppedContainers = 0
  let totalContainers = 0
  let imagePullFailed = 0
  let podSandboxesReady = 0

  for (const pod of (pods || [])) {
    const readyInfo = parseReadyCount(pod.ready)
    const podReady =
      String(pod.status ?? '').toLowerCase() === 'running' &&
      readyInfo.total > 0 &&
      readyInfo.ready === readyInfo.total

    if (podReady) {
      podSandboxesReady += 1
    }

    for (const container of (pod.containers || [])) {
      totalContainers += 1
      const state = container.state ?? 'running'
      if (state === 'running') {
        runningContainers += 1
      } else if (state === 'terminated') {
        stoppedContainers += 1
      } else {
        pausedContainers += 1
      }

      const reason = String(container.reason ?? '').toLowerCase()
      if (reason === 'imagepullbackoff' || reason === 'errimagepull') {
        imagePullFailed += 1
      }
    }
  }

  return {
    runningContainers,
    pausedContainers,
    stoppedContainers,
    totalContainers,
    imagePullFailed,
    podSandboxesReady,
    podSandboxesTotal: (pods || []).length,
  }
}
