import type { Runbook } from './types'

/**
 * Built-in investigation runbooks.
 * Each runbook defines evidence-gathering steps that run before AI analysis.
 * Template variables ({{cluster}}, {{namespace}}, {{resource}}) are resolved at execution time.
 */
export const BUILTIN_RUNBOOKS: Runbook[] = [
  {
    id: 'pod-crash-investigation',
    title: 'Pod Crash Investigation',
    description: 'Gathers pod events, logs, and optional eBPF process traces to diagnose crash loops.',
    triggers: [{ conditionType: 'pod_crash' }],
    evidenceSteps: [
      {
        id: 'pod-events',
        label: 'Get pod events',
        source: 'mcp',
        tool: 'get_events',
        args: { cluster: '{{cluster}}', namespace: '{{namespace}}', limit: '20' },
      },
      {
        id: 'pod-issues',
        label: 'Find pod issues',
        source: 'mcp',
        tool: 'find_pod_issues',
        args: { cluster: '{{cluster}}', namespace: '{{namespace}}' },
      },
      {
        id: 'process-trace',
        label: 'Trace process executions (eBPF)',
        source: 'gadget',
        tool: 'trace_exec',
        args: { cluster: '{{cluster}}', namespace: '{{namespace}}' },
        optional: true,
      },
    ],
    analysisPrompt: `Analyze this pod crash loop and determine the root cause.

Alert: {{alertMessage}}
Cluster: {{cluster}}
Namespace: {{namespace}}
Resource: {{resource}}

Evidence gathered:
{{evidence}}

Please provide:
1. Root cause analysis
2. Most likely reason for the crash loop
3. Specific remediation steps
4. Whether this could cascade to other pods or services`,
  },

  {
    id: 'node-not-ready-investigation',
    title: 'Node Not Ready Investigation',
    description: 'Checks node conditions, events, and pods scheduled on the affected node.',
    triggers: [{ conditionType: 'node_not_ready' }],
    evidenceSteps: [
      {
        id: 'node-events',
        label: 'Get node events',
        source: 'mcp',
        tool: 'get_warning_events',
        args: { cluster: '{{cluster}}', limit: '20' },
      },
      {
        id: 'cluster-health',
        label: 'Check cluster health',
        source: 'mcp',
        tool: 'get_cluster_health',
        args: { cluster: '{{cluster}}' },
      },
      {
        id: 'pods-on-node',
        label: 'List pods on affected node',
        source: 'mcp',
        tool: 'get_pods',
        args: { cluster: '{{cluster}}' },
      },
    ],
    analysisPrompt: `Analyze why this node is not ready and assess the impact.

Alert: {{alertMessage}}
Cluster: {{cluster}}
Resource: {{resource}}

Evidence gathered:
{{evidence}}

Please provide:
1. Why the node is not ready (resource exhaustion, network, kubelet, etc.)
2. Impact on workloads scheduled on this node
3. Whether other nodes are at risk
4. Remediation steps (drain, restart kubelet, add capacity, etc.)`,
  },

  {
    id: 'dns-failure-investigation',
    title: 'DNS Failure Investigation',
    description: 'Checks CoreDNS pod health, events, and optional eBPF DNS traces.',
    triggers: [{ conditionType: 'dns_failure' }],
    evidenceSteps: [
      {
        id: 'coredns-pods',
        label: 'Check CoreDNS pods',
        source: 'mcp',
        tool: 'get_pods',
        args: { cluster: '{{cluster}}', namespace: 'kube-system', label_selector: 'k8s-app=kube-dns' },
      },
      {
        id: 'kube-system-events',
        label: 'Get kube-system events',
        source: 'mcp',
        tool: 'get_warning_events',
        args: { cluster: '{{cluster}}', namespace: 'kube-system', limit: '20' },
      },
      {
        id: 'dns-trace',
        label: 'Trace DNS queries (eBPF)',
        source: 'gadget',
        tool: 'trace_dns',
        args: { cluster: '{{cluster}}' },
        optional: true,
      },
    ],
    analysisPrompt: `Analyze this DNS failure and determine the root cause.

Alert: {{alertMessage}}
Cluster: {{cluster}}

Evidence gathered:
{{evidence}}

Please provide:
1. CoreDNS pod health status
2. Root cause of DNS failures (crash loop, resource limits, network, config)
3. Impact on services depending on DNS resolution
4. Remediation steps`,
  },

  {
    id: 'cluster-unreachable-investigation',
    title: 'Cluster Unreachable Investigation',
    description: 'Checks API server accessibility and gathers recent events before disconnect.',
    triggers: [{ conditionType: 'cluster_unreachable' }],
    evidenceSteps: [
      {
        id: 'cluster-health',
        label: 'Check cluster health',
        source: 'mcp',
        tool: 'get_cluster_health',
        args: { cluster: '{{cluster}}' },
      },
      {
        id: 'recent-events',
        label: 'Get recent events',
        source: 'mcp',
        tool: 'get_events',
        args: { cluster: '{{cluster}}', limit: '30' },
      },
    ],
    analysisPrompt: `Analyze why this cluster is unreachable.

Alert: {{alertMessage}}
Cluster: {{cluster}}

Evidence gathered:
{{evidence}}

Please provide:
1. Most likely reason for unreachability (network, auth, DNS, certificate)
2. What to check first (API server, network path, credentials, DNS)
3. Whether this is a transient issue or requires intervention
4. Remediation steps`,
  },

  {
    id: 'memory-pressure-investigation',
    title: 'Memory Pressure Investigation',
    description: 'Checks node health and identifies top memory-consuming pods.',
    triggers: [{ conditionType: 'memory_pressure' }],
    evidenceSteps: [
      {
        id: 'cluster-health',
        label: 'Check cluster health',
        source: 'mcp',
        tool: 'get_cluster_health',
        args: { cluster: '{{cluster}}' },
      },
      {
        id: 'pod-issues',
        label: 'Find pod issues',
        source: 'mcp',
        tool: 'find_pod_issues',
        args: { cluster: '{{cluster}}' },
      },
      {
        id: 'warning-events',
        label: 'Get warning events',
        source: 'mcp',
        tool: 'get_warning_events',
        args: { cluster: '{{cluster}}', limit: '20' },
      },
    ],
    analysisPrompt: `Analyze this memory pressure condition.

Alert: {{alertMessage}}
Cluster: {{cluster}}

Evidence gathered:
{{evidence}}

Please provide:
1. Which nodes are under memory pressure and current utilization
2. Top memory-consuming pods/namespaces
3. Whether OOMKill events have occurred
4. Remediation steps (set limits, evict, add nodes, etc.)`,
  },
]

/** Find a matching runbook for an alert condition type */
export function findRunbookForCondition(conditionType: string): Runbook | undefined {
  return BUILTIN_RUNBOOKS.find(rb =>
    rb.triggers.some(t => t.conditionType === conditionType)
  )
}
