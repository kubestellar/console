/**
 * Dashboard ID → route chunk import map.
 *
 * Shared by:
 *  - App.tsx (startup batch prefetch of all enabled dashboards)
 *  - prefetchDashboard.ts (hover prefetch of a single dashboard)
 */
export const DASHBOARD_CHUNKS: Record<string, () => Promise<unknown>> = {
  'dashboard': () => import('../components/dashboard/Dashboard'),
  'clusters': () => import('../components/clusters/Clusters'),
  'workloads': () => import('../components/workloads/Workloads'),
  'compute': () => import('../components/compute/Compute'),
  'events': () => import('../components/events/Events'),
  'nodes': () => import('../components/nodes/Nodes'),
  'deployments': () => import('../components/deployments/Deployments'),
  'pods': () => import('../components/pods/Pods'),
  'services': () => import('../components/services/Services'),
  'storage': () => import('../components/storage/Storage'),
  'network': () => import('../components/network/Network'),
  'security': () => import('../components/security/Security'),
  'gitops': () => import('../components/gitops/GitOps'),
  'alerts': () => import('../components/alerts/Alerts'),
  'cost': () => import('../components/cost/Cost'),
  'compliance': () => import('../components/compliance/Compliance'),
  'operators': () => import('../components/operators/Operators'),
  'helm': () => import('../components/helm/HelmReleases'),
  'settings': () => import('../components/settings/Settings'),
  'gpu-reservations': () => import('../components/gpu/GPUReservations'),
  'data-compliance': () => import('../components/data-compliance/DataCompliance'),
  'logs': () => import('../components/logs/Logs'),
  'arcade': () => import('../components/arcade/Arcade'),
  'deploy': () => import('../components/deploy/Deploy'),
  'ai-ml': () => import('../components/aiml/AIML'),
  'ai-agents': () => import('../components/aiagents/AIAgents'),
  'llm-d-benchmarks': () => import('../components/llmd-benchmarks/LLMdBenchmarks'),
  'cluster-admin': () => import('../components/cluster-admin/ClusterAdmin'),
  'ci-cd': () => import('../components/cicd/CICD'),
  'insights': () => import('../components/insights/Insights'),
  'multi-tenancy': () => import('../components/multi-tenancy/MultiTenancy'),
  'marketplace': () => import('../components/marketplace/Marketplace'),
}
