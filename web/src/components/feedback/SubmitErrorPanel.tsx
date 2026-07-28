import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Github } from '@/lib/icons'
import { Settings } from 'lucide-react'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import type { SubmitErrorDetails } from './submitTab.utils'

interface SubmitErrorPanelProps {
  errorDetails: SubmitErrorDetails
  directIssueUrl: string
  setError: (v: string | null) => void
  onShowSetupDialog: () => void
  onReauthenticate: () => void
}

export function SubmitErrorPanel({ errorDetails, directIssueUrl, setError, onShowSetupDialog, onReauthenticate }: SubmitErrorPanelProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <p className="text-sm text-red-400">{errorDetails.message}</p>
      <div className="p-3 bg-secondary/30 border border-border rounded-lg">
        <p className="text-xs text-muted-foreground mb-2">{errorDetails.guidance}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={sanitizeUrl(directIssueUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            {t('feedback.openGitHubIssue')}
          </a>
          {errorDetails.action === 'reauthenticate' && (
            <button
              type="button"
              onClick={onReauthenticate}
              className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1.5"
            >
              <Github className="w-3 h-3" />
              {t('feedback.reauthenticateGitHub', 'Re-authenticate with GitHub')}
            </button>
          )}
          {errorDetails.action === 'setup' && (
            <button
              type="button"
              onClick={() => { setError(null); onShowSetupDialog() }}
              className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors flex items-center gap-1.5"
            >
              <Settings className="w-3 h-3" />
              {t('feedback.setupOAuth')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
