import { MS_PER_HOUR, MS_PER_MINUTE } from '../../lib/constants/time'
import { buildClusterStatus } from './transforms'
import type { IntotoClusterStatus, IntotoLayout } from './types'

export function getDemoLayouts(cluster: string): IntotoLayout[] {
  return [
    {
      name: 'build-and-push',
      cluster,
      steps: [
        { name: 'clone-repo', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'run-tests', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'build-image', status: 'verified', functionary: 'ci-bot', linksFound: 1 },
        { name: 'push-image', status: 'verified', functionary: 'registry-bot', linksFound: 1 },
      ],
      expectedProducts: 4,
      verifiedSteps: 4,
      failedSteps: 0,
      createdAt: new Date(Date.now() - 2 * MS_PER_HOUR).toISOString(),
    },
    {
      name: 'deploy-pipeline',
      cluster,
      steps: [
        { name: 'pull-image', status: 'verified', functionary: 'deploy-bot', linksFound: 1 },
        { name: 'scan-image', status: 'failed', functionary: 'scanner-bot', linksFound: 0 },
        { name: 'apply-manifests', status: 'missing', functionary: 'deploy-bot', linksFound: 0 },
      ],
      expectedProducts: 3,
      verifiedSteps: 1,
      failedSteps: 2,
      createdAt: new Date(Date.now() - 1 * MS_PER_HOUR).toISOString(),
    },
    {
      name: 'release-signing',
      cluster,
      steps: [
        { name: 'sign-artifact', status: 'verified', functionary: 'release-bot', linksFound: 1 },
        { name: 'upload-provenance', status: 'verified', functionary: 'release-bot', linksFound: 1 },
      ],
      expectedProducts: 2,
      verifiedSteps: 2,
      failedSteps: 0,
      createdAt: new Date(Date.now() - 30 * MS_PER_MINUTE).toISOString(),
    },
  ]
}

export function getDemoStatus(cluster: string): IntotoClusterStatus {
  return buildClusterStatus(cluster, getDemoLayouts(cluster))
}
