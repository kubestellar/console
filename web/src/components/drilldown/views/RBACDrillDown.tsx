import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { LOCAL_AGENT_WS_URL } from '../../../lib/constants'
import { appendWsAuthToken } from '../../../lib/utils/wsAuth'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { FileText, Code, Info, Loader2, Copy, Check, Server, Shield, ShieldCheck, User, RefreshCw } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { useTranslation } from 'react-i18next'
import { copyToClipboard } from '../../../lib/clipboard'

// ---------------------------------------------------------------------------
// Named constants — no magic numbers
// ---------------------------------------------------------------------------

/** Hard timeout (ms) applied to a single kubectl call issued over the agent websocket */
const KUBECTL_REQUEST_TIMEOUT_MS = 10_000

/**
 * Maximum number of bindings the Describe and YAML tabs render inline.
 * Anything above this is truncated; a notice is displayed to the user
 * (Issue 9267).
 */
const MAX_BINDINGS_TO_DESCRIBE = 10

interface Props {
  data: Record<string, unknown>
}

interface RoleBinding {
  kind: string
  name: string
  namespace?: string
  roleName: string
  roleKind: string
}

type TabType = 'overview' | 'describe' | 'yaml'

/**
 * RBAC subject kinds that a *subject* column can hold. When the drilldown
 * is opened on a Role or RoleBinding row itself, the filter logic needs to
 * match by the role name in `roleRef`, not by the subject name (Issue 9264).
 */
type DrillDownKind = 'User' | 'Group' | 'ServiceAccount' | 'Role' | 'RoleBinding' | 'ClusterRole' | 'ClusterRoleBinding'

const SUBJECT_KINDS = new Set<DrillDownKind>(['User', 'Group', 'ServiceAccount'])

