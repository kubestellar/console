import { useState } from 'react'
import { X, Server, ChevronDown, ChevronUp, Wrench, CheckCircle } from 'lucide-react'
import { NodeInfo } from '../../hooks/useMCP'
import { ConditionBadges, hasConditionIssues, getConditionIssuesSummary } from '../shared/ConditionBadges'
import { useMissions } from '../../hooks/useMissions'
import { cn } from '../../lib/cn'
import { formatK8sMemory, formatK8sStorage } from '../../lib/formatters'
import { StatusBadge } from '../ui/StatusBadge'

interface NodeDetailPanelProps {
  node: NodeInfo
  clusterName: string
  onClose?: () => void
}

const INITIAL_LABELS_SHOWN = 10

/**
 * Expanded detail panel for a Kubernetes node.
 * Shows node info, conditions, taints, labels (expandable), and a repair button if issues exist.
 */
export function NodeDetailPanel({ node, clusterName, onClose }: NodeDetailPanelProps) {
  const { startMission } = useMissions()
  const [showAllLabels, setShowAllLabels] = useState(false)

  const hasIssues = hasConditionIssues(node.conditions)
  const labelEntries = Object.entries(node.labels || {})
  const hasMoreLabels = labelEntries.length > INITIAL_LABELS_SHOWN
  const displayedLabels = showAllLabels ? labelEntries : labelEntries.slice(0, INITIAL_LABELS_SHOWN)

  const handleRepair = () => {
    if (!clusterName) {
      return
    }
    const issueConditions = getConditionIssuesSummary(node.conditions)

    startMission({
      title: `Repair Node ${node.name}`,
      description: `Diagnose and repair node issues: ${issueConditions}`,
      type: 'repair',
      cluster: clusterName,
      initialPrompt: `I need help diagnosing and repairing issues with node "${node.name}" in cluster "${clusterName}".

Current node conditions:
${(node.conditions ?? []).map(c => `- ${c.type}: ${c.status}${c.message ? ` (${c.message})` : ''}${c.reason ? ` [${c.reason}]` : ''}`).join('\n') || 'No conditions available'}

Node details:
- Internal IP: ${node.internalIP || 'N/A'}
- Kubelet version: ${node.kubeletVersion || 'N/A'}
- OS/Arch: ${node.os}/${node.architecture}
- Container Runtime: ${node.containerRuntime || 'N/A'}

Please help me:
1. Investigate the root cause of the issues
2. Check relevant logs and events
3. Suggest remediation steps
4. Apply fixes if appropriate (with my confirmation)

Please proceed step by step and ask for confirmation before making any changes.`,
      context: {
        nodeName: node.name,
        clusterName,
        conditions: node.conditions,
        internalIP: node.internalIP,
        kubeletVersion: node.kubeletVersion,
      },
    })
  }

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden mb-2',
        hasIssues ? 'bg-orange-500/10 border-orange-500/20' : 'bg-card/50 border-border'
      )}
    >
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-border/30">
        <div className="flex items-center gap-2">
          <StatusBadge color="cyan" icon={<Server className="w-3 h-3" />}>Node</StatusBadge>
          <span className="font-medium text-foreground">{node.name}</span>
          {node.roles.map(role => (
            <span key={role} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {role}
            </span>
          ))}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-3 text-sm">
        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-muted-foreground">Internal IP:</span>
            <span className="ml-2 font-mono text-foreground">{node.internalIP || '-'}</span>
          </div>
          {node.externalIP && (
            <div>
              <span className="text-muted-foreground">External IP:</span>
              <span className="ml-2 font-mono text-foreground">{node.externalIP}</span>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Kubelet:</span>
            <span className="ml-2 text-foreground">{node.kubeletVersion}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Runtime:</span>
            <span className="ml-2 text-foreground">{node.containerRuntime || '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">OS/Arch:</span>
            <span className="ml-2 text-foreground">{node.os}/{node.architecture}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Age:</span>
            <span className="ml-2 text-foreground">{node.age}</span>
          </div>
        </div>

        {/* Capacity */}
        <div>
          <span className="text-muted-foreground">Capacity:</span>
          <span className="ml-2 text-foreground">
            {node.cpuCapacity} CPU, {formatK8sMemory(node.memoryCapacity)} RAM{node.storageCapacity ? `, ${formatK8sStorage(node.storageCapacity)} Storage` : ''}, {node.podCapacity} pods
          </span>
        </div>

        {/* Conditions */}
        <div>
          <span className="text-muted-foreground">Conditions:</span>
          <ConditionBadges conditions={node.conditions} className="mt-1" />
        </div>

        {/* Taints */}
        {node.taints && node.taints.length > 0 && (
          <div>
            <span className="text-muted-foreground">Taints:</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {node.taints.map((taint, i) => (
                <StatusBadge key={i} color="yellow" size="md">
                  {taint}
                </StatusBadge>
              ))}
            </div>
          </div>
        )}

        {/* Labels - Expandable */}
        {labelEntries.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Labels ({labelEntries.length}):</span>
              {hasMoreLabels && (
                <button
                  onClick={() => setShowAllLabels(!showAllLabels)}
                  className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                >
                  {showAllLabels ? (
                    <>Show less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>Show all <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {displayedLabels.map(([k, v]) => (
                <StatusBadge key={k} color="blue" size="md" className="font-mono">
                  {k}={v}
                </StatusBadge>
              ))}
            </div>
          </div>
        )}

        {/* Repair button - only shown when node has issues */}
        {hasIssues ? (
          <button
            onClick={handleRepair}
            disabled={!clusterName}
            className={cn(
              'mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors w-full justify-center',
              clusterName
                ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 cursor-pointer'
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            )}
          >
            <Wrench className="w-3.5 h-3.5" />
            Repair
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium w-full justify-center bg-green-500/10 text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />
            Healthy
          </div>
        )}
      </div>
    </div>
  )
}
