import { describe, it, expect, beforeEach } from 'vitest'

const mod = await import('../workloads')
const {
  getDemoPods,
  getDemoPodIssues,
  getDemoDeploymentIssues,
  getDemoDeployments,
  getDemoAllPods,
  loadPodsCacheFromStorage,
  savePodsCacheToStorage,
  PODS_CACHE_KEY,
} = mod.__workloadsTestables

beforeEach(() => {
  localStorage.clear()
})

describe('getDemoPods', () => {
  it('returns 10 pods', () => {
    expect(getDemoPods()).toHaveLength(10)
  })

  it('each pod has required fields', () => {
    for (const pod of getDemoPods()) {
      expect(typeof pod.name).toBe('string')
      expect(typeof pod.namespace).toBe('string')
      expect(typeof pod.cluster).toBe('string')
      expect(typeof pod.status).toBe('string')
      expect(typeof pod.ready).toBe('string')
      expect(typeof pod.restarts).toBe('number')
      expect(typeof pod.age).toBe('string')
      expect(typeof pod.node).toBe('string')
    }
  })

  it('covers multiple clusters', () => {
    const clusters = new Set(getDemoPods().map(p => p.cluster))
    expect(clusters.size).toBeGreaterThanOrEqual(3)
  })

  it('all pods are Running', () => {
    for (const pod of getDemoPods()) {
      expect(pod.status).toBe('Running')
    }
  })
})

describe('getDemoPodIssues', () => {
  it('returns non-empty array', () => {
    expect(getDemoPodIssues().length).toBeGreaterThan(0)
  })

  it('each issue has required fields', () => {
    for (const issue of getDemoPodIssues()) {
      expect(typeof issue.name).toBe('string')
      expect(typeof issue.namespace).toBe('string')
      expect(typeof issue.cluster).toBe('string')
      expect(typeof issue.status).toBe('string')
      expect(typeof issue.restarts).toBe('number')
      expect(typeof issue.reason).toBe('string')
      expect(Array.isArray(issue.issues)).toBe(true)
    }
  })

  it('includes CrashLoopBackOff status', () => {
    const crash = getDemoPodIssues().find(i => i.status === 'CrashLoopBackOff')
    expect(crash).toBeDefined()
  })

  it('includes OOMKilled status', () => {
    const oom = getDemoPodIssues().find(i => i.status === 'OOMKilled')
    expect(oom).toBeDefined()
  })

  it('includes Pending status', () => {
    const pending = getDemoPodIssues().find(i => i.status === 'Pending')
    expect(pending).toBeDefined()
  })
})

describe('getDemoDeploymentIssues', () => {
  it('returns non-empty array', () => {
    expect(getDemoDeploymentIssues().length).toBeGreaterThan(0)
  })

  it('each issue has required fields', () => {
    for (const issue of getDemoDeploymentIssues()) {
      expect(typeof issue.name).toBe('string')
      expect(typeof issue.namespace).toBe('string')
      expect(typeof issue.cluster).toBe('string')
      expect(typeof issue.replicas).toBe('number')
      expect(typeof issue.readyReplicas).toBe('number')
      expect(typeof issue.reason).toBe('string')
      expect(typeof issue.message).toBe('string')
    }
  })

  it('readyReplicas is less than replicas for each issue', () => {
    for (const issue of getDemoDeploymentIssues()) {
      expect(issue.readyReplicas).toBeLessThan(issue.replicas)
    }
  })
})

describe('getDemoDeployments', () => {
  it('returns non-empty array', () => {
    expect(getDemoDeployments().length).toBeGreaterThan(0)
  })

  it('each deployment has required fields', () => {
    for (const dep of getDemoDeployments()) {
      expect(typeof dep.name).toBe('string')
      expect(typeof dep.namespace).toBe('string')
      expect(typeof dep.cluster).toBe('string')
      expect(typeof dep.status).toBe('string')
      expect(typeof dep.replicas).toBe('number')
    }
  })

  it('includes multiple statuses', () => {
    const statuses = new Set(getDemoDeployments().map(d => d.status))
    expect(statuses.size).toBeGreaterThanOrEqual(2)
  })
})

describe('getDemoAllPods', () => {
  it('returns more pods than getDemoPods', () => {
    expect(getDemoAllPods().length).toBeGreaterThan(getDemoPods().length)
  })

  it('includes all pods from getDemoPods', () => {
    const allNames = new Set(getDemoAllPods().map(p => p.name))
    for (const pod of getDemoPods()) {
      expect(allNames.has(pod.name)).toBe(true)
    }
  })

  it('includes GPU workload pods', () => {
    const mlPods = getDemoAllPods().filter(p => p.namespace === 'ml')
    expect(mlPods.length).toBeGreaterThan(0)
  })
})

describe('loadPodsCacheFromStorage', () => {
  it('returns null when localStorage is empty', () => {
    expect(loadPodsCacheFromStorage('key1')).toBeNull()
  })

  it('returns null when cache key does not match', () => {
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: 'other-key',
      data: [{ name: 'pod1' }],
      timestamp: new Date().toISOString(),
    }))
    expect(loadPodsCacheFromStorage('my-key')).toBeNull()
  })

  it('returns data when cache key matches', () => {
    const data = [{ name: 'pod1', namespace: 'ns', cluster: 'c1', status: 'Running', ready: '1/1', restarts: 0, age: '1d', node: 'n1' }]
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: 'match-key',
      data,
      timestamp: new Date().toISOString(),
    }))
    const result = loadPodsCacheFromStorage('match-key')
    expect(result).not.toBeNull()
    expect(result!.data).toEqual(data)
    expect(result!.timestamp).toBeInstanceOf(Date)
  })

  it('returns null on corrupted JSON', () => {
    localStorage.setItem(PODS_CACHE_KEY, 'corrupted{{{')
    expect(loadPodsCacheFromStorage('key')).toBeNull()
  })

  it('returns null when data array is empty', () => {
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: 'k',
      data: [],
    }))
    expect(loadPodsCacheFromStorage('k')).toBeNull()
  })

  it('uses current date as fallback when timestamp missing', () => {
    const data = [{ name: 'pod1' }]
    localStorage.setItem(PODS_CACHE_KEY, JSON.stringify({
      key: 'k',
      data,
    }))
    const result = loadPodsCacheFromStorage('k')
    expect(result).not.toBeNull()
    expect(result!.timestamp).toBeInstanceOf(Date)
  })
})

describe('savePodsCacheToStorage', () => {
  it('does not throw', () => {
    expect(() => savePodsCacheToStorage()).not.toThrow()
  })
})

describe('constants', () => {
  it('PODS_CACHE_KEY is a non-empty string', () => {
    expect(typeof PODS_CACHE_KEY).toBe('string')
    expect(PODS_CACHE_KEY.length).toBeGreaterThan(0)
  })
})
