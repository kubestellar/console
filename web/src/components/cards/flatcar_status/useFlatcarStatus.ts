import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { FLATCAR_DEMO_DATA, type FlatcarDemoData } from './demoData'

export interface FlatcarStatus {
    totalNodes: number
    versions: Record<string, number>
    updatingNodes: number
    outdatedNodes: number
    health: 'healthy' | 'degraded'
    lastCheckTime: string
}

const INITIAL_DATA: FlatcarStatus = {
    totalNodes: 0,
    versions: {},
    updatingNodes: 0,
    outdatedNodes: 0,
    health: 'healthy',
    lastCheckTime: new Date().toISOString(),
}

const CACHE_KEY = 'flatcar-status'

/**
 * Fetch Flatcar Container Linux node status from the Kubernetes API.
 *
 * In a live cluster the backend proxies `GET /api/v1/nodes` and returns
 * standard v1.NodeList JSON.  We filter for nodes whose `status.nodeInfo.osImage`
 * contains "Flatcar", then aggregate version distribution and update status.
 *
 * When no backend is available (demo mode) the cache layer will return
 * FLATCAR_DEMO_DATA instead — this function is never called in that case.
 */
async function fetchFlatcarStatus(): Promise<FlatcarStatus> {
    const resp = await fetch('/api/v1/nodes', {
        headers: { Accept: 'application/json' },
    })

    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
    }

    interface K8sNode {
        status?: {
            nodeInfo?: {
                osImage?: string
                kernelVersion?: string
                kubeletVersion?: string
            }
            conditions?: Array<{
                type?: string
                status?: string
            }>
        }
    }

    const nodeList: { items?: K8sNode[] } = await resp.json()
    const items = Array.isArray(nodeList?.items) ? nodeList.items : []

    // Filter for Flatcar nodes only
    const flatcarNodes = items.filter((n) =>
        n.status?.nodeInfo?.osImage?.toLowerCase().includes('flatcar'),
    )

    // Aggregate version distribution
    const versions: Record<string, number> = {}
    for (const node of flatcarNodes) {
        const osImage = node.status?.nodeInfo?.osImage ?? 'unknown'
        // Extract version from osImage, e.g. "Flatcar Container Linux by Kinvolk 3815.2.5 (…)"
        const versionMatch = osImage.match(/(\d+\.\d+\.\d+)/)
        const version = versionMatch?.[1] ?? 'unknown'
        versions[version] = (versions[version] || 0) + 1
    }

    // Determine update status from node conditions
    let updatingNodes = 0
    let outdatedNodes = 0

    // Find the latest version available
    const sortedVersions = Object.keys(versions).sort((a, b) => {
        const [aMaj, aMin, aPatch] = a.split('.').map(Number)
        const [bMaj, bMin, bPatch] = b.split('.').map(Number)
        if (aMaj !== bMaj) return bMaj - aMaj
        if (aMin !== bMin) return bMin - aMin
        return bPatch - aPatch
    })
    const latestVersion = sortedVersions[0]

    for (const node of flatcarNodes) {
        const osImage = node.status?.nodeInfo?.osImage ?? ''
        const versionMatch = osImage.match(/(\d+\.\d+\.\d+)/)
        const nodeVersion = versionMatch?.[1]

        // Check if the node is actively updating (has a "NodeUpdateInProgress" type condition)
        const isUpdating = node.status?.conditions?.some(
            (c) => c.type === 'NodeUpdateInProgress' && c.status === 'True',
        )

        if (isUpdating) {
            updatingNodes++
        } else if (nodeVersion && latestVersion && nodeVersion !== latestVersion) {
            outdatedNodes++
        }
    }

    // Health: "healthy" when all nodes are on the latest version and none are updating
    const health: 'healthy' | 'degraded' =
        outdatedNodes === 0 && updatingNodes === 0 ? 'healthy' : 'degraded'

    return {
        totalNodes: flatcarNodes.length,
        versions,
        updatingNodes,
        outdatedNodes,
        health,
        lastCheckTime: new Date().toISOString(),
    }
}

function toDemoStatus(demo: FlatcarDemoData): FlatcarStatus {
    return {
        totalNodes: demo.totalNodes,
        versions: demo.versions,
        updatingNodes: demo.updatingNodes,
        outdatedNodes: demo.outdatedNodes,
        health: demo.health,
        lastCheckTime: demo.lastCheckTime,
    }
}

export interface UseFlatcarStatusResult {
    data: FlatcarStatus
    loading: boolean
    error: string | null
    showSkeleton: boolean
    showEmptyState: boolean
}

export function useFlatcarStatus(): UseFlatcarStatusResult {
    const { data, isLoading, isFailed } = useCache<FlatcarStatus>({
        key: CACHE_KEY,
        category: 'default',
        initialData: INITIAL_DATA,
        demoData: toDemoStatus(FLATCAR_DEMO_DATA),
        persist: true,
        fetcher: fetchFlatcarStatus,
    })

    const hasAnyData = data.totalNodes > 0

    const { showSkeleton, showEmptyState } = useCardLoadingState({
        isLoading,
        hasAnyData,
        isFailed,
    })

    return {
        data,
        loading: isLoading,
        error: isFailed && !hasAnyData ? 'Failed to fetch Flatcar node status' : null,
        showSkeleton,
        showEmptyState,
    }
}
