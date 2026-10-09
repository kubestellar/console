import {
  AlertTriangle, CheckCircle, XCircle, Clock, Loader2, ExternalLink, Stethoscope } from 'lucide-react'
import { CardAIActions } from '../../../lib/cards/CardComponents'
import { useMissions } from '../../../hooks/useMissions'
import { cn } from '../../../lib/cn'
import { sanitizeUrl } from '../../../lib/utils/sanitizeUrl'
import { formatTimeAgo } from './gitHubCIUtils'
import { CONCLUSION_BADGE, STATUS_BADGE, TITLE_DIAGNOSE, type WorkflowRun } from './GitHubCIMonitor.constants'

interface GitHubCIWorkflowRowProps {
  workflow: WorkflowRun
  /** Display status (conclusion when completed, otherwise run status). */
  status: string
}

/** Single workflow run row in the GitHub CI monitor list. */
export function GitHubCIWorkflowRow({ workflow: w, status }: GitHubCIWorkflowRowProps) {
  const { startMission } = useMissions()
  const badgeClass = w.status === 'completed'
    ? (CONCLUSION_BADGE[w.conclusion || ''] || 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground')
    : (STATUS_BADGE[w.status] || 'bg-gray-500/20 dark:bg-gray-400/20 text-muted-foreground')
  const StatusIcon = w.conclusion === 'success' ? CheckCircle :
                     w.conclusion === 'failure' ? XCircle :
                     w.status === 'in_progress' ? Loader2 :
                     w.status === 'queued' ? Clock : AlertTriangle

  return (
    <div
      className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-card/30 transition-colors"
    >
      <StatusIcon className={cn(
        'w-3.5 h-3.5 shrink-0',
        w.conclusion === 'success' ? 'text-green-400' :
        w.conclusion === 'failure' ? 'text-red-400' :
        w.status === 'in_progress' ? 'text-blue-400 animate-spin' :
        'text-muted-foreground',
      )} />
      <div className="flex-1 min-w-0">
        <span className="text-xs text-foreground truncate block">{w.name}</span>
        <span className="text-2xs text-muted-foreground truncate block flex items-center gap-1">
          {w.repo.split('/')[1]} · {w.branch}
          {w.prNumber && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                window.open(
                  sanitizeUrl(w.prUrl || `https://github.com/${w.repo}/pull/${w.prNumber}`),
                  '_blank',
                  'noopener,noreferrer',
                )
              }}
              className="text-blue-400 hover:underline"
            >
              #{w.prNumber}
            </button>
          )}
        </span>
      </div>
      <span className={cn('text-2xs px-1 py-0.5 rounded shrink-0', badgeClass)}>
        {status}
      </span>
      <span className="text-2xs text-muted-foreground shrink-0">
        {formatTimeAgo(w.updatedAt)}
      </span>
      {(w.conclusion === 'failure' || w.conclusion === 'timed_out' || w.conclusion === 'startup_failure') && (
        <>
          <button
            type="button"
            onClick={() => startMission({
              title: `Diagnose: ${w.name}`,
              description: `Diagnose failing workflow ${w.name} on ${w.repo}`,
              type: 'troubleshoot',
              initialPrompt: `Diagnose why the "${w.name}" workflow failed on ${w.repo} (branch: ${w.branch}).\n\nRun URL: ${w.url}\n\nPlease:\n1. Check the workflow logs and identify the root cause.\n2. Tell me what went wrong, then ask:\n   - "Should I create a fix?"\n   - "Show me more details"\n3. If I say fix it, create a branch with the fix and open a PR.`,
            })}
            className="text-muted-foreground hover:text-blue-400 p-1 rounded hover:bg-blue-500/10 shrink-0"
            title={TITLE_DIAGNOSE}
          >
            <Stethoscope className="w-3 h-3" />
          </button>
          <CardAIActions
            resource={{ kind: 'GitHubWorkflow', name: w.name, status: w.conclusion }}
            issues={[{ name: `${w.conclusion} on ${w.repo}/${w.branch}`, message: `Run #${w.runNumber}, event: ${w.event}` }]}
            showRepair={false}
          />
        </>
      )}
      {w.url !== '#' && (
        <a
          href={sanitizeUrl(w.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 p-0.5 rounded hover:bg-secondary transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3 text-muted-foreground" />
        </a>
      )}
    </div>
  )
}
