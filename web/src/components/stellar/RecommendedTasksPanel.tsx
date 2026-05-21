import { useState } from 'react'
import {
  BarChart3,
  FileText,
  HardDrive,
  Lock,
  Network,
  type LucideIcon,
  ScrollText,
  Shield,
  TrendingUp,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Loose translator type for dynamic key lookup in recommendation metadata.
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

const HOUR_MS = 3_600_000
const HOURS_PER_DAY = 24
const THREE_DAY_DELAY_MULTIPLIER = 3
const WEEK_DAY_COUNT = 7
const PRIORITY_HIGH = 2
const PRIORITY_MEDIUM_HIGH = 3
const PRIORITY_MEDIUM = 4
const PRIORITY_MEDIUM_LOW = 5
const STICKY_HEADER_TOP_PX = 0
const STICKY_HEADER_Z_INDEX = 10
const PANEL_FLEX_SHRINK = 0
const DEFAULT_OPACITY = 1
const SCHEDULED_CARD_OPACITY = 0.55
const PANEL_TITLE_GAP_PX = 6
const PANEL_TITLE_PADDING_Y_PX = 7
const PANEL_TITLE_PADDING_X_PX = 12
const PANEL_TITLE_FONT_SIZE_PX = 10
const PANEL_TITLE_FONT_WEIGHT = 600
const PANEL_BADGE_RADIUS_PX = 10
const PANEL_BADGE_PADDING_X_PX = 5
const PANEL_LIST_PADDING_X_PX = 8
const PANEL_LIST_PADDING_BOTTOM_PX = 8
const PANEL_LIST_GAP_PX = 4
const CARD_PADDING_Y_PX = 7
const CARD_PADDING_X_PX = 10
const SUGGESTION_ICON_SIZE_PX = 16
const SUGGESTION_ICON_STROKE_WIDTH = 1.75
const TITLE_TEXT_SIZE_PX = 12
const TITLE_TEXT_WEIGHT = 600
const STATUS_TEXT_SIZE_PX = 10
const BLURB_TEXT_SIZE_PX = 11
const BLURB_MARGIN_TOP_PX = 3
const BLURB_LINE_HEIGHT = 1.4
const CATEGORY_TEXT_SIZE_PX = 9
const CATEGORY_MARGIN_TOP_PX = 4
const CATEGORY_LETTER_SPACING_EM = 0.05
const EXPANDED_SECTION_MARGIN_TOP_PX = 8
const EXPANDED_SECTION_PADDING_TOP_PX = 8
const ACTION_BUTTON_PADDING_Y_PX = 2
const ACTION_BUTTON_PADDING_X_PX = 8
const ACTION_BUTTON_OPACITY = 0.5
const DAY_MS = HOURS_PER_DAY * HOUR_MS

interface ScheduleChoice {
  id: string
  labelKey: string
  offsetMs: number | null // null = "now" (no dueAt)
}

const SCHEDULE_CHOICES: ScheduleChoice[] = [
  { id: 'do-now', labelKey: 'stellar.recommendedTasks.schedule.doNow', offsetMs: null },
  { id: 'in-one-hour', labelKey: 'stellar.recommendedTasks.schedule.inOneHour', offsetMs: HOUR_MS },
  { id: 'tomorrow', labelKey: 'stellar.recommendedTasks.schedule.tomorrow', offsetMs: DAY_MS },
  { id: 'in-three-days', labelKey: 'stellar.recommendedTasks.schedule.inThreeDays', offsetMs: THREE_DAY_DELAY_MULTIPLIER * DAY_MS },
  { id: 'in-one-week', labelKey: 'stellar.recommendedTasks.schedule.inOneWeek', offsetMs: WEEK_DAY_COUNT * DAY_MS },
]

interface Recommendation {
  id: string
  category: 'security' | 'observability' | 'reliability' | 'best-practices'
  icon: LucideIcon
  titleKey: string
  blurbKey: string
  prompt: string
  priority: number
}

const RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'install-falco',
    category: 'security',
    icon: Shield,
    titleKey: 'stellar.recommendedTasks.items.installFalco.title',
    blurbKey: 'stellar.recommendedTasks.items.installFalco.blurb',
    prompt:
      'Install Falco (https://falco.org) on the active cluster using the official Helm chart. ' +
      'Verify the falco namespace is created, all pods reach Running, and the default ruleset is loaded. ' +
      'After install, fire a known-bad event (e.g. exec into a pod and run `cat /etc/shadow`) and confirm Falco emits an alert.',
    priority: PRIORITY_MEDIUM_HIGH,
  },
  {
    id: 'audit-rbac',
    category: 'security',
    icon: Lock,
    titleKey: 'stellar.recommendedTasks.items.auditRbac.title',
    blurbKey: 'stellar.recommendedTasks.items.auditRbac.blurb',
    prompt:
      'Audit RBAC on the active cluster. List all ClusterRoleBindings that bind to cluster-admin or contain wildcard verbs/resources. ' +
      'For each, identify the subject (user/group/serviceaccount) and namespace, and explain whether the grant looks intentional or accidental. ' +
      'Produce a markdown report with a recommended remediation per finding.',
    priority: PRIORITY_HIGH,
  },
  {
    id: 'network-policies',
    category: 'security',
    icon: Network,
    titleKey: 'stellar.recommendedTasks.items.networkPolicies.title',
    blurbKey: 'stellar.recommendedTasks.items.networkPolicies.blurb',
    prompt:
      'Generate default-deny NetworkPolicies for each application namespace on the active cluster. ' +
      'For each namespace, emit a NetworkPolicy YAML that denies all ingress and egress by default, then add explicit allow rules ' +
      'derived from the Services and observed pod-to-pod traffic. Output the YAMLs and an apply plan.',
    priority: PRIORITY_MEDIUM_HIGH,
  },
  {
    id: 'pod-security-standards',
    category: 'best-practices',
    icon: ScrollText,
    titleKey: 'stellar.recommendedTasks.items.podSecurityStandards.title',
    blurbKey: 'stellar.recommendedTasks.items.podSecurityStandards.blurb',
    prompt:
      'Apply the `restricted` Pod Security Standard to all application namespaces on the active cluster. ' +
      'Label each namespace with pod-security.kubernetes.io/enforce=restricted, identify pods that would fail under the new policy, ' +
      'and produce a remediation plan (drop capabilities, set runAsNonRoot, set readOnlyRootFilesystem, etc.).',
    priority: PRIORITY_MEDIUM,
  },
  {
    id: 'resource-limits',
    category: 'reliability',
    icon: BarChart3,
    titleKey: 'stellar.recommendedTasks.items.resourceLimits.title',
    blurbKey: 'stellar.recommendedTasks.items.resourceLimits.blurb',
    prompt:
      'Scan the active cluster for Deployments and StatefulSets whose pods have no resource requests or limits set. ' +
      'For each, use Prometheus/metrics-server data (or sensible defaults if metrics are unavailable) to recommend requests and limits, ' +
      'then output a patch plan.',
    priority: PRIORITY_MEDIUM,
  },
  {
    id: 'install-prometheus-operator',
    category: 'observability',
    icon: TrendingUp,
    titleKey: 'stellar.recommendedTasks.items.installPrometheusOperator.title',
    blurbKey: 'stellar.recommendedTasks.items.installPrometheusOperator.blurb',
    prompt:
      'Install kube-prometheus-stack (https://github.com/prometheus-community/helm-charts) on the active cluster. ' +
      'Use the prometheus-community/kube-prometheus-stack Helm chart with the default values. ' +
      'Verify Prometheus, Alertmanager, and Grafana pods reach Running, and surface the Grafana admin login.',
    priority: PRIORITY_MEDIUM_LOW,
  },
  {
    id: 'backup-etcd',
    category: 'reliability',
    icon: HardDrive,
    titleKey: 'stellar.recommendedTasks.items.backupEtcd.title',
    blurbKey: 'stellar.recommendedTasks.items.backupEtcd.blurb',
    prompt:
      'Set up daily etcd snapshots for the active cluster. Create a CronJob that runs `etcdctl snapshot save` on the control plane and ' +
      'uploads the snapshot to the configured S3-compatible bucket. Verify the first snapshot runs successfully and document the restore procedure.',
    priority: PRIORITY_MEDIUM_LOW,
  },
  {
    id: 'enable-audit-logging',
    category: 'security',
    icon: FileText,
    titleKey: 'stellar.recommendedTasks.items.enableAuditLogging.title',
    blurbKey: 'stellar.recommendedTasks.items.enableAuditLogging.blurb',
    prompt:
      'Enable Kubernetes API server audit logging on the active cluster. Author an audit-policy.yaml that captures Metadata level for ' +
      'read requests and RequestResponse level for mutating requests on sensitive resources (Secrets, ConfigMaps, RBAC). ' +
      'Wire it into the kube-apiserver flags and verify audit events are emitted.',
    priority: PRIORITY_MEDIUM,
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
    <div style={{ flexShrink: PANEL_FLEX_SHRINK }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          position: 'sticky',
          top: STICKY_HEADER_TOP_PX,
          zIndex: STICKY_HEADER_Z_INDEX,
          background: 'var(--s-surface)',
          borderBottom: '1px solid var(--s-border)',
          display: 'flex',
          alignItems: 'center',
          gap: PANEL_TITLE_GAP_PX,
          padding: `${PANEL_TITLE_PADDING_Y_PX}px ${PANEL_TITLE_PADDING_X_PX}px`,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: PANEL_TITLE_FONT_SIZE_PX,
          fontWeight: PANEL_TITLE_FONT_WEIGHT,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--s-text-muted)',
        }}>{t('stellar.recommendedTasks.stellarSuggests')}</span>
        <span style={{
          fontFamily: 'var(--s-mono)',
          fontSize: PANEL_TITLE_FONT_SIZE_PX,
          color: 'var(--s-success)',
          background: 'color-mix(in srgb, var(--s-success) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--s-success) 25%, transparent)',
          borderRadius: PANEL_BADGE_RADIUS_PX,
          padding: `0 ${PANEL_BADGE_PADDING_X_PX}px`,
        }}>{RECOMMENDATIONS.length - scheduledIds.size}</span>
        <div style={{ flex: DEFAULT_OPACITY }} />
        <span style={{ fontSize: PANEL_TITLE_FONT_SIZE_PX, color: 'var(--s-text-dim)' }}>
          {collapsed ? '▾' : '▴'}
        </span>
      </div>

      {!collapsed && (
        <div style={{
          padding: `0 ${PANEL_LIST_PADDING_X_PX}px ${PANEL_LIST_PADDING_BOTTOM_PX}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: PANEL_LIST_GAP_PX,
        }}>
          {RECOMMENDATIONS.map(rec => {
            const Icon = rec.icon
            const isExpanded = expandedId === rec.id
            const isScheduled = scheduledIds.has(rec.id)
            const cColor = CATEGORY_COLOR[rec.category]
            return (
              <div key={rec.id} style={{
                background: 'var(--s-surface-2)',
                border: '1px solid var(--s-border)',
                borderRadius: 'var(--s-r)',
                padding: `${CARD_PADDING_Y_PX}px ${CARD_PADDING_X_PX}px`,
                opacity: isScheduled ? SCHEDULED_CARD_OPACITY : DEFAULT_OPACITY,
              }}>
                <div className="flex items-stretch gap-3">
                  <div
                    className="w-[3px] shrink-0 rounded-full"
                    style={{ background: isScheduled ? 'var(--s-success)' : cColor }}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      onClick={() => !isScheduled && setExpandedId(isExpanded ? null : rec.id)}
                      className="flex cursor-pointer items-start gap-3"
                      style={{ cursor: isScheduled ? 'default' : 'pointer' }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center"
                        style={{ color: cColor }}
                      >
                        <Icon size={SUGGESTION_ICON_SIZE_PX} strokeWidth={SUGGESTION_ICON_STROKE_WIDTH} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-h-8 items-center justify-between gap-2">
                          <span style={{ fontSize: TITLE_TEXT_SIZE_PX, fontWeight: TITLE_TEXT_WEIGHT, color: 'var(--s-text)', flex: DEFAULT_OPACITY }}>
                            {t(rec.titleKey)}
                          </span>
                          {isScheduled && (
                            <span style={{ fontSize: STATUS_TEXT_SIZE_PX, color: 'var(--s-success)', fontFamily: 'var(--s-mono)' }}>
                              ✓ {t('stellar.recommendedTasks.scheduled')}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: BLURB_TEXT_SIZE_PX,
                          color: 'var(--s-text-muted)',
                          marginTop: BLURB_MARGIN_TOP_PX,
                          lineHeight: BLURB_LINE_HEIGHT,
                        }}>{t(rec.blurbKey)}</div>
                        <div style={{
                          marginTop: CATEGORY_MARGIN_TOP_PX,
                          fontSize: CATEGORY_TEXT_SIZE_PX,
                          fontFamily: 'var(--s-mono)',
                          color: cColor,
                          textTransform: 'uppercase',
                          letterSpacing: `${CATEGORY_LETTER_SPACING_EM}em`,
                        }}>{t(CATEGORY_LABEL_KEYS[rec.category])}</div>
                      </div>
                    </div>

                    {isExpanded && !isScheduled && (
                      <div style={{
                        marginTop: EXPANDED_SECTION_MARGIN_TOP_PX,
                        paddingTop: EXPANDED_SECTION_PADDING_TOP_PX,
                        borderTop: '1px dashed var(--s-border)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: PANEL_LIST_GAP_PX,
                      }}>
                        {SCHEDULE_CHOICES.map(choice => (
                          <button
                            key={choice.id}
                            disabled={busyId === rec.id}
                            onClick={(e) => { e.stopPropagation(); void onSchedule(rec, choice) }}
                            style={{
                              background: 'none',
                              border: `1px solid ${cColor}`,
                              color: cColor,
                              borderRadius: 'var(--s-rs)',
                              padding: `${ACTION_BUTTON_PADDING_Y_PX}px ${ACTION_BUTTON_PADDING_X_PX}px`,
                              fontSize: STATUS_TEXT_SIZE_PX,
                              cursor: busyId === rec.id ? 'wait' : 'pointer',
                              opacity: busyId === rec.id ? ACTION_BUTTON_OPACITY : DEFAULT_OPACITY,
                            }}
                          >{t(choice.labelKey)}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
