/**
 * Demo Missions — Showcases all mission types in the AI Missions sidebar.
 *
 * Provides realistic mission examples for console.kubestellar.io so visitors
 * can see the full breadth of AI Missions: install, fix, Mission Control,
 * and orbital maintenance.
 */

import type { OrbitConfig } from '../lib/missions/types'

function hoursAgo(h: number): Date { return new Date(Date.now() - h * 3_600_000) }
function daysAgo(d: number): Date { return new Date(Date.now() - d * 86_400_000) }

/** Message shape matching MissionMessage */
interface DemoMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

/** Partial Mission shape — converted to full Mission in useMissions */
export interface DemoMission {
  id: string
  title: string
  description: string
  type: 'upgrade' | 'troubleshoot' | 'analyze' | 'deploy' | 'repair' | 'custom' | 'maintain'
  status: 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'saved' | 'blocked' | 'cancelling'
  cluster?: string
  messages: DemoMessage[]
  createdAt: Date
  updatedAt: Date
  feedback?: 'positive' | 'negative' | null
  context?: Record<string, unknown>
  importedFrom?: {
    title: string
    description: string
    missionClass?: string
    cncfProject?: string
    steps?: Array<{ title: string; description: string }>
  }
}

export const DEMO_MISSIONS: DemoMission[] = [
  // ── Saved Install Mission (showcased in Saved Missions) ───────────
  // status: 'saved' so the AI Missions panel shows install-class missions
  // alongside the orbit ones. Was 'completed' until #5962 added 'completed'
  // to INACTIVE_MISSION_STATUSES, which had the side effect of hiding all
  // 4 'completed' demo missions from both the Active and Saved sections —
  // the showcase intent (#5341) was lost.
  {
    id: 'demo-install-prometheus',
    title: 'Install Prometheus Stack',
    description: 'Deploy the kube-prometheus-stack for cluster monitoring and alerting.',
    type: 'deploy',
    status: 'saved',
    cluster: 'eks-prod-us-east-1',
    feedback: 'positive',
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    importedFrom: {
      title: 'Install Prometheus Stack',
      description: 'Deploy the kube-prometheus-stack for cluster monitoring and alerting.',
      missionClass: 'install',
      cncfProject: 'prometheus',
      steps: [
        { title: 'Add Helm repository', description: 'Add the prometheus-community Helm chart repository.' },
        { title: 'Install kube-prometheus-stack', description: 'Deploy the full monitoring stack with Grafana, Alertmanager, and node-exporter.' },
        { title: 'Verify pods', description: 'Check that all Prometheus stack pods are running and ready.' },
        { title: 'Configure alerting', description: 'Set up default alert rules for cluster health monitoring.' },
      ],
    },
    messages: [
      { id: 'msg-1', role: 'user', content: 'Install Prometheus on eks-prod-us-east-1', timestamp: daysAgo(3) },
      { id: 'msg-2', role: 'assistant', content: 'I\'ll deploy the kube-prometheus-stack on your cluster. This includes Prometheus, Grafana, Alertmanager, and node-exporter.\n\n**Step 1/4**: Adding the prometheus-community Helm repository...', timestamp: daysAgo(3) },
      { id: 'msg-3', role: 'assistant', content: '**Step 2/4**: Installing kube-prometheus-stack via Helm...\n\n```bash\nhelm install prometheus prometheus-community/kube-prometheus-stack \\\n  --namespace monitoring --create-namespace\n```', timestamp: daysAgo(3) },
      { id: 'msg-4', role: 'assistant', content: '**Step 3/4**: Verifying pods... All 8 pods are Running and Ready.\n\n**Step 4/4**: Default alert rules configured.\n\n✅ **Prometheus Stack installed successfully!** Grafana is accessible at `prometheus-grafana.monitoring.svc:80`.', timestamp: daysAgo(3) },
    ],
  },

  // ── Saved Fix Mission (showcased in Saved Missions) ───────────────
  // Same showcase rationale as demo-install-prometheus above (#5962 fix).
  {
    id: 'demo-fix-crashloop',
    title: 'Fix CrashLoopBackOff on api-gateway',
    description: 'Diagnose and resolve CrashLoopBackOff on the api-gateway deployment in production.',
    type: 'troubleshoot',
    status: 'saved',
    cluster: 'eks-prod-us-east-1',
    feedback: 'positive',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    importedFrom: {
      title: 'Fix CrashLoopBackOff',
      description: 'Diagnose CrashLoopBackOff on api-gateway pod.',
      missionClass: 'fixer',
    },
    messages: [
      { id: 'msg-10', role: 'user', content: 'api-gateway pod is in CrashLoopBackOff, can you diagnose?', timestamp: daysAgo(1) },
      { id: 'msg-11', role: 'assistant', content: 'I\'ll investigate the CrashLoopBackOff. Let me check the pod logs and events.\n\n```bash\nkubectl logs api-gateway-7b9f4d6c8-xk2p1 -n production --previous\nkubectl describe pod api-gateway-7b9f4d6c8-xk2p1 -n production\n```', timestamp: daysAgo(1) },
      { id: 'msg-12', role: 'assistant', content: '**Root cause found**: The pod is crashing because the `DATABASE_URL` environment variable references a Secret `db-credentials` that was deleted during last night\'s cleanup job.\n\n**Fix**: Recreating the Secret from the backup:\n```bash\nkubectl create secret generic db-credentials \\\n  --from-literal=DATABASE_URL=postgresql://api:****@db.internal:5432/production \\\n  -n production\n```\n\nRestarting the deployment...\n\n✅ **Fixed!** api-gateway pods are now Running (3/3 ready). The cleanup job CronJob has been patched to exclude secrets with the `app=api-gateway` label.', timestamp: daysAgo(1) },
    ],
  },

  // ── Saved Mission Control (showcased in Saved Missions) ───────────
  // Same showcase rationale as the install/fix entries above (#5962 fix).
  // demo-planning-mission below stays 'completed' on purpose — it's the
  // hidden AI conversation referenced internally by demo mission-control
  // state and should NOT appear in the user-facing Saved Missions list.
  {
    id: 'demo-mission-control',
    title: 'Mission Control: Security Stack',
    description: 'Deploy Falco + Trivy + Kyverno across production clusters.',
    type: 'deploy',
    status: 'saved',
    feedback: null,
    createdAt: hoursAgo(12),
    updatedAt: hoursAgo(12),
    context: {
      missionControl: true,
      projects: ['falco', 'trivy', 'kyverno'],
      targetClusters: ['eks-prod-us-east-1', 'aks-dev-westeu'],
    },
    importedFrom: {
      title: 'Mission Control: Security Stack',
      description: 'Multi-project deployment: Falco runtime security, Trivy vulnerability scanning, Kyverno policy enforcement.',
      missionClass: 'install',
    },
    messages: [
      { id: 'msg-20', role: 'user', content: 'Deploy a security stack with runtime detection, vulnerability scanning, and policy enforcement across all production clusters.', timestamp: hoursAgo(12) },
      { id: 'msg-21', role: 'assistant', content: '**Mission Control** initialized. I\'ve analyzed your requirements and recommend:\n\n| Project | Role | Priority |\n|---------|------|----------|\n| **Falco** | Runtime threat detection | Required |\n| **Trivy** | Image vulnerability scanning | Required |\n| **Kyverno** | Policy enforcement | Recommended |\n\n**Deployment plan**: 2 phases across 2 clusters\n- Phase 1: Falco + Trivy (no dependencies)\n- Phase 2: Kyverno (depends on CRDs from Phase 1)', timestamp: hoursAgo(12) },
      { id: 'msg-22', role: 'assistant', content: '**Phase 1 complete** ✅ Falco and Trivy deployed on both clusters.\n**Phase 2 complete** ✅ Kyverno policies active.\n\n🎉 **Security Stack deployed!** All 3 projects running across eks-prod-us-east-1 and aks-dev-westeu.\n\nGround Control dashboard created with 6 monitoring cards.', timestamp: hoursAgo(12) },
    ],
  },

  // ── Planning Mission (hidden AI conversation for Mission Control) ──
  {
    id: 'demo-planning-mission',
    title: 'Mission Control Planning',
    description: 'AI-assisted deployment planning',
    type: 'custom' as const,
    status: 'completed' as const,
    createdAt: hoursAgo(13),
    updatedAt: hoursAgo(12),
    messages: [
      {
        id: 'plan-user-1',
        role: 'user' as const,
        content: 'Deploy comprehensive security monitoring and observability across production clusters with automated certificate management.',
        timestamp: hoursAgo(13),
      },
      {
        id: 'plan-ai-1',
        role: 'assistant' as const,
        content: `Based on your requirements, I recommend a layered security and observability stack using 5 CNCF graduated projects:

**Observability Layer**
- **Prometheus** (required) — Industry-standard metrics collection with multi-dimensional data model and built-in alerting. Foundation for all observability.
- **Grafana** (recommended) — Rich visualization and dashboarding platform. Depends on Prometheus for metrics data.

**Security Layer**
- **Falco** (required) — Runtime threat detection engine monitoring syscalls for container escapes, privilege escalation, and anomalous behavior. Sends alerts to Prometheus.
- **Kyverno** (recommended) — Kubernetes-native policy engine. Enforces security policies as CRDs — image signing, resource limits, network restrictions. Depends on cert-manager for webhook TLS.

**Infrastructure Layer**
- **cert-manager** (required) — Automated TLS certificate lifecycle management. Required by Kyverno for secure webhook communication.

**Deployment Strategy**: 2 phases
1. Core Infrastructure: cert-manager + Prometheus (no dependencies)
2. Security & Observability: Falco + Kyverno + Grafana (depend on Phase 1)

\`\`\`json
{
  "projects": [
    {"name":"prometheus","displayName":"Prometheus","reason":"Metrics collection and alerting — foundation for cluster observability.","category":"Observability","priority":"required","dependencies":[],"maturity":"graduated","difficulty":"beginner","githubOrg":"prometheus"},
    {"name":"grafana","displayName":"Grafana","reason":"Visualization dashboards for Prometheus metrics.","category":"Observability","priority":"recommended","dependencies":["prometheus"],"maturity":"graduated","difficulty":"beginner","githubOrg":"grafana"},
    {"name":"falco","displayName":"Falco Runtime Security","reason":"Runtime threat detection — monitors syscalls for malicious activity.","category":"Security","priority":"required","dependencies":["prometheus"],"maturity":"graduated","difficulty":"intermediate","githubOrg":"falcosecurity"},
    {"name":"kyverno","displayName":"Kyverno","reason":"Policy engine — enforce security policies as Kubernetes resources.","category":"Security","priority":"recommended","dependencies":["cert-manager"],"maturity":"graduated","difficulty":"intermediate","githubOrg":"kyverno"},
    {"name":"cert-manager","displayName":"cert-manager","reason":"TLS certificate lifecycle management — auto-renew certificates.","category":"Security","priority":"required","dependencies":[],"maturity":"graduated","difficulty":"beginner","githubOrg":"cert-manager"}
  ]
}
\`\`\``,
        timestamp: hoursAgo(12),
      },
    ],
  },

  // ── Orbit Missions ────────────────────────────────────────────────
  {
    id: 'demo-orbit-prometheus-health',
    title: 'Health Check — Prometheus, Grafana',
    description: 'Weekly pod readiness and service endpoint verification for the observability stack.',
    type: 'maintain',
    status: 'saved',
    cluster: 'eks-prod-us-east-1',
    createdAt: daysAgo(7),
    updatedAt: daysAgo(2),
    messages: [],
    importedFrom: {
      title: 'Health Check — Prometheus, Grafana',
      description: 'Weekly pod readiness and service endpoint verification.',
      missionClass: 'orbit',
      cncfProject: 'prometheus',
      steps: [
        { title: 'Check pod health', description: 'Verify all Prometheus and Grafana pods are Running and Ready with no recent restarts.' },
        { title: 'Verify service endpoints', description: 'Ensure prometheus-server, alertmanager, and grafana services have healthy endpoints.' },
        { title: 'Check resource utilization', description: 'Verify CPU and memory usage are within acceptable thresholds (< 80%).' },
      ],
    },
    context: {
      category: 'Observability',
      orbitConfig: {
        cadence: 'weekly',
        orbitType: 'health-check',
        projects: ['prometheus', 'grafana'],
        clusters: ['eks-prod-us-east-1'],
        lastRunAt: daysAgo(2).toISOString(),
        lastRunResult: 'success',
        autoRun: true,
        history: [
          { timestamp: daysAgo(2).toISOString(), result: 'success', summary: 'All 12 pods healthy, 3 services reachable' },
          { timestamp: daysAgo(9).toISOString(), result: 'success', summary: 'All pods healthy' },
          { timestamp: daysAgo(16).toISOString(), result: 'warning', summary: 'prometheus-server pod restarted 2x in 24h' },
        ],
      } satisfies OrbitConfig as unknown as Record<string, unknown>,
    },
  },
  {
    id: 'demo-orbit-certmanager-certs',
    title: 'Certificate Rotation — cert-manager',
    description: 'Monthly TLS certificate expiry check.',
    type: 'maintain',
    status: 'saved',
    cluster: 'eks-prod-us-east-1',
    createdAt: daysAgo(30),
    updatedAt: daysAgo(7),
    messages: [],
    importedFrom: {
      title: 'Certificate Rotation — cert-manager',
      description: 'Monthly TLS certificate expiry check.',
      missionClass: 'orbit',
      cncfProject: 'cert-manager',
      steps: [
        { title: 'List certificates', description: 'Enumerate all TLS certificates and their expiry dates across namespaces.' },
        { title: 'Flag expiring certificates', description: 'Identify certificates expiring within 30 days.' },
        { title: 'Verify issuer health', description: 'Check that cert-manager issuers are ready and able to renew.' },
      ],
    },
    context: {
      category: 'Security',
      orbitConfig: {
        cadence: 'monthly',
        orbitType: 'cert-rotation',
        projects: ['cert-manager'],
        clusters: ['eks-prod-us-east-1', 'aks-dev-westeu'],
        lastRunAt: daysAgo(7).toISOString(),
        lastRunResult: 'warning',
        autoRun: false,
        history: [
          { timestamp: daysAgo(7).toISOString(), result: 'warning', summary: '1 cert expiring in 14 days: api-gateway-tls' },
          { timestamp: daysAgo(37).toISOString(), result: 'success', summary: 'All 8 certificates valid, earliest expiry in 45 days' },
        ],
      } satisfies OrbitConfig as unknown as Record<string, unknown>,
    },
  },
  {
    id: 'demo-orbit-argocd-drift',
    title: 'Version Drift — ArgoCD',
    description: 'Weekly Helm chart and image version drift detection.',
    type: 'maintain',
    status: 'saved',
    cluster: 'eks-prod-us-east-1',
    createdAt: daysAgo(14),
    updatedAt: daysAgo(10),
    messages: [],
    importedFrom: {
      title: 'Version Drift — ArgoCD',
      description: 'Weekly Helm chart and image version drift detection.',
      missionClass: 'orbit',
      cncfProject: 'argocd',
      steps: [
        { title: 'Check Helm chart versions', description: 'Compare installed ArgoCD chart version against the upstream argo Helm repository.' },
        { title: 'Check container image versions', description: 'Compare running image tags against latest available tags on ghcr.io.' },
        { title: 'Report drift summary', description: 'Summarize which components are behind and flag security-related updates.' },
      ],
    },
    context: {
      category: 'App Definition',
      orbitConfig: {
        cadence: 'weekly',
        orbitType: 'version-drift',
        projects: ['argocd'],
        clusters: ['eks-prod-us-east-1'],
        lastRunAt: daysAgo(10).toISOString(),
        lastRunResult: 'failure',
        autoRun: true,
        history: [
          { timestamp: daysAgo(10).toISOString(), result: 'failure', summary: 'ArgoCD v2.13.1 installed, v2.14.0 available (security fix)' },
          { timestamp: daysAgo(17).toISOString(), result: 'success', summary: 'All charts up to date' },
        ],
      } satisfies OrbitConfig as unknown as Record<string, unknown>,
    },
  },
]
