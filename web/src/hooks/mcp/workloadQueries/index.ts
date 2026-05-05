import { registerCacheReset } from '../../../lib/modeTransition'
import { notifyWorkloadsSubscribers, setWorkloadsSharedState } from '../workloadSubscriptions'
import { getDemoDeploymentIssues, getDemoDeployments, resetDeploymentsCache } from './deployments'
import {
  getDemoAllPods,
  getDemoPodIssues,
  getDemoPods,
  loadPodsCacheFromStorage,
  PODS_CACHE_KEY,
  resetPodsCache,
  savePodsCacheToStorage,
} from './pods'

export * from './shared'
export * from './pods'
export * from './deployments'
export * from './infrastructure'

if (typeof window !== 'undefined') {
  registerCacheReset('workloads', () => {
    setWorkloadsSharedState({
      cacheVersion: Date.now(),
      isResetting: true,
    })
    notifyWorkloadsSubscribers()

    resetPodsCache()
    resetDeploymentsCache()

    setTimeout(() => {
      setWorkloadsSharedState({ isResetting: false })
      notifyWorkloadsSubscribers()
    }, 0)
  })
}

export const __workloadsTestables = {
  getDemoPods,
  getDemoPodIssues,
  getDemoDeploymentIssues,
  getDemoDeployments,
  getDemoAllPods,
  loadPodsCacheFromStorage,
  savePodsCacheToStorage,
  PODS_CACHE_KEY,
}
