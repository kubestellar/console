/**
 * Batch 6 demo data hooks for unified cards.
 */

import { MS_PER_HOUR, MS_PER_DAY } from '../../constants/time'
import {
  TWO_HOURS_MS,
  THREE_HOURS_MS,
  TWO_DAYS_MS,
  THREE_DAYS_MS,
} from './timeConstants'

// ============================================================================
// Batch 6 demo data - Remaining compatible cards
// ============================================================================

// GitHub activity demo data
export const DEMO_GITHUB_ACTIVITY = [
  { type: 'PushEvent', repo: 'kubestellar/console', actor: 'developer1', timestamp: Date.now() - MS_PER_HOUR },
  { type: 'PullRequestEvent', repo: 'kubestellar/console', actor: 'developer2', timestamp: Date.now() - TWO_HOURS_MS },
  { type: 'IssuesEvent', repo: 'kubestellar/kubestellar', actor: 'contributor', timestamp: Date.now() - THREE_HOURS_MS },
]

// RSS feed demo data
export const DEMO_RSS_FEED = [
  { title: 'Kubernetes 1.30 Released', source: 'k8s.io', pubDate: Date.now() - MS_PER_DAY },
  { title: 'New CNCF Project Announcement', source: 'cncf.io', pubDate: Date.now() - TWO_DAYS_MS },
  { title: 'Cloud Native Best Practices', source: 'blog.k8s.io', pubDate: Date.now() - THREE_DAYS_MS },
]

// Kubecost overview demo data (chart/donut)
export const DEMO_KUBECOST_OVERVIEW = {
  totalCost: 12500,
  breakdown: [
    { category: 'Compute', cost: 7500 },
    { category: 'Storage', cost: 2500 },
    { category: 'Network', cost: 1500 },
    { category: 'Other', cost: 1000 },
  ] }

// OpenCost overview demo data
export const DEMO_OPENCOST_OVERVIEW = {
  totalCost: 8500,
  breakdown: [
    { category: 'CPU', cost: 4500 },
    { category: 'Memory', cost: 2500 },
    { category: 'Storage', cost: 1000 },
    { category: 'GPU', cost: 500 },
  ] }

// Cluster costs demo data
export const DEMO_CLUSTER_COSTS = [
  { cluster: 'prod-east', dailyCost: 450, monthlyCost: 13500, trend: 'up' },
  { cluster: 'staging', dailyCost: 120, monthlyCost: 3600, trend: 'stable' },
  { cluster: 'dev', dailyCost: 80, monthlyCost: 2400, trend: 'down' },
]
