import { useState } from 'react'
import { useTranslation } from 'react-i18next'

// Loose translator type for dynamic key lookup in recommendation metadata.
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS

interface ScheduleChoice {
  id: string
  labelKey: string
  offsetMs: number | null // null = "now" (no dueAt)
}

const SCHEDULE_CHOICES: ScheduleChoice[] = [
  { id: 'do-now', labelKey: 'stellar.recommendedTasks.schedule.doNow', offsetMs: null },
  { id: 'in-one-hour', labelKey: 'stellar.recommendedTasks.schedule.inOneHour', offsetMs: HOUR_MS },
  { id: 'tomorrow', labelKey: 'stellar.recommendedTasks.schedule.tomorrow', offsetMs: DAY_MS },
  { id: 'in-three-days', labelKey: 'stellar.recommendedTasks.schedule.inThreeDays', offsetMs: 3 * DAY_MS },
  { id: 'in-one-week', labelKey: 'stellar.recommendedTasks.schedule.inOneWeek', offsetMs: 7 * DAY_MS },
]

interface Recommendation {
  id: string
  category: 'security' | 'observability' | 'reliability' | 'best-practices'
  icon: string
  titleKey: string
  blurbKey: string
  prompt: string         // full LLM prompt that will be saved as task description
  priority: number       // 1 (highest) → 9
}

const RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'install-falco',
    category: 'security',
    icon: '🛡',
    titleKey: 'stellar.recommendedTasks.items.installFalco.title',
    blurbKey: 'stellar.recommendedTasks.items.installFalco.blurb',
    prompt:
      'Install Falco (https://falco.org) on the active cluster using the official Helm chart. ' +
      'Verify the falco namespace is created, all pods reach Running, and the default ruleset is loaded. ' +
      'After install, fire a known-bad event (e.g. exec into a pod and run `cat /etc/shadow`) and confirm Falco emits an alert.',
    priority: 3,
  },
  {
    id: 'audit-rbac',
    category: 'security',
    icon: '🔐',
    titleKey: 'stellar.recommendedTasks.items.auditRbac.title',
    blurbKey: 'stellar.recommendedTasks.items.auditRbac.blurb',
    prompt:
      'Audit RBAC on the active cluster. List all ClusterRoleBindings that bind to cluster-admin or contain wildcard verbs/resources. ' +
      'For each, identify the subject (user/group/serviceaccount) and namespace, and explain whether the grant looks intentional or accidental. ' +
      'Produce a markdown report with a recommended remediation per finding.',
    priority: 2,
  },
  {
    id: 'network-policies',
    category: 'security',
    icon: '🚧',
    titleKey: 'stellar.recommendedTasks.items.networkPolicies.title',
    blurbKey: 'stellar.recommendedTasks.items.networkPolicies.blurb',
    prompt:
      'Generate default-deny NetworkPolicies for each application namespace on the active cluster. ' +
      'For each namespace, emit a NetworkPolicy YAML that denies all ingress and egress by default, then add explicit allow rules ' +
      'derived from the Services and observed pod-to-pod traffic. Output the YAMLs and an apply plan.',
    priority: 3,
  },
  {
    id: 'pod-security-standards',
    category: 'best-practices',
    icon: '📜',
    titleKey: 'stellar.recommendedTasks.items.podSecurityStandards.title',
    blurbKey: 'stellar.recommendedTasks.items.podSecurityStandards.blurb',
    prompt:
      'Apply the `restricted` Pod Security Standard to all application namespaces on the active cluster. ' +
      'Label each namespace with pod-security.kubernetes.io/enforce=restricted, identify pods that would fail under the new policy, ' +
      'and produce a remediation plan (drop capabilities, set runAsNonRoot, set readOnlyRootFilesystem, etc.).',
    priority: 4,
  },
  {
    id: 'resource-limits',
    category: 'reliability',
    icon: '📊',
    titleKey: 'stellar.recommendedTasks.items.resourceLimits.title',
    blurbKey: 'stellar.recommendedTasks.items.resourceLimits.blurb',
    prompt:
      'Scan the active cluster for Deployments and StatefulSets whose pods have no resource requests or limits set. ' +
      'For each, use Prometheus/metrics-server data (or sensible defaults if metrics are unavailable) to recommend requests and limits, ' +
      'then output a patch plan.',
    priority: 4,
  },
  {
    id: 'install-prometheus-operator',
    category: 'observability',
    icon: '📈',
    titleKey: 'stellar.recommendedTasks.items.installPrometheusOperator.title',
    blurbKey: 'stellar.recommendedTasks.items.installPrometheusOperator.blurb',
    prompt:
      'Install kube-prometheus-stack (https://github.com/prometheus-community/helm-charts) on the active cluster. ' +
      'Use the prometheus-community/kube-prometheus-stack Helm chart with the default values. ' +
      'Verify Prometheus, Alertmanager, and Grafana pods reach Running, and surface the Grafana admin login.',
    priority: 5,
  },
  {
    id: 'backup-etcd',
    category: 'reliability',
    icon: '💾',
    titleKey: 'stellar.recommendedTasks.items.backupEtcd.title',
    blurbKey: 'stellar.recommendedTasks.items.backupEtcd.blurb',
    prompt:
      'Set up daily etcd snapshots for the active cluster. Create a CronJob that runs `etcdctl snapshot save` on the control plane and ' +
      'uploads the snapshot to the configured S3-compatible bucket. Verify the first snapshot runs successfully and document the restore procedure.',
    priority: 5,
  },
  {
    id: 'enable-audit-logging',
    category: 'security',
    icon: '📋',
    titleKey: 'stellar.recommendedTasks.items.enableAuditLogging.title',
    blurbKey: 'stellar.recommendedTasks.items.enableAuditLogging.blurb',
    prompt:
      'Enable Kubernetes API server audit logging on the active cluster. Author an audit-policy.yaml that captures Metadata level for ' +
      'read requests and RequestResponse level for mutating requests on sensitive resources (Secrets, ConfigMaps, RBAC). ' +
      'Wire it into the kube-apiserver flags and verify audit events are emitted.',
    priority: 4,
  },
]

