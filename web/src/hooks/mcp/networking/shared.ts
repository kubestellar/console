import { registerCacheReset } from '../../../lib/modeTransition'
import { SERVICES_CACHE_TTL_MS } from '../../../lib/constants/network'
import type { Service } from '../types'

export interface NetworkingSharedState {
  cacheVersion: number
  isResetting: boolean
}

type NetworkingSubscriber = (state: NetworkingSharedState) => void

const SERVICES_CACHE_KEY = 'kubestellar-services-cache'
const networkingSubscribers = new Set<NetworkingSubscriber>()
let networkingSharedState: NetworkingSharedState = {
  cacheVersion: 0,
  isResetting: false,
}

interface ServicesCache {
  data: Service[]
  timestamp: Date
  key: string
}

let servicesCache: ServicesCache | null = null

function notifyNetworkingSubscribers() {
  Array.from(networkingSubscribers).forEach(subscriber => subscriber(networkingSharedState))
}

export function subscribeNetworkingCache(callback: NetworkingSubscriber): () => void {
  networkingSubscribers.add(callback)
  return () => networkingSubscribers.delete(callback)
}

export function getServicesCache() {
  return servicesCache
}

export function setServicesCache(cache: ServicesCache | null) {
  servicesCache = cache
}

export function loadServicesCacheFromStorage(cacheKey: string): { data: Service[], timestamp: Date } | null {
  try {
    const stored = localStorage.getItem(SERVICES_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.key === cacheKey && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : new Date()
        const cacheAgeMs = Date.now() - timestamp.getTime()
        if (cacheAgeMs > SERVICES_CACHE_TTL_MS) {
          try {
            localStorage.removeItem(SERVICES_CACHE_KEY)
          } catch {}
          return null
        }
        servicesCache = { data: parsed.data, timestamp, key: cacheKey }
        return { data: parsed.data, timestamp }
      }
    }
  } catch {}
  return null
}

export function saveServicesCacheToStorage() {
  if (servicesCache) {
    try {
      localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify({
        data: servicesCache.data,
        timestamp: servicesCache.timestamp.toISOString(),
        key: servicesCache.key,
      }))
    } catch {}
  }
}

export function getDemoServices(): Service[] {
  return [
    { name: 'kubernetes', namespace: 'default', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.0.1', ports: ['443/TCP'], endpoints: 3, age: '45d' },
    { name: 'api-gateway', namespace: 'production', cluster: 'prod-east', type: 'LoadBalancer', clusterIP: '10.96.10.50', externalIP: '52.14.123.45', ports: ['80/TCP', '443/TCP'], endpoints: 4, lbStatus: 'Ready', age: '30d' },
    { name: 'frontend', namespace: 'web', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.20.100', ports: ['3000/TCP'], endpoints: 6, age: '25d' },
    { name: 'postgres', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.10', ports: ['5432/TCP'], endpoints: 1, age: '40d' },
    { name: 'redis', namespace: 'data', cluster: 'prod-east', type: 'ClusterIP', clusterIP: '10.96.30.20', ports: ['6379/TCP'], endpoints: 3, age: '40d' },
    { name: 'prometheus', namespace: 'monitoring', cluster: 'staging', type: 'ClusterIP', clusterIP: '10.96.40.10', ports: ['9090/TCP'], endpoints: 2, age: '20d' },
    { name: 'grafana', namespace: 'monitoring', cluster: 'staging', type: 'NodePort', clusterIP: '10.96.40.20', ports: ['3000:30300/TCP'], endpoints: 1, age: '20d' },
    { name: 'ml-inference', namespace: 'ml', cluster: 'vllm-d', type: 'LoadBalancer', clusterIP: '10.96.50.10', externalIP: '34.56.78.90, 34.56.78.91', ports: ['8080/TCP'], endpoints: 8, lbStatus: 'Ready', age: '15d' },
    { name: 'new-edge-gw', namespace: 'production', cluster: 'prod-east', type: 'LoadBalancer', clusterIP: '10.96.10.60', ports: ['80/TCP', '443/TCP'], endpoints: 0, lbStatus: 'Provisioning', age: '2m' },
    { name: 'orphaned-svc', namespace: 'data', cluster: 'staging', type: 'ClusterIP', clusterIP: '10.96.30.99', ports: ['8080/TCP'], endpoints: 0, age: '5m' },
  ]
}

if (typeof window !== 'undefined') {
  registerCacheReset('services', () => {
    networkingSharedState = {
      cacheVersion: networkingSharedState.cacheVersion + 1,
      isResetting: true,
    }
    notifyNetworkingSubscribers()

    try {
      localStorage.removeItem(SERVICES_CACHE_KEY)
    } catch {}
    servicesCache = null

    setTimeout(() => {
      networkingSharedState = { ...networkingSharedState, isResetting: false }
      notifyNetworkingSubscribers()
    }, 0)
  })
}
