import type {
  IntotoClusterStatus,
  IntotoLayout,
  IntotoLayoutResource,
  IntotoLinkResource,
  IntotoStats,
  IntotoStep,
} from './types'

/**
 * Pure function to compute aggregate statistics for in-toto layouts.
 * Used for both per-cluster status and global component-level statistics.
 */
export function computeIntotoStats(layouts: IntotoLayout[]): IntotoStats {
  const stats = {
    totalLayouts: layouts.length,
    totalSteps: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    missingSteps: 0,
  }

  for (const layout of (layouts || [])) {
    stats.totalSteps += layout.steps.length
    stats.verifiedSteps += layout.verifiedSteps
    stats.failedSteps += layout.failedSteps
  }

  stats.missingSteps = stats.totalSteps - stats.verifiedSteps - stats.failedSteps
  return stats
}

export function buildClusterStatus(cluster: string, layouts: IntotoLayout[]): IntotoClusterStatus {
  return {
    cluster,
    installed: true,
    loading: false,
    layouts,
    ...computeIntotoStats(layouts),
  }
}

export function emptyStatus(cluster: string, installed: boolean, error?: string): IntotoClusterStatus {
  return {
    cluster,
    installed,
    loading: false,
    error,
    layouts: [],
    totalLayouts: 0,
    totalSteps: 0,
    verifiedSteps: 0,
    failedSteps: 0,
    missingSteps: 0,
  }
}

export function transformLayoutResources(cluster: string, items: IntotoLayoutResource[] = []): IntotoLayout[] {
  const layouts: IntotoLayout[] = []

  for (const item of (items || [])) {
    const steps: IntotoStep[] = (item.spec.steps || []).map(step => ({
      name: step.name,
      status: 'unknown',
      functionary: (step.pubkeys || []).join(', ') || 'unknown',
      linksFound: 0,
    }))

    layouts.push({
      name: item.metadata.name,
      cluster,
      namespace: item.metadata.namespace,
      steps,
      expectedProducts: steps.length,
      verifiedSteps: 0,
      failedSteps: 0,
      createdAt: item.metadata.creationTimestamp || new Date().toISOString(),
    })
  }

  return layouts
}

export function applyLinkStatuses(layouts: IntotoLayout[], links: IntotoLinkResource[] = []): void {
  for (const link of (links || [])) {
    const layoutName = link.metadata.labels?.['layout-name']
    const stepName = link.spec.name || link.metadata.labels?.['step-name']
    if (!layoutName || !stepName) continue

    const layout = layouts.find(candidate => candidate.name === layoutName)
    if (!layout) continue

    const step = layout.steps.find(candidate => candidate.name === stepName)
    if (!step) continue

    step.linksFound += 1
    const newStatus = link.status?.verified === true ? 'verified' : 'failed'

    if (step.status === 'verified') layout.verifiedSteps -= 1
    else if (step.status === 'failed') layout.failedSteps -= 1

    step.status = newStatus
    if (newStatus === 'verified') layout.verifiedSteps += 1
    else layout.failedSteps += 1
  }
}

export function markMissingSteps(layouts: IntotoLayout[]): void {
  for (const layout of (layouts || [])) {
    for (const step of (layout.steps || [])) {
      if (step.status === 'unknown' && step.linksFound === 0) {
        step.status = 'missing'
      }
    }
  }
}
