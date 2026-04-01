/**
 * GitOps, Helm, Operator Card Config Tests
 */
import { describe, it, expect } from 'vitest'
import { argocdApplicationsConfig } from '../argocd-applications'
import { argocdHealthConfig } from '../argocd-health'
import { argocdSyncStatusConfig } from '../argocd-sync-status'
import { gitopsDriftConfig } from '../gitops-drift'
import { helmHistoryConfig } from '../helm-history'
import { helmReleaseStatusConfig } from '../helm-release-status'
import { helmValuesDiffConfig } from '../helm-values-diff'
import { chartVersionsConfig } from '../chart-versions'
import { kustomizationStatusConfig } from '../kustomization-status'
import { operatorStatusConfig } from '../operator-status'
import { operatorSubscriptionStatusConfig } from '../operator-subscription-status'
import { certManagerConfig } from '../cert-manager'
import { overlayComparisonConfig } from '../overlay-comparison'

const gitopsCards = [
  { name: 'argocdApplications', config: argocdApplicationsConfig },
  { name: 'argocdHealth', config: argocdHealthConfig },
  { name: 'argocdSyncStatus', config: argocdSyncStatusConfig },
  { name: 'gitopsDrift', config: gitopsDriftConfig },
  { name: 'helmHistory', config: helmHistoryConfig },
  { name: 'helmReleaseStatus', config: helmReleaseStatusConfig },
  { name: 'helmValuesDiff', config: helmValuesDiffConfig },
  { name: 'chartVersions', config: chartVersionsConfig },
  { name: 'kustomizationStatus', config: kustomizationStatusConfig },
  { name: 'operatorStatus', config: operatorStatusConfig },
  { name: 'operatorSubscriptionStatus', config: operatorSubscriptionStatusConfig },
  { name: 'certManager', config: certManagerConfig },
  { name: 'overlayComparison', config: overlayComparisonConfig },
]

describe('GitOps & Helm card configs', () => {
  it.each(gitopsCards)('$name has valid structure', ({ config }) => {
    expect(config.type).toBeTruthy()
    expect(config.title).toBeTruthy()
    expect(config.category).toBeTruthy()
    expect(config.content).toBeDefined()
    expect(config.dataSource).toBeDefined()
  })
})