const CATEGORY_COLOR: Record<Recommendation['category'], string> = {
  security: 'var(--s-critical)',
  observability: 'var(--s-info)',
  reliability: 'var(--s-warning)',
  'best-practices': 'var(--s-success)',
}

const CATEGORY_LABEL_KEYS: Record<Recommendation['category'], string> = {
  security: 'stellar.recommendedTasks.categories.security',
  observability: 'stellar.recommendedTasks.categories.observability',
  reliability: 'stellar.recommendedTasks.categories.reliability',
  'best-practices': 'stellar.recommendedTasks.categories.bestPractices',
}

interface Props {
  createTask: (
    title: string,
    description?: string,
    source?: string,
    options?: { dueAt?: string; priority?: number },
  ) => Promise<unknown>
}

export function RecommendedTasksPanel({ createTask }: Props) {
  const { t: tTyped } = useTranslation()
  const t = tTyped as unknown as TranslateFn
  const [collapsed, setCollapsed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scheduledIds, setScheduledIds] = useState<Set<string>>(new Set())

  const onSchedule = async (rec: Recommendation, choice: ScheduleChoice) => {
    setBusyId(rec.id)
    try {
      const dueAt = choice.offsetMs == null
        ? undefined
        : new Date(Date.now() + choice.offsetMs).toISOString()
      await createTask(t(rec.titleKey), rec.prompt, 'stellar', { dueAt, priority: rec.priority })
      setScheduledIds(prev => new Set(prev).add(rec.id))
      setExpandedId(null)
    } catch {
      // Surface in UI? For pitch demo we just unblock the button.
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Title row */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'var(--s-surface)',
          borderBottom: '1px solid var(--s-border)',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--s-text-muted)',
        }}>{t('stellar.recommendedTasks.stellarSuggests')}</span>
        <span style={{
          fontFamily: 'var(--s-mono)', fontSize: 10, color: 'var(--s-success)',
          background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.25)',
          borderRadius: 10, padding: '0 5px',
        }}>{RECOMMENDATIONS.length - scheduledIds.size}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--s-text-dim)' }}>
          {collapsed ? '▾' : '▴'}
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {RECOMMENDATIONS.map(rec => {
            const isExpanded = expandedId === rec.id
            const isScheduled = scheduledIds.has(rec.id)
            const cColor = CATEGORY_COLOR[rec.category]
            return (
              <div key={rec.id} style={{
                background: 'var(--s-surface-2)',
                border: '1px solid var(--s-border)',
                borderLeftWidth: 3, borderLeftColor: isScheduled ? 'var(--s-success)' : cColor,
                borderRadius: 'var(--s-r)',
                padding: '7px 10px',
                opacity: isScheduled ? 0.55 : 1,
              }}>
                <div
                  onClick={() => !isScheduled && setExpandedId(isExpanded ? null : rec.id)}
                  style={{ cursor: isScheduled ? 'default' : 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{rec.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--s-text)', flex: 1 }}>
                      {t(rec.titleKey)}
                    </span>
                    {isScheduled && (
                      <span style={{ fontSize: 10, color: 'var(--s-success)', fontFamily: 'var(--s-mono)' }}>
                        ✓ {t('stellar.recommendedTasks.scheduled')}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--s-text-muted)',
                    paddingLeft: 19, marginTop: 3, lineHeight: 1.4,
                  }}>{t(rec.blurbKey)}</div>
                  <div style={{
                    paddingLeft: 19, marginTop: 4,
                    fontSize: 9, fontFamily: 'var(--s-mono)',
                    color: cColor, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{t(CATEGORY_LABEL_KEYS[rec.category])}</div>
                </div>

                {isExpanded && !isScheduled && (
                  <div style={{
                    marginTop: 8, paddingTop: 8, paddingLeft: 19,
                    borderTop: '1px dashed var(--s-border)',
                    display: 'flex', flexWrap: 'wrap', gap: 4,
                  }}>
                    {SCHEDULE_CHOICES.map(choice => (
                      <button
                        key={choice.id}
                        disabled={busyId === rec.id}
                        onClick={(e) => { e.stopPropagation(); void onSchedule(rec, choice) }}
                        style={{
                          background: 'none', border: `1px solid ${cColor}`, color: cColor,
                          borderRadius: 'var(--s-rs)', padding: '2px 8px',
                          fontSize: 10, cursor: busyId === rec.id ? 'wait' : 'pointer',
                          opacity: busyId === rec.id ? 0.5 : 1,
                        }}
                      >{t(choice.labelKey)}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
