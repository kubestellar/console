import { useCallback, useMemo } from 'react'
import { Stethoscope, Wrench, Wand2 } from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import type { ResourceContext, AIAction, MissionType } from '../types/modal.types'

interface UseModalAIOptions {
  /** The resource being viewed in the modal */
  resource: ResourceContext
  /** Additional context to include in AI prompts */
  additionalContext?: Record<string, unknown>
  /** Custom issues list to include in prompts */
  issues?: Array<{ name: string; message: string }>
}

interface UseModalAIReturn {
  /** Default AI actions (Diagnose, Repair, Ask) */
  defaultAIActions: AIAction[]
  /** Handle executing an AI action */
  handleAIAction: (action: AIAction) => void
  /** Whether the AI agent is connected */
  isAgentConnected: boolean
  /** Start a custom mission */
  startCustomMission: (prompt: string) => void
}

/**
 * Hook for integrating AI actions into modals
 *
 * Provides standard Diagnose, Repair, and Ask actions that integrate
 * with the AI mission system.
 *
 * @example
 * ```tsx
 * const { defaultAIActions, handleAIAction, isAgentConnected } = useModalAI({
 *   resource: {
 *     kind: 'Pod',
 *     name: 'my-pod',
 *     namespace: 'default',
 *     cluster: 'my-cluster',
 *   },
 *   issues: [{ name: 'CrashLoopBackOff', message: 'Container keeps restarting' }],
 * })
 *
 * // Use in AIActionBar
 * <AIActionBar actions={defaultAIActions} onAction={handleAIAction} />
 * ```
 */
export function useModalAI({
  resource,
  additionalContext,
  issues = [],
}: UseModalAIOptions): UseModalAIReturn {
  const { startMission, agents } = useMissions()

  const isAgentConnected = agents.length > 0

  // Generate prompt templates based on resource
  const generateDiagnosePrompt = useCallback(() => {
    const { kind, name, namespace, cluster, status, labels } = resource

    const issuesList = issues.length > 0
      ? `\n\nKnown issues:\n${issues.map(i => `- ${i.name}: ${i.message}`).join('\n')}`
      : ''

    const labelsList = labels && Object.keys(labels).length > 0
      ? `\nLabels: ${Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(', ')}`
      : ''

    return `Analyze the health of ${kind} "${name}"${namespace ? ` in namespace "${namespace}"` : ''} on cluster "${cluster}".

Current state:
- Status: ${status || 'Unknown'}${labelsList}${issuesList}

Please provide:
1. Health assessment summary
2. Identified issues and their severity
3. Root cause analysis
4. Recommended actions to resolve issues
5. Preventive measures`
  }, [resource, issues])

  const generateRepairPrompt = useCallback(() => {
    const { kind, name, namespace, cluster } = resource

    const issuesList = issues.length > 0
      ? issues.map(i => `- ${i.name}: ${i.message}`).join('\n')
      : 'No specific issues identified - please diagnose first'

    return `I need help repairing issues with ${kind} "${name}"${namespace ? ` in namespace "${namespace}"` : ''} on cluster "${cluster}".

Issues to fix:
${issuesList}

For each issue, please:
1. Diagnose the root cause
2. Suggest a fix with the exact kubectl commands needed
3. Explain what each command does
4. Warn about any potential side effects

After I approve, help me execute the repairs step by step.`
  }, [resource, issues])

  const generateAskPrompt = useCallback(() => {
    const { kind, name, namespace, cluster } = resource

    return `I have a question about ${kind} "${name}"${namespace ? ` in namespace "${namespace}"` : ''} on cluster "${cluster}".`
  }, [resource])

  // Default AI actions
  const defaultAIActions: AIAction[] = useMemo(() => {
    const hasIssues = issues.length > 0

    return [
      {
        id: 'diagnose',
        label: 'Diagnose',
        icon: Stethoscope,
        description: `Analyze ${resource.kind} health and identify issues`,
        missionType: 'troubleshoot' as MissionType,
        promptTemplate: generateDiagnosePrompt(),
        disabled: !isAgentConnected,
        disabledReason: !isAgentConnected ? 'AI agent not connected' : undefined,
      },
      {
        id: 'repair',
        label: 'Repair',
        icon: Wrench,
        description: `Fix issues with this ${resource.kind}`,
        missionType: 'repair' as MissionType,
        promptTemplate: generateRepairPrompt(),
        disabled: !isAgentConnected || !hasIssues,
        disabledReason: !isAgentConnected
          ? 'AI agent not connected'
          : !hasIssues
          ? 'No issues detected'
          : undefined,
      },
      {
        id: 'ask',
        label: 'Ask',
        icon: Wand2,
        description: `Ask a question about this ${resource.kind}`,
        missionType: 'custom' as MissionType,
        promptTemplate: generateAskPrompt(),
        disabled: !isAgentConnected,
        disabledReason: !isAgentConnected ? 'AI agent not connected' : undefined,
      },
    ]
  }, [resource, issues, isAgentConnected, generateDiagnosePrompt, generateRepairPrompt, generateAskPrompt])

  // Handle executing an AI action
  const handleAIAction = useCallback(
    (action: AIAction) => {
      if (action.disabled) return

      const { kind, name, namespace, cluster } = resource
      const shortName = name.length > 30 ? name.slice(0, 27) + '...' : name

      startMission({
        title: `${action.label} ${shortName}`,
        description: action.description,
        type: action.missionType,
        cluster,
        initialPrompt: action.promptTemplate,
        context: {
          kind,
          name,
          namespace,
          cluster,
          ...additionalContext,
        },
      })
    },
    [resource, additionalContext, startMission]
  )

  // Start a custom mission with a specific prompt
  const startCustomMission = useCallback(
    (prompt: string) => {
      const { kind, name, namespace, cluster } = resource
      const shortName = name.length > 30 ? name.slice(0, 27) + '...' : name

      startMission({
        title: `Question about ${shortName}`,
        description: `Custom question about ${kind}`,
        type: 'custom',
        cluster,
        initialPrompt: prompt,
        context: {
          kind,
          name,
          namespace,
          cluster,
          ...additionalContext,
        },
      })
    },
    [resource, additionalContext, startMission]
  )

  return {
    defaultAIActions,
    handleAIAction,
    isAgentConnected,
    startCustomMission,
  }
}

