import { type KeyboardEvent, type MouseEvent } from 'react'
import { Stethoscope, Wrench } from 'lucide-react'
import { useMissions } from '../../hooks/useMissions'
import { ApiKeyPromptModal, useApiKeyCheck } from '../../components/cards/console-missions/shared'

export interface CardAIResource {
  kind: string
  name: string
  namespace?: string
  cluster?: string
  status?: string
}

export interface CardAIActionsProps {
  /** Resource context for prompt generation */
  resource: CardAIResource
  /** Specific issues to include in AI prompts */
  issues?: Array<{ name: string; message: string }>
  /** Additional context passed to the AI agent */
  additionalContext?: Record<string, unknown>
  /** CSS class for the container */
  className?: string
  /** Whether to show the repair button (default: true) */
  showRepair?: boolean
  /** Custom tooltip for the repair button (default: "Repair") */
  repairLabel?: string
  /** Override the default diagnose prompt */
  diagnosePrompt?: string
  /** Override the default repair prompt */
  repairPrompt?: string
  /** Custom diagnose handler (bypasses startMission) */
  onDiagnose?: (e: MouseEvent | KeyboardEvent<HTMLDivElement>) => void
  /** Custom repair handler (bypasses startMission) */
  onRepair?: (e: MouseEvent | KeyboardEvent<HTMLDivElement>) => void
}

/**
 * Unified AI action buttons for cards. Renders compact icon-only Diagnose and
 * Repair buttons that open the AI missions sidebar with contextual prompts.
 *
 * Stops event propagation so parent onClick (drill-down) is not triggered.
 * Parent element should have `group` class for hover reveal.
 */
export function CardAIActions({
  resource,
  issues = [],
  additionalContext,
  className = '',
  showRepair = true,
  repairLabel = 'Repair',
  diagnosePrompt,
  repairPrompt,
  onDiagnose,
  onRepair }: CardAIActionsProps) {
  const { startMission } = useMissions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const { kind, name, namespace, cluster, status } = resource
  const loc = namespace ? ` in namespace "${namespace}"` : ''
  const on = cluster ? ` on cluster "${cluster}"` : ''
  const issuesList = issues.map(i => `- ${i.name}: ${i.message}`).join('\n')
  const hasIssues = issues.length > 0

  const handleDiagnose = (e: MouseEvent | KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (onDiagnose) { onDiagnose(e); return }
    checkKeyAndRun(() => {
      startMission({
        title: `Diagnose ${name}`,
        description: `Analyze ${kind} health and identify issues`,
        type: 'troubleshoot',
        cluster,
        initialPrompt: diagnosePrompt || `Analyze the health of ${kind} "${name}"${loc}${on}.

Current status: ${status || 'Unknown'}${hasIssues ? `\n\nKnown issues:\n${issuesList}` : ''}

Please provide:
1. Health assessment summary
2. Root cause analysis for any issues
3. Recommended actions to resolve`,
        context: { kind, name, namespace, cluster, status, issues, ...additionalContext } })
    })
  }

  const handleRepair = (e: MouseEvent | KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (onRepair) { onRepair(e); return }
    checkKeyAndRun(() => {
      startMission({
        title: `${repairLabel} ${name}`,
        description: `Fix issues with ${kind}`,
        type: 'repair',
        cluster,
        initialPrompt: repairPrompt || `I need help repairing issues with ${kind} "${name}"${loc}${on}.

Issues to fix:
${hasIssues ? issuesList : 'No specific issues identified - please diagnose first'}

For each issue, please:
1. Diagnose the root cause
2. Suggest a fix with the exact kubectl commands
3. Explain potential side effects
4. Apply fixes step by step with my confirmation`,
        context: { kind, name, namespace, cluster, status, issues, ...additionalContext } })
    })
  }

  const handleActionKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    action: (event: MouseEvent | KeyboardEvent<HTMLDivElement>) => void,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      action(event)
    }
  }

  return (
    <div
      className={`flex items-center gap-0.5 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleDiagnose}
        onKeyDown={(event) => handleActionKeyDown(event, handleDiagnose)}
        className="p-1 rounded text-muted-foreground hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
        title={`Diagnose ${name}`}
      >
        <Stethoscope className="w-3.5 h-3.5" />
      </div>

      {showRepair && (
        <div
          role="button"
          tabIndex={0}
          onClick={handleRepair}
          onKeyDown={(event) => handleActionKeyDown(event, handleRepair)}
          className="p-1 rounded text-muted-foreground hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
          title={`${repairLabel} ${name}`}
        >
          <Wrench className="w-3.5 h-3.5" />
        </div>
      )}

      {showKeyPrompt && (
        <ApiKeyPromptModal
          isOpen={showKeyPrompt}
          onDismiss={dismissPrompt}
          onGoToSettings={goToSettings}
        />
      )}
    </div>
  )
}
