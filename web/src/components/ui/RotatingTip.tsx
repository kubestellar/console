/**
 * RotatingTip — a lightweight "Did you know?" banner that shows a different
 * tip on every page visit, creating variable-reward engagement.
 *
 * Pick one tip per page key from a seeded index stored in sessionStorage so
 * the tip stays stable within a session but rotates across visits.
 */

import { useState, useEffect } from 'react'
import { Lightbulb } from 'lucide-react'
import { emitTipShown } from '../../lib/analytics'

const TIPS: Record<string, string[]> = {
  home: [
    'Pin your most-used dashboards to the sidebar for one-click access.',
    'The home dashboard cards can be rearranged by dragging them.',
    'AI Missions can detect and fix issues across your entire fleet automatically.',
    'Use the global cluster filter to focus all dashboards on specific clusters.',
    'The search bar (Ctrl+K) finds clusters, pods, services, and settings instantly.',
  ],
  clusters: [
    'You can drag cluster cards to reorder them on the dashboard.',
    'Use the filter tabs to quickly isolate unhealthy or unreachable clusters.',
    'Clicking a cluster card opens a detailed view with node-level metrics.',
    'KubeStellar Console can manage clusters across multiple cloud providers simultaneously.',
    'The GPU panel shows NVIDIA operator status for AI/ML workloads.',
  ],
  workloads: [
    'Workload cards aggregate deployments, StatefulSets, and DaemonSets across all clusters.',
    'Click any workload row to see replica status and rolling update progress.',
    'The restart count column highlights pods that may be crash-looping.',
    'Filter by namespace to focus on a specific team or application.',
    'Workload metrics update in real time when auto-refresh is enabled.',
  ],
  deployments: [
    'Deployment cards show rollout status across every cluster simultaneously.',
    'Click a deployment to see its ReplicaSets and rollout history.',
    'The "Conditions" column quickly reveals stuck or failing rollouts.',
    'You can compare deployment specs across clusters from the drill-down view.',
    'HPA-managed deployments show current vs. target replica counts.',
  ],
  pods: [
    'Pod status colors let you spot CrashLoopBackOff and OOMKilled at a glance.',
    'Click a pod to view its logs, events, and container resource usage.',
    'The restart count column highlights stability issues before they escalate.',
    'Filter by status to quickly isolate pods that need attention.',
    'Pod drill-downs show init container status alongside app containers.',
  ],
  services: [
    'Service cards show endpoint health across all clusters at once.',
    'LoadBalancer services display their external IP for quick access.',
    'ClusterIP, NodePort, and LoadBalancer types are color-coded for clarity.',
    'Click a service to see which pods back it and their readiness state.',
    'Services without healthy endpoints are flagged automatically.',
  ],
  nodes: [
    'Node cards show CPU, memory, and disk pressure conditions at a glance.',
    'Cordoned nodes are visually marked so you can track maintenance windows.',
    'Click a node to see all pods scheduled on it and their resource usage.',
    'The allocatable vs. capacity view reveals how much headroom each node has.',
    'GPU nodes display NVIDIA device counts and driver versions.',
  ],
  operators: [
    'Operator cards track installed operators and their upgrade status.',
    'OLM-managed operators show available updates in the drill-down view.',
    'Click an operator to see its custom resource definitions and instances.',
    'Failed operator installs surface error details from the install plan.',
    'Operators are grouped by namespace for multi-tenant visibility.',
  ],
  helm: [
    'Helm cards show release status across all clusters simultaneously.',
    'Failed or pending releases are highlighted for immediate attention.',
    'Click a release to see its revision history and values diff.',
    'The chart version column helps identify releases that need upgrading.',
    'Helm releases can be filtered by namespace or release status.',
  ],
  logs: [
    'Log streaming connects to your clusters in real time via the agent.',
    'Filter logs by container, namespace, or severity level.',
    'The search bar within logs supports regex for advanced filtering.',
    'Multiple log streams can run simultaneously across different pods.',
    'Log timestamps are shown in your local timezone automatically.',
  ],
  events: [
    'Events are aggregated across all clusters and sorted by timestamp.',
    'Warning events are highlighted in amber for quick identification.',
    'Click an event to see the full message and involved Kubernetes object.',
    'The event count column shows recurring issues that need investigation.',
    'Filter by event type to focus on warnings or normal events only.',
  ],
  alerts: [
    'Alert cards aggregate Prometheus alerts from all connected clusters.',
    'Firing alerts are shown with their duration to help prioritize response.',
    'Click an alert to see its labels, annotations, and silencing options.',
    'Alert severity is color-coded: critical (red), warning (amber), info (blue).',
    'Use AI Missions to investigate and remediate persistent alerts.',
  ],
  compute: [
    'The compute dashboard gives a fleet-wide view of CPU and memory utilization.',
    'Click "Compare" to see resource usage side by side across clusters.',
    'Resource requests vs. limits help identify over-provisioned workloads.',
    'The utilization gauge shows real-time cluster capacity across your fleet.',
    'Compute metrics include both node-level and pod-level aggregations.',
  ],
  storage: [
    'Storage cards show PersistentVolume claims and their bound status.',
    'Unbound PVCs are flagged — they indicate missing storage provisioners.',
    'Click a PVC to see its access modes, storage class, and bound volume.',
    'StorageClass cards help you audit available provisioners across clusters.',
    'Storage capacity trending helps predict when you will need more disk.',
  ],
  network: [
    'Network cards show service mesh status and ingress configurations.',
    'NetworkPolicy coverage shows which namespaces have default-deny rules.',
    'Click an ingress to see its routing rules and TLS configuration.',
    'Service connectivity issues are flagged by endpoint health checks.',
    'Multi-cluster network policies are aggregated for fleet-wide visibility.',
  ],
  security: [
    'Security cards aggregate vulnerability scans across your entire fleet.',
    'Critical CVEs are highlighted with links to remediation guidance.',
    'RBAC analysis shows over-permissive roles that need tightening.',
    'Click a finding to see which clusters and images are affected.',
    'Pod security standards compliance is checked against restricted profiles.',
  ],
  'data-compliance': [
    'Data compliance cards track PII exposure and data residency violations.',
    'Click a finding to see the affected namespaces and remediation steps.',
    'Compliance profiles can be customized for GDPR, HIPAA, or SOC2.',
    'The score trend shows whether your compliance posture is improving.',
    'Export compliance reports as PDF for audit documentation.',
  ],
  gitops: [
    'GitOps cards show Argo CD and Flux sync status across clusters.',
    'Out-of-sync applications are flagged with the specific drift details.',
    'Click an application to see its sync history and health checks.',
    'The reconciliation timeline shows how quickly changes propagate.',
    'Degraded health status indicates apps that need manual intervention.',
  ],
  cost: [
    'Cost cards estimate resource spend across your Kubernetes fleet.',
    'Idle resources (requested but unused) are highlighted as savings opportunities.',
    'Namespace-level cost breakdown helps with team chargeback.',
    'Click a cost category to drill down into the contributing workloads.',
    'Cost trends help you catch spend anomalies before they impact budgets.',
  ],
  'gpu-reservations': [
    'GPU cards show NVIDIA device allocation across all clusters.',
    'Unallocated GPUs are highlighted as available capacity for AI workloads.',
    'Click a GPU node to see which pods have GPU requests and their utilization.',
    'The namespace breakdown shows GPU usage by team or project.',
    'GPU driver version mismatches are flagged across the fleet.',
  ],
  deploy: [
    'Deploy cards let you launch workloads across multiple clusters at once.',
    'Templates provide pre-configured deployment specs for common patterns.',
    'Cluster placement rules automatically select the best target clusters.',
    'The dry-run preview shows exactly what will be applied before deploying.',
    'Deployment status tracks rollout progress across all target clusters.',
  ],
  'ai-ml': [
    'AI/ML cards show GPU utilization, model serving status, and training jobs.',
    'vLLM and KServe inference endpoints are monitored in real time.',
    'Click a training job to see its epoch progress and resource consumption.',
    'Model registry integration shows which models are deployed where.',
    'Ray cluster status is tracked alongside Kubernetes-native ML workloads.',
  ],
  'ai-agents': [
    'AI Agent cards show connected coding agents and their capabilities.',
    'The agent bridge connects Claude, Copilot, and Codex to your clusters.',
    'MCP server status shows which Kubernetes operations agents can perform.',
    'Click an agent to see its recent operations and permission scope.',
    'Agent actions are logged for audit and can be replayed as missions.',
  ],
  'ci-cd': [
    'CI/CD cards aggregate pipeline status from GitHub Actions and more.',
    'Failed workflows are highlighted with links to the failing job.',
    'Deployment frequency and lead time metrics track your DORA performance.',
    'Click a pipeline to see its run history and success rate trend.',
    'Nightly workflow health is monitored automatically across repos.',
  ],
  'llm-d-benchmarks': [
    'Benchmark cards show LLM inference performance across hardware configs.',
    'TTFT (Time to First Token) and throughput are tracked in real time.',
    'Click a benchmark run to see the full latency distribution.',
    'The hardware leaderboard compares GPU types for cost-per-token.',
    'Performance timeline shows how model serving speed changes over time.',
  ],
  insights: [
    'Insights cards surface AI-generated observations about your fleet.',
    'High-priority insights are flagged with recommended remediation steps.',
    'Click an insight to see the affected resources and suggested fixes.',
    'Insights are refreshed automatically as your cluster state changes.',
    'Dismiss insights you have addressed — they will not reappear.',
  ],
  'cluster-admin': [
    'Cluster admin cards show RBAC, quotas, and limit ranges across clusters.',
    'Click a role binding to see its subject permissions in detail.',
    'Resource quota utilization helps enforce fair usage across namespaces.',
    'The admin view aggregates settings that are normally per-cluster.',
    'Namespace creation and deletion are tracked in the admin audit log.',
  ],
  namespaces: [
    'Namespace cards show resource counts and quota usage at a glance.',
    'Click a namespace to see its pods, services, and resource consumption.',
    'Namespaces without resource quotas are flagged for governance review.',
    'The namespace comparison view helps balance workloads across teams.',
    'Labels and annotations are searchable from the namespace list.',
  ],
  marketplace: [
    'The Marketplace offers community-contributed monitoring cards.',
    'Install a card to add new capabilities to any dashboard.',
    'Cards from the marketplace update automatically when new versions ship.',
    'You can contribute your own cards via the console-marketplace repo.',
    'Preview a card before installing to see exactly what it monitors.',
  ],
  'multi-tenancy': [
    'Multi-tenancy cards show isolation boundaries across your fleet.',
    'Namespace-level resource quotas enforce fair usage between tenants.',
    'NetworkPolicy coverage is tracked per tenant for blast radius control.',
    'Click a tenant to see their resource consumption and access scope.',
    'RBAC conflicts between tenants are surfaced for admin review.',
  ],
  compliance: [
    'Kyverno policies can auto-remediate non-compliant resources automatically.',
    'KubeStellar Console aggregates compliance scores across your entire fleet in real time.',
    'You can filter compliance results by cluster, profile, or severity.',
    'Trivy scans container images for CVEs directly from the console.',
    'Kubescape provides CIS Kubernetes Benchmark checks out of the box.',
  ],
  arcade: [
    'The Arcade dashboard lets you build a fully custom monitoring view.',
    'Drag and drop cards to create the perfect layout for your workflow.',
    'You can add the same card multiple times with different configurations.',
    'Arcade cards remember your layout between sessions automatically.',
    'Try combining GPU, compliance, and cluster cards for a unified overview.',
  ],
}

interface RotatingTipProps {
  page: keyof typeof TIPS
}

function pickTip(page: string): string {
  const tips = TIPS[page] ?? []
  if (tips.length === 0) return ''
  const key = `ksc_tip_idx_${page}`
  const stored = sessionStorage.getItem(key)
  if (stored !== null) {
    const parsed = parseInt(stored, 10)
    if (!isNaN(parsed)) return tips[parsed % tips.length]
  }
  const idx = Math.floor(Math.random() * tips.length)
  sessionStorage.setItem(key, String(idx))
  return tips[idx]
}

export function RotatingTip({ page }: RotatingTipProps) {
  const [tip] = useState(() => pickTip(page))

  useEffect(() => {
    if (tip) emitTipShown(page, tip)
  }, [page, tip])

  if (!tip) return null

  return (
    <div role="status" aria-label="Page tip" className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
      <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 text-purple-400" aria-hidden="true" />
      <span><span className="font-medium">Tip:</span> {tip}</span>
    </div>
  )
}