/**
 * Generate suggested missions based on resource state
 */
export function generateMissionSuggestions(
  resource: ResourceContext,
  issues: Array<{ name: string; message: string; severity?: string }>
) {
  const suggestions = []

  // Critical issues get repair suggestions
  const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'high')
  if (criticalIssues.length > 0) {
    suggestions.push({
      id: 'repair-critical',
      title: `Fix ${criticalIssues.length} critical issue${criticalIssues.length > 1 ? 's' : ''}`,
      description: `Repair critical issues affecting ${resource.kind} ${resource.name}`,
      priority: 'critical' as const,
      missionType: 'repair' as const,
      prompt: `Help me fix these critical issues with ${resource.kind} "${resource.name}":\n${criticalIssues.map(i => `- ${i.name}: ${i.message}`).join('\n')}`,
    })
  }

  // Pods with restarts get troubleshoot suggestions
  if (resource.kind === 'Pod' && issues.some(i => i.name.includes('restart'))) {
    suggestions.push({
      id: 'troubleshoot-restarts',
      title: 'Investigate pod restarts',
      description: 'Analyze why this pod keeps restarting',
      priority: 'high' as const,
      missionType: 'troubleshoot' as const,
      prompt: `Analyze why pod "${resource.name}" in namespace "${resource.namespace}" keeps restarting. Check logs, events, and resource limits.`,
    })
  }

  // Deployments with unavailable replicas
  if (resource.kind === 'Deployment' && issues.some(i => i.name.includes('Unavailable'))) {
    suggestions.push({
      id: 'fix-deployment',
      title: 'Fix unavailable replicas',
      description: 'Get deployment back to healthy state',
      priority: 'high' as const,
      missionType: 'repair' as const,
      prompt: `Help me fix deployment "${resource.name}" which has unavailable replicas. Diagnose the issue and suggest remediation.`,
    })
  }

  return suggestions
}
