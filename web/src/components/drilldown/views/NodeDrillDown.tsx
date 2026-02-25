import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Terminal, Stethoscope, Wrench, CheckCircle, Copy, ExternalLink } from 'lucide-react'
import { useDrillDownActions, useDrillDown } from '../../../hooks/useDrillDown'
import { useMissions } from '../../../hooks/useMissions'
import { useTranslation } from 'react-i18next'

interface Props {
  data: Record<string, unknown>
}

export function NodeDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const nodeName = data.node as string
  const status = data.status as string | undefined
  const unschedulable = data.unschedulable as boolean | undefined
  const issue = data.issue as string | undefined
  const roles = data.roles as string[] | undefined

  const { drillToEvents } = useDrillDownActions()
  const { close: closeDialog } = useDrillDown()
  const { startMission } = useMissions()
  const [copied, setCopied] = useState<string | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const isOffline = status === 'Cordoned' || status === 'NotReady' || unschedulable
  const clusterShort = cluster.split('/').pop() || cluster

  const copyCommand = (cmd: string, label: string) => {
    navigator.clipboard.writeText(cmd)
    setCopied(label)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(null), 2000)
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
- Roles: ${(roles ?? []).join(', ') || 'worker'}
- Issue: ${issue || 'Node is not healthy'}

Please help me:
1. **Diagnose** - What could cause this node to be in this state?
2. **Investigate** - What commands should I run to gather more information?
3. **Remediate** - What are the steps to fix this issue?
4. **Prevent** - How can I prevent this from happening again?

Start by checking node events and conditions.`,
      context: { cluster: clusterShort, node: nodeName, status, unschedulable }
    })
  }

  return (
    <div className="space-y-6">
      {/* Status Banner for Offline Nodes */}
      {isOffline && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-400">{t('drilldown.node.nodeIssueDetected')}</h4>
              <p className="text-sm text-red-300/80 mt-1">{issue || 'This node is not accepting new workloads'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Node Info */}
      <div className="p-4 rounded-lg bg-card/50 border border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Node: {nodeName}</h3>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">{t('common.cluster')}</dt>
            <dd className="font-mono text-foreground">{clusterShort}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('common.status')}</dt>
            <dd className={`font-medium ${isOffline ? 'text-red-400' : 'text-green-400'}`}>
              {status || 'Unknown'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('common.roles')}</dt>
            <dd className="font-mono text-foreground">{(roles ?? []).join(', ') || 'worker'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('drilldown.node.schedulable')}</dt>
            <dd className={`font-medium ${unschedulable ? 'text-red-400' : 'text-green-400'}`}>
              {unschedulable ? 'No (Cordoned)' : 'Yes'}
            </dd>
          </div>
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
              className="ml-2 p-1 hover:bg-card rounded flex-shrink-0"
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
              className="ml-2 p-1 hover:bg-card rounded flex-shrink-0"
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
                className="ml-2 p-1 hover:bg-card rounded flex-shrink-0"
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
              className="ml-2 p-1 hover:bg-card rounded flex-shrink-0"
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

Please help me:
1. What are common reasons a node gets cordoned?
2. What should I check to understand why this node was cordoned?
3. Is it safe to uncordon this node?
4. What kubectl commands should I run to investigate?

Provide specific commands I can run to diagnose the issue.`,
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

Please guide me through:
1. Pre-flight checks before uncordoning (node health, resource availability)
2. The uncordon command and what to expect
3. Post-uncordon verification steps
4. How to monitor the node after uncordoning
5. Rollback plan if issues occur

Provide the specific kubectl commands for cluster context "${clusterShort}".`,
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
                <strong>Tip:</strong> Use "Investigate" to understand why the node was cordoned before uncordoning.
                Nodes may be cordoned for maintenance, upgrades, or due to detected issues.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
