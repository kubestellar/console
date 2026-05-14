import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Terminal, Stethoscope, Wrench, CheckCircle, Copy, ExternalLink, Server, Loader2, ChevronLeft } from 'lucide-react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useMissions } from '../../../hooks/useMissions'
import { useTranslation } from 'react-i18next'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'
import { useCachedNodes } from '../../../hooks/useCachedData'
import { formatTimeAgo } from '../../../lib/formatters'

interface Props {
  data: Record<string, unknown>
}

/**
 * NodeDrillDown - Displays detailed node information in a drill-down modal.
 *
 * When the caller (e.g. HardwareHealthCard inventory view) does not pass
 * full node data (status, roles, unschedulable), this component fetches
 * the actual node information via useCachedNodes instead of showing
 * fallback values like "Unknown" status and "worker" role (#3028).
 */
export function NodeDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const nodeName = data.node as string

  // Data that may or may not have been passed by the caller
  const passedStatus = data.status as string | undefined
  const passedUnschedulable = data.unschedulable as boolean | undefined
  const passedRoles = data.roles as string[] | undefined
  const issue = data.issue as string | undefined

  // Fetch node data from cache to fill in missing fields (#3028)
  // lastRefresh tracks when node data was last updated (freshness: lastUpdated shown in parent via CardWrapper)
  const { nodes, isLoading: isLoadingNodes, isFailed: isNodesFailed, lastRefresh: nodeLastRefresh } = useCachedNodes(cluster || undefined)
  // Format lastRefresh as a relative time string for the freshness indicator
  const nodeDataAge = (() => {
    if (!nodeLastRefresh) return null
    return new Date(nodeLastRefresh).toISOString()
  })()

  // Look up this specific node from the cached data
  const cachedNode = (() => {
    if (!nodeName || !nodes) return null
    return (nodes || []).find(
      (n) => n.name === nodeName && (!cluster || n.cluster === cluster),
    ) ?? null
  })()

  // Merge passed data with fetched data: prefer passed if available, fall back to cached
  const status = passedStatus || cachedNode?.status || undefined
  const unschedulable = passedUnschedulable !== undefined ? passedUnschedulable : cachedNode?.unschedulable
  const roles = passedRoles || cachedNode?.roles || undefined

  const { drillToEvents, drillToCluster } = useDrillDownActions()
  const { state, pop, close: closeDialog } = useDrillDown()
  const { startMission } = useMissions()
  const [copied, setCopied] = useState<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const isOffline = status === 'Cordoned' || status === 'NotReady' || unschedulable
  const clusterShort = cluster.split('/').pop() || cluster

  /** Whether we are still loading node data and have no usable status yet */
  const isResolvingNode = !status && isLoadingNodes
  /** Whether node data failed to load and we have no status */
  const isNodeDataError = !status && !isLoadingNodes && isNodesFailed

  const copyCommand = (cmd: string, label: string) => {
    copyToClipboard(cmd)
    setCopied(label)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  const startDiagnosis = () => {
    closeDialog() // Close dialog so mission sidebar is visible
    startMission({
      title: `Diagnose Node: ${nodeName}`,
      description: `Analyzing offline node ${nodeName} in cluster ${clusterShort}`,
      type: 'troubleshoot',
      initialPrompt: `I need help diagnosing an offline/unhealthy Kubernetes node.

**Node Details:**
- Name: ${nodeName}
- Cluster: ${clusterShort}
- Status: ${status || 'Unknown'}
- Cordoned/Unschedulable: ${unschedulable ? 'Yes' : 'No'}
- Roles: ${(roles ?? []).join(', ') || 'unknown'}
- Issue: ${issue || 'Node is not healthy'}

Please:
1. Diagnose the node — check events, conditions, and resource pressure.
2. Tell me what you found, then ask:
   - "Should I attempt a fix?"
   - "Show me the raw diagnostics"
3. If I say fix it, apply and verify. Then ask:
   - "Should I check other nodes for similar issues?"
   - "All done"`,
      context: { cluster: clusterShort, node: nodeName, status, unschedulable }
    })
  }

  return (
    <div className="space-y-6">
      {/* Contextual Navigation */}
      <div className="flex items-center gap-6 text-sm">
        <button onClick={() => state.stack.length > 1 ? pop() : closeDialog()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors min-h-11 min-w-11 px-2 py-2">
          <ChevronLeft className="w-4 h-4" />
          {t('drilldown.goBack', 'Back')}
        </button>
        <button
          onClick={() => drillToCluster(cluster)}
          className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
          <ClusterBadge cluster={clusterShort} size="sm" />
        </button>
      </div>

      {/* Status Banner for Offline Nodes */}
      {isOffline && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-400">{t('drilldown.node.nodeIssueDetected')}</h4>
              <p className="text-sm text-red-300/80 mt-1">{issue || 'This node is not accepting new workloads'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Node Info */}
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Node: {nodeName}</h3>
          {nodeDataAge && (
            <span className="text-2xs text-muted-foreground" title={new Date(nodeLastRefresh!).toLocaleString()}>
              Updated {formatTimeAgo(nodeDataAge)}
            </span>
          )}
        </div>

        {/* Loading indicator while resolving node data */}
        {isResolvingNode && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('drilldown.nodeDetail.loadingDetails')}</span>
          </div>
        )}

        {/* Error indicator when node data failed to load */}
        {isNodeDataError && (
          <div className="flex items-center gap-2 text-sm text-yellow-400 mb-4">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('drilldown.nodeDetail.unableToLoad')}</span>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('common.cluster')}</dt>
            <dd className="font-mono text-foreground">{clusterShort}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('common.status')}</dt>
            <dd className={`font-medium ${isOffline ? 'text-red-400' : status ? 'text-green-400' : 'text-muted-foreground'}`}>
              {status || (isResolvingNode ? 'Loading...' : 'Unknown')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('common.roles')}</dt>
            <dd className="font-mono text-foreground">
              {(roles ?? []).length > 0 ? (roles ?? []).join(', ') : (isResolvingNode ? 'Loading...' : 'unknown')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('drilldown.node.schedulable')}</dt>
            <dd className={`font-medium ${unschedulable ? 'text-red-400' : unschedulable === undefined && isResolvingNode ? 'text-muted-foreground' : 'text-green-400'}`}>
              {unschedulable !== undefined
                ? (unschedulable ? 'No (Cordoned)' : 'Yes')
                : (isResolvingNode ? 'Loading...' : 'Unknown')}
            </dd>
          </div>

          {/* Show additional info from cached node data if available */}
          {cachedNode?.kubeletVersion && (
            <div>
              <dt className="text-muted-foreground">Kubelet Version</dt>
              <dd className="font-mono text-foreground">{cachedNode.kubeletVersion}</dd>
            </div>
          )}
          {cachedNode?.cpuCapacity && (
            <div>
              <dt className="text-muted-foreground">CPU Capacity</dt>
              <dd className="font-mono text-foreground">{cachedNode.cpuCapacity}</dd>
            </div>
          )}
          {cachedNode?.memoryCapacity && (
            <div>
              <dt className="text-muted-foreground">Memory Capacity</dt>
              <dd className="font-mono text-foreground">{cachedNode.memoryCapacity}</dd>
            </div>
          )}
          {cachedNode?.podCapacity && (
            <div>
              <dt className="text-muted-foreground">Pod Capacity</dt>
              <dd className="font-mono text-foreground">{cachedNode.podCapacity}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={startDiagnosis}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-sm text-purple-400 hover:bg-purple-500/30 transition-colors"
        >
          <Stethoscope className="w-4 h-4" />
          AI Diagnose
        </button>
        <button
          onClick={() => drillToEvents(cluster, undefined, nodeName)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          View Events
        </button>
      </div>

      {/* Quick Commands */}
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Quick Commands
        </h4>
        <div className="space-y-2">
          {/* Describe Node */}
          <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
            <code className="text-muted-foreground truncate">kubectl --context {clusterShort} describe node {nodeName}</code>
            <button
              onClick={() => copyCommand(`kubectl --context ${clusterShort} describe node ${nodeName}`, 'describe')}
              className="ml-2 p-1 hover:bg-card rounded shrink-0"
              title={t('drilldown.tooltips.copyCommand')}
            >
              {copied === 'describe' ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
          </div>

          {/* Get Node Events */}
          <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
            <code className="text-muted-foreground truncate">kubectl --context {clusterShort} get events --field-selector involvedObject.name={nodeName}</code>
            <button
              onClick={() => copyCommand(`kubectl --context ${clusterShort} get events --field-selector involvedObject.name=${nodeName}`, 'events')}
              className="ml-2 p-1 hover:bg-card rounded shrink-0"
              title={t('drilldown.tooltips.copyCommand')}
            >
              {copied === 'events' ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
          </div>

          {/* Uncordon (if cordoned) */}
          {unschedulable && (
            <div className="flex items-center justify-between p-2 rounded bg-green-500/10 font-mono text-xs">
              <code className="text-green-400 truncate">kubectl --context {clusterShort} uncordon {nodeName}</code>
              <button
                onClick={() => copyCommand(`kubectl --context ${clusterShort} uncordon ${nodeName}`, 'uncordon')}
                className="ml-2 p-1 hover:bg-card rounded shrink-0"
                title={t('drilldown.tooltips.copyCommand')}
              >
                {copied === 'uncordon' ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
              </button>
            </div>
          )}

          {/* Check Node Conditions */}
          <div className="flex items-center justify-between p-2 rounded bg-background/50 font-mono text-xs">
            <code className="text-muted-foreground truncate">kubectl --context {clusterShort} get node {nodeName} -o jsonpath='{'{.status.conditions}'}'</code>
            <button
              onClick={() => copyCommand(`kubectl --context ${clusterShort} get node ${nodeName} -o jsonpath='{.status.conditions}'`, 'conditions')}
              className="ml-2 p-1 hover:bg-card rounded shrink-0"
              title={t('drilldown.tooltips.copyCommand')}
            >
              {copied === 'conditions' ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
          </div>
        </div>
      </div>

      {/* Repair Actions (for cordoned nodes) */}
      {unschedulable && (
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Repair Actions
          </h4>
          <div className="space-y-3">
            {/* AI-Assisted Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  closeDialog()
                  startMission({
                    title: `Investigate: ${nodeName}`,
                    description: `Investigating why node ${nodeName} was cordoned`,
                    type: 'troubleshoot',
                    initialPrompt: `I need to investigate why this Kubernetes node was cordoned.

**Node:** ${nodeName}
**Cluster:** ${clusterShort}
**Status:** Cordoned (unschedulable)

Please:
1. Investigate why this node was cordoned — check events, taints, and conditions.
2. Tell me what you found, then ask:
   - "It looks safe to uncordon — should I proceed?"
   - "There are issues to fix first — want me to show details?"
3. If I approve, uncordon and verify. Then ask:
   - "Should I monitor the node for a few minutes?"
   - "All done"`,
                    context: { cluster: clusterShort, node: nodeName }
                  })
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-sm text-yellow-400 hover:bg-yellow-500/30 transition-colors"
              >
                <Stethoscope className="w-4 h-4" />
                Investigate Why Cordoned
              </button>
              <button
                onClick={() => {
                  closeDialog()
                  startMission({
                    title: `Safe Uncordon: ${nodeName}`,
                    description: `Guide me through safely uncordoning node ${nodeName}`,
                    type: 'troubleshoot',
                    initialPrompt: `I want to safely uncordon this Kubernetes node and restore it to service.

**Node:** ${nodeName}
**Cluster:** ${clusterShort}
**Current Status:** Cordoned (unschedulable)

Please:
1. Run pre-flight checks — node health, resource availability, pending pods.
2. Tell me the results, then ask:
   - "Looks good — should I uncordon now?"
   - "There are concerns — want to see details?"
3. If I say go ahead, uncordon and verify scheduling resumes. Then ask:
   - "Should I monitor the node post-uncordon?"
   - "All done"`,
                    context: { cluster: clusterShort, node: nodeName }
                  })
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-sm text-green-400 hover:bg-green-500/30 transition-colors"
              >
                <Wrench className="w-4 h-4" />
                Guide: Safe Uncordon
              </button>
            </div>

            {/* Info cards */}
            <div className="text-sm space-y-2 mt-3">
              <div className="p-2 rounded bg-muted/30 text-xs text-muted-foreground">
                <strong>Tip:</strong> {t('drilldown.nodeDetail.tipInvestigate')}
                {t('drilldown.nodeDetail.cordonedHint')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
