/**
 * Batch 4 demo data hooks for unified cards.
 */

import { MS_PER_MINUTE } from '../../constants/time'
import {
  THIRTY_SECONDS_MS,
  TWO_MINUTES_MS,
  FIVE_MINUTES_MS,
} from './timeConstants'

// ============================================================================
// Batch 4 demo data - ArgoCD, Prow, GPU, ML, Policy cards
// ============================================================================

// ArgoCD applications demo data
export const DEMO_ARGOCD_APPLICATIONS = [
  { name: 'frontend-app', project: 'production', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'apps' },
  { name: 'backend-api', project: 'production', syncStatus: 'OutOfSync', healthStatus: 'Progressing', namespace: 'apps' },
  { name: 'monitoring', project: 'infra', syncStatus: 'Synced', healthStatus: 'Healthy', namespace: 'monitoring' },
]

// GPU inventory demo data
export const DEMO_GPU_INVENTORY = [
  { cluster: 'vllm-d', node: 'gpu-node-1', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 72 },
  { cluster: 'vllm-d', node: 'gpu-node-2', model: 'NVIDIA A100 80GB', memory: 85899345920, utilization: 85 },
  { cluster: 'ml-train', node: 'ml-worker-1', model: 'NVIDIA H100', memory: 85899345920, utilization: 45 },
]

// Prow jobs demo data
export const DEMO_PROW_JOBS = [
  { name: 'pull-kubestellar-verify', type: 'presubmit', state: 'success', startTime: Date.now() - TWO_MINUTES_MS },
  { name: 'periodic-e2e-tests', type: 'periodic', state: 'pending', startTime: Date.now() - MS_PER_MINUTE },
  { name: 'post-kubestellar-deploy', type: 'postsubmit', state: 'failure', startTime: Date.now() - FIVE_MINUTES_MS },
]

// ML jobs demo data
export const DEMO_ML_JOBS = [
  { name: 'train-llm-v2', namespace: 'ml-workloads', status: 'Running', progress: 75, cluster: 'ml-train' },
  { name: 'fine-tune-bert', namespace: 'ml-workloads', status: 'Completed', progress: 100, cluster: 'ml-train' },
  { name: 'eval-model-v3', namespace: 'ml-eval', status: 'Pending', progress: 0, cluster: 'vllm-d' },
]

// ML notebooks demo data
export const DEMO_ML_NOTEBOOKS = [
  { name: 'data-exploration', namespace: 'ml-notebooks', status: 'Running', user: 'data-scientist', cluster: 'ml-train' },
  { name: 'model-analysis', namespace: 'ml-notebooks', status: 'Stopped', user: 'ml-engineer', cluster: 'ml-train' },
]

// OPA policies demo data
export const DEMO_OPA_POLICIES = [
  { name: 'require-labels', namespace: 'gatekeeper-system', status: 'active', violations: 3, cluster: 'prod-east' },
  { name: 'deny-privileged', namespace: 'gatekeeper-system', status: 'active', violations: 0, cluster: 'prod-east' },
  { name: 'require-requests', namespace: 'gatekeeper-system', status: 'warn', violations: 12, cluster: 'staging' },
]

// Kyverno policies demo data
export const DEMO_KYVERNO_POLICIES = [
  { name: 'require-image-tag', namespace: 'kyverno', status: 'enforce', violations: 2, cluster: 'prod-east' },
  { name: 'disallow-latest', namespace: 'kyverno', status: 'audit', violations: 5, cluster: 'staging' },
]

// Alert rules demo data
export const DEMO_ALERT_RULES = [
  { name: 'HighCPUUsage', severity: 'warning', state: 'firing', group: 'kubernetes', cluster: 'prod-east' },
  { name: 'PodCrashLooping', severity: 'critical', state: 'pending', group: 'kubernetes', cluster: 'staging' },
  { name: 'NodeNotReady', severity: 'critical', state: 'inactive', group: 'nodes', cluster: 'dev' },
]

// Chart versions demo data
export const DEMO_CHART_VERSIONS = [
  { chart: 'nginx-ingress', current: '4.6.0', latest: '4.8.0', updateAvailable: true, cluster: 'prod-east' },
  { chart: 'cert-manager', current: '1.12.0', latest: '1.12.0', updateAvailable: false, cluster: 'prod-east' },
  { chart: 'prometheus', current: '45.0.0', latest: '47.0.0', updateAvailable: true, cluster: 'monitoring' },
]

// CRD health demo data
export const DEMO_CRD_HEALTH = [
  { name: 'applications.argoproj.io', version: 'v1alpha1', status: 'healthy', instances: 15, cluster: 'prod-east' },
  { name: 'certificates.cert-manager.io', version: 'v1', status: 'healthy', instances: 8, cluster: 'prod-east' },
  { name: 'inferencepools.llm.kubestellar.io', version: 'v1', status: 'degraded', instances: 2, cluster: 'vllm-d' },
]

// Compliance score demo data
export const DEMO_COMPLIANCE_SCORE = {
  overall: 85,
  categories: [
    { name: 'Security', score: 92, passed: 46, failed: 4 },
    { name: 'Reliability', score: 78, passed: 39, failed: 11 },
    { name: 'Best Practices', score: 85, passed: 68, failed: 12 },
  ] }

// Namespace events demo data
export const DEMO_NAMESPACE_EVENTS = [
  { type: 'Normal', reason: 'Scheduled', message: 'Pod scheduled', object: 'pod/api-7d8f', namespace: 'production', count: 1, lastSeen: Date.now() - THIRTY_SECONDS_MS },
  { type: 'Warning', reason: 'BackOff', message: 'Container restarting', object: 'pod/worker-5c6d', namespace: 'production', count: 5, lastSeen: Date.now() - MS_PER_MINUTE },
]

// GPU workloads demo data
export const DEMO_GPU_WORKLOADS = [
  { name: 'llm-inference-7d8f', namespace: 'ml-serving', gpus: 4, model: 'A100', utilization: 85, cluster: 'vllm-d' },
  { name: 'training-job-5c6d', namespace: 'ml-training', gpus: 8, model: 'H100', utilization: 92, cluster: 'ml-train' },
]

// Deployment progress demo data
export const DEMO_DEPLOYMENT_PROGRESS = [
  { name: 'api-server', namespace: 'production', replicas: 5, ready: 5, progress: 100, status: 'complete' },
  { name: 'worker', namespace: 'production', replicas: 10, ready: 7, progress: 70, status: 'progressing' },
]
