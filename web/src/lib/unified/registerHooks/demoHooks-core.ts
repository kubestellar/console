/**
 * Core demo data hooks for unified cards.
 */

import { MS_PER_MINUTE } from '../../constants/time'
import {
  FIVE_MINUTES_MS,
  FOUR_MINUTES_MS,
  THREE_MINUTES_MS,
  TWO_MINUTES_MS,
} from './timeConstants'

// Cluster metrics demo data
export const DEMO_CLUSTER_METRICS = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62, pods: 156 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 48, memory: 64, pods: 158 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 42, memory: 61, pods: 155 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 51, memory: 67, pods: 162 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 47, memory: 65, pods: 159 },
  { timestamp: Date.now(), cpu: 49, memory: 66, pods: 161 },
]

// Resource usage demo data
export const DEMO_RESOURCE_USAGE = [
  { cluster: 'prod-east', cpu: 72, memory: 68, storage: 45 },
  { cluster: 'staging', cpu: 35, memory: 42, storage: 28 },
  { cluster: 'dev', cpu: 15, memory: 22, storage: 12 },
]

// Events timeline demo data
export const DEMO_EVENTS_TIMELINE = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, count: 12, type: 'Normal' },
  { timestamp: Date.now() - FOUR_MINUTES_MS, count: 8, type: 'Warning' },
  { timestamp: Date.now() - THREE_MINUTES_MS, count: 15, type: 'Normal' },
  { timestamp: Date.now() - TWO_MINUTES_MS, count: 5, type: 'Warning' },
  { timestamp: Date.now() - MS_PER_MINUTE, count: 10, type: 'Normal' },
  { timestamp: Date.now(), count: 7, type: 'Warning' },
]

// Security issues demo data
export const DEMO_SECURITY_ISSUES = [
  { id: '1', severity: 'high', title: 'Pod running as root', cluster: 'prod-east', namespace: 'default' },
  { id: '2', severity: 'medium', title: 'Missing network policy', cluster: 'staging', namespace: 'apps' },
  { id: '3', severity: 'low', title: 'Deprecated API version', cluster: 'dev', namespace: 'test' },
]

// Active alerts demo data
export const DEMO_ACTIVE_ALERTS = [
  { id: '1', severity: 'critical', name: 'HighCPUUsage', cluster: 'prod-east', message: 'CPU > 90% for 5m' },
  { id: '2', severity: 'warning', name: 'PodCrashLooping', cluster: 'staging', message: 'Pod restarting frequently' },
]

// Storage overview demo data
export const DEMO_STORAGE_OVERVIEW = {
  totalCapacity: 2048,
  used: 1234,
  pvcs: 45,
  unbound: 3 }

// Network overview demo data
export const DEMO_NETWORK_OVERVIEW = {
  services: 67,
  ingresses: 12,
  networkPolicies: 23,
  loadBalancers: 5 }

// Top pods demo data
export const DEMO_TOP_PODS = [
  { name: 'api-server-7d8f9c', namespace: 'production', cpu: 850, memory: 1024, cluster: 'prod-east' },
  { name: 'ml-worker-5c6d7e', namespace: 'ml-workloads', cpu: 3200, memory: 8192, cluster: 'vllm-d' },
  { name: 'cache-redis-0', namespace: 'data', cpu: 120, memory: 512, cluster: 'staging' },
]

// GitOps drift demo data
export const DEMO_GITOPS_DRIFT = [
  { app: 'frontend', status: 'synced', cluster: 'prod-east', lastSync: Date.now() - MS_PER_MINUTE },
  { app: 'backend', status: 'drifted', cluster: 'staging', lastSync: Date.now() - FIVE_MINUTES_MS },
  { app: 'monitoring', status: 'synced', cluster: 'dev', lastSync: Date.now() - TWO_MINUTES_MS },
]

// Pod health trend demo data
export const DEMO_POD_HEALTH_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, healthy: 145, unhealthy: 3 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, healthy: 148, unhealthy: 2 },
  { timestamp: Date.now() - THREE_MINUTES_MS, healthy: 142, unhealthy: 5 },
  { timestamp: Date.now() - TWO_MINUTES_MS, healthy: 150, unhealthy: 1 },
  { timestamp: Date.now() - MS_PER_MINUTE, healthy: 147, unhealthy: 4 },
  { timestamp: Date.now(), healthy: 149, unhealthy: 2 },
]

// Resource trend demo data
export const DEMO_RESOURCE_TREND = [
  { timestamp: Date.now() - FIVE_MINUTES_MS, cpu: 45, memory: 62 },
  { timestamp: Date.now() - FOUR_MINUTES_MS, cpu: 52, memory: 65 },
  { timestamp: Date.now() - THREE_MINUTES_MS, cpu: 48, memory: 58 },
  { timestamp: Date.now() - TWO_MINUTES_MS, cpu: 55, memory: 70 },
  { timestamp: Date.now() - MS_PER_MINUTE, cpu: 50, memory: 67 },
  { timestamp: Date.now(), cpu: 53, memory: 64 },
]

// Compute overview demo data
export const DEMO_COMPUTE_OVERVIEW = {
  nodes: 12,
  cpuUsage: 48,
  memoryUsage: 62,
  podCount: 156 }

