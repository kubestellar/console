import { AlertTriangle } from 'lucide-react'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { GITHUB_TOKEN_CREATE_URL, GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS } from '../../lib/constants/github-token'
import { buildDirectIssueUrl } from './submitTab.utils'
import { getSettingsWithHash } from '../../config/routes'
import type { TargetRepo } from './FeatureRequestTypes'

interface SubmitTokenWarningProps {
  targetRepo: TargetRepo
  description: string
}

export function SubmitTokenWarning({ targetRepo, description }: SubmitTokenWarningProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
      <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-medium text-yellow-400 mb-1">GitHub integration not configured</p>
        <p className="text-muted-foreground text-xs">
          The <code className="px-1 py-0.5 rounded bg-secondary text-foreground text-2xs">FEEDBACK_GITHUB_TOKEN</code> is
          not set. Issue submission requires a GitHub personal access token with these permissions:
        </p>
        <ul className="text-muted-foreground text-xs list-disc ml-4 mt-1 space-y-0.5">
          {GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS.map(p => (
            <li key={p.scope}><em>{p.scope}</em> — to {p.reason}</li>
          ))}
        </ul>
        <div className="text-muted-foreground text-xs mt-1.5 flex flex-wrap gap-1 items-center">
          <a
            href={sanitizeUrl(buildDirectIssueUrl(targetRepo, description))}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
          >
            Report on GitHub
          </a>
          <span>{' · '}</span>
          <button
            type="button"
            onClick={() => window.open(GITHUB_TOKEN_CREATE_URL, '_blank', 'noopener,noreferrer')}
            className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
          >
            Create token on GitHub
          </button>
          <span>{' · '}</span>
          <button
            type="button"
            onClick={() => { window.location.href = getSettingsWithHash('github-token') }}
            className="text-purple-400 hover:text-purple-300 underline underline-offset-2 p-0 h-auto bg-transparent border-none"
          >
            Console Settings
          </button>
        </div>
      </div>
    </div>
  )
}