export function RBACDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string | undefined
  const subject = data.subject as string
  const subjectType = ((data.type as string) || 'User') as DrillDownKind
  const { isConnected: agentConnected } = useLocalAgent()
  const { drillToCluster, drillToNamespace } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [clusterBindings, setClusterBindings] = useState<RoleBinding[]>([])
  const [roleBindings, setRoleBindings] = useState<RoleBinding[]>([])
  const [loading, setLoading] = useState(true)
  const [describeOutput, setDescribeOutput] = useState<string | null>(null)
  const [describeLoading, setDescribeLoading] = useState(false)
  const [yamlOutput, setYamlOutput] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const runKubectl = useCallback(async (args: string[]): Promise<string> => {
    let wsUrl: string
    try {
      wsUrl = await appendWsAuthToken(LOCAL_AGENT_WS_URL)
    } catch {
      return ''
    }
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl)
      const requestId = `kubectl-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let output = ''

      const timeout = setTimeout(() => {
        ws.close()
        resolve(output || '')
      }, KUBECTL_REQUEST_TIMEOUT_MS)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: cluster, args }
        }))
      }
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === requestId && msg.payload?.output) {
          output = msg.payload.output
        }
        clearTimeout(timeout)
        ws.close()
        resolve(output)
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        ws.close()
        resolve(output || '')
      }
    })
  }, [cluster])

  /**
   * Returns true if the given binding matches the drilled-into target.
   * - For User/Group/ServiceAccount, match by subject kind + name (the
   *   binding references the drilled-into subject).
   * - For Role / ClusterRole, match by roleRef.name (any binding that
   *   references the drilled-into role).
   * - For RoleBinding / ClusterRoleBinding, match by metadata.name (the
   *   binding itself is the target).
   *
   * Previously the code only handled the User/Group/ServiceAccount case,
   * so drilldowns opened from Role / RoleBinding rows always returned
   * empty — Issue 9264.
   */
  const parseBindings = useCallback((json: string, kind: string): RoleBinding[] => {
    try {
      const parsed = JSON.parse(json)
      const items = parsed.items || []
      return items.filter((item: Record<string, unknown>) => {
        if (SUBJECT_KINDS.has(subjectType)) {
          const subjects = item.subjects as Array<{ kind: string; name: string }> | undefined
          return subjects?.some(s => s.name === subject && s.kind === subjectType)
        }
        if (subjectType === 'Role' || subjectType === 'ClusterRole') {
          const roleRef = item.roleRef as { kind: string; name: string } | undefined
          return roleRef?.name === subject
        }
        if (subjectType === 'RoleBinding' || subjectType === 'ClusterRoleBinding') {
          const meta = item.metadata as { name: string } | undefined
          return meta?.name === subject
        }
        return false
      }).map((item: Record<string, unknown>) => {
        const roleRef = item.roleRef as { kind: string; name: string }
        const meta = item.metadata as { name: string; namespace?: string }
        return {
          kind,
          name: meta.name,
          namespace: meta.namespace,
          roleName: roleRef.name,
          roleKind: roleRef.kind,
        }
      })
    } catch {
      return []
    }
  }, [subject, subjectType])

  /**
   * Fetch bindings from the cluster. Also clears the stale Describe/YAML
   * output so the next tab switch re-fetches (Issue 9267).
   */
  const fetchBindings = useCallback(async () => {
    if (!agentConnected) return
    setLoading(true)

    const [crbOut, rbOut] = await Promise.all([
      runKubectl(['get', 'clusterrolebindings', '-o', 'json']),
      namespace
        ? runKubectl(['get', 'rolebindings', '-n', namespace, '-o', 'json'])
        : runKubectl(['get', 'rolebindings', '--all-namespaces', '-o', 'json']),
    ])

    setClusterBindings(parseBindings(crbOut, 'ClusterRoleBinding'))
    setRoleBindings(parseBindings(rbOut, 'RoleBinding'))
    setLoading(false)
  }, [agentConnected, namespace, parseBindings, runKubectl])

  const fetchDescribe = useCallback(async () => {
    if (!agentConnected || describeOutput) return
    setDescribeLoading(true)
    const bindings = [...clusterBindings, ...roleBindings]
    const parts: string[] = []
    for (const b of bindings.slice(0, MAX_BINDINGS_TO_DESCRIBE)) {
      const args = b.kind === 'ClusterRoleBinding'
        ? ['describe', 'clusterrolebinding', b.name]
        : ['describe', 'rolebinding', b.name, '-n', b.namespace || 'default']
      const out = await runKubectl(args)
      if (out) parts.push(out)
    }
    setDescribeOutput(parts.join('\n---\n') || t('drilldown.empty.noBindingsFound'))
    setDescribeLoading(false)
  }, [agentConnected, clusterBindings, describeOutput, roleBindings, runKubectl, t])

  const fetchYaml = useCallback(async () => {
    if (!agentConnected || yamlOutput) return
    setYamlLoading(true)
    const bindings = [...clusterBindings, ...roleBindings]
    const parts: string[] = []
    for (const b of bindings.slice(0, MAX_BINDINGS_TO_DESCRIBE)) {
      const args = b.kind === 'ClusterRoleBinding'
        ? ['get', 'clusterrolebinding', b.name, '-o', 'yaml']
        : ['get', 'rolebinding', b.name, '-n', b.namespace || 'default', '-o', 'yaml']
      const out = await runKubectl(args)
      if (out) parts.push(out)
    }
    setYamlOutput(parts.join('\n---\n') || t('drilldown.empty.noBindingsFound'))
    setYamlLoading(false)
  }, [agentConnected, clusterBindings, roleBindings, runKubectl, yamlOutput, t])

  const hasLoadedRef = useRef(false)

  // Track agent connection state so a disconnect → reconnect also triggers a
  // fresh fetch (Issue 9267). Without this the drilldown stayed blank after
  // the agent dropped and returned.
  const prevAgentConnectedRef = useRef(agentConnected)

  useEffect(() => {
    if (agentConnected && !hasLoadedRef.current) {
      hasLoadedRef.current = true
      fetchBindings()
    }
    // If the agent reconnected after having been disconnected, force a refresh
    if (agentConnected && !prevAgentConnectedRef.current && hasLoadedRef.current) {
      setDescribeOutput(null)
      setYamlOutput(null)
      fetchBindings()
    }
    prevAgentConnectedRef.current = agentConnected
  }, [agentConnected, fetchBindings])

  /**
   * Manual refresh — re-fetches bindings and clears the Describe/YAML output
   * so the next tab switch re-fetches fresh output (Issue 9267).
   */
  const handleRefresh = useCallback(async () => {
    if (!agentConnected || refreshing) return
    setRefreshing(true)
    setDescribeOutput(null)
    setYamlOutput(null)
    try {
      await fetchBindings()
    } finally {
      setRefreshing(false)
    }
  }, [agentConnected, fetchBindings, refreshing])

  const handleCopy = (field: string, value: string) => {
    copyToClipboard(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const totalBindings = clusterBindings.length + roleBindings.length
  const hiddenBindingCount = Math.max(0, totalBindings - MAX_BINDINGS_TO_DESCRIBE)

  const TABS: { id: TabType; label: string; icon: typeof Info }[] = [
    { id: 'overview', label: t('drilldown.rbac.bindingsTab', { count: totalBindings }), icon: Shield },
    { id: 'describe', label: t('drilldown.rbac.describeTab'), icon: FileText },
    { id: 'yaml', label: t('drilldown.rbac.yamlTab'), icon: Code },
  ]

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <User className="w-4 h-4 text-purple-400" />
            <span className="text-muted-foreground">{subjectType}</span>
            <span className="font-mono text-purple-400">{subject}</span>
          </div>
          {namespace && (
            <button
              onClick={() => drillToNamespace(cluster, namespace)}
              className="flex items-center gap-2 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
            >
              <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
              <span className="font-mono text-purple-400 group-hover:text-purple-300">{namespace}</span>
            </button>
          )}
          <button
            onClick={() => drillToCluster(cluster)}
            className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
          >
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
            <ClusterBadge cluster={cluster.split('/').pop() || cluster} size="sm" />
          </button>
          {/* Refresh button (Issue 9267) — re-fetches bindings and clears
              stale Describe/YAML output so the next tab switch re-runs them. */}
          <button
            onClick={handleRefresh}
            disabled={!agentConnected || refreshing}
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="rbac-drilldown-refresh"
            aria-label={t('common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            <span>{t('common.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'describe') fetchDescribe()
                  if (tab.id === 'yaml') fetchYaml()
                }}
                className={cn(
                  'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{t('drilldown.rbac.loadingBindings')}</span>
              </div>
            ) : totalBindings === 0 ? (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.rbac.noBindingsForSubject', { type: subjectType, subject })}</p>
              </div>
            ) : (
              <>
                {clusterBindings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-green-400" />
                      {t('drilldown.rbac.clusterRoleBindingsHeader', { count: clusterBindings.length })}
                    </h3>
                    <div className="space-y-2">
                      {clusterBindings.map((b) => (
                        <div key={b.name} className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-between">
                          <div>
                            <div className="font-mono text-sm text-green-400">{b.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {b.roleKind}: <span className="text-foreground">{b.roleName}</span>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20">{t('drilldown.rbac.clusterWide')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {roleBindings.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-400" />
                      {t('drilldown.rbac.roleBindingsHeader', { count: roleBindings.length })}
                    </h3>
                    <div className="space-y-2">
                      {roleBindings.map((b) => (
                        <div key={`${b.namespace}-${b.name}`} className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-between">
                          <div>
                            <div className="font-mono text-sm text-blue-400">{b.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {b.roleKind}: <span className="text-foreground">{b.roleName}</span>
                              {b.namespace && <> {t('drilldown.rbac.inNamespace')} <span className="text-foreground">{b.namespace}</span></>}
                            </div>
                          </div>
                          {b.namespace && (
                            <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{b.namespace}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'describe' && (
          <div>
            {describeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{t('drilldown.status.runningDescribe')}</span>
              </div>
            ) : describeOutput ? (
              <div className="relative">
                <button
                  onClick={() => handleCopy('describe', describeOutput)}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'describe' ? <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</> : <><Copy className="w-3 h-3" /> {t('common.copy')}</>}
                </button>
                {/* Truncation notice (Issue 9267) */}
                {hiddenBindingCount > 0 && (
                  <div
                    className="mb-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400"
                    data-testid="rbac-drilldown-truncation-notice"
                  >
                    {t('drilldown.rbac.truncationNotice', {
                      shown: MAX_BINDINGS_TO_DESCRIBE,
                      total: totalBindings,
                      hidden: hiddenBindingCount })}
                  </div>
                )}
                <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                  {describeOutput}
                </pre>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'yaml' && (
          <div>
            {yamlLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">{t('drilldown.status.fetchingYaml')}</span>
              </div>
            ) : yamlOutput ? (
              <div className="relative">
                <button
                  onClick={() => handleCopy('yaml', yamlOutput)}
                  className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copiedField === 'yaml' ? <><Check className="w-3 h-3 text-green-400" /> {t('common.copied')}</> : <><Copy className="w-3 h-3" /> {t('common.copy')}</>}
                </button>
                {/* Truncation notice (Issue 9267) */}
                {hiddenBindingCount > 0 && (
                  <div
                    className="mb-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400"
                  >
                    {t('drilldown.rbac.truncationNotice', {
                      shown: MAX_BINDINGS_TO_DESCRIBE,
                      total: totalBindings,
                      hidden: hiddenBindingCount })}
                  </div>
                )}
                <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
                  {yamlOutput}
                </pre>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
