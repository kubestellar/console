import { Lock, AlertTriangle, FileText, Monitor, BookOpen, Bug, Sparkles } from 'lucide-react'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Github } from '@/lib/icons'
import { Button } from '../ui/Button'
import { isDemoModeForced } from '../../lib/demoMode'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { GITHUB_TOKEN_CREATE_URL, GITHUB_TOKEN_FINE_GRAINED_PERMISSIONS } from '../../lib/constants/github-token'
import { getSettingsWithHash } from '../../config/routes'
import { buildDirectIssueUrl } from './submitTab.utils'
import { REWARD_ACTIONS } from '../../types/rewards'
import type { RequestType, TargetRepo } from './FeatureRequestTypes'

interface AuthGateBannerProps {
  directIssueUrl: string
  onShowLoginPrompt: () => void
}

export function AuthGateBanner({ directIssueUrl, onShowLoginPrompt }: AuthGateBannerProps) {
  const { t } = useTranslation()
  return (
    <div
      role="region"
      aria-label={t('feedback.authGateTitle')}
      className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/40"
    >
      <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
        <Lock className="w-4 h-4 text-yellow-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-yellow-400 mb-1">{t('feedback.authGateTitle')}</p>
        <p className="text-xs text-muted-foreground mb-3">
          {isDemoModeForced ? t('feedback.authGateBodyDemo') : t('feedback.authGateBodyLocal')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="accent"
            size="md"
            icon={<Github className="w-3.5 h-3.5" />}
            onClick={onShowLoginPrompt}
          >
            {isDemoModeForced ? t('feedback.loginWithGitHub') : t('feedback.setupOAuth')}
          </Button>
          <a
            href={sanitizeUrl(directIssueUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border text-foreground hover:bg-secondary/50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('feedback.openGitHubIssue')}
          </a>
        </div>
      </div>
    </div>
  )
}

interface FeedbackTokenMissingBannerProps {
  targetRepo: TargetRepo
  description: string
}

export function FeedbackTokenMissingBanner({ targetRepo, description }: FeedbackTokenMissingBannerProps) {
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

interface EditingDraftBannerProps {
  editingDraftId: string | null
  setEditingDraftId: (id: string | null) => void
  setDescription: (v: string) => void
  setRequestType: (v: RequestType) => void
  setTargetRepo: (v: TargetRepo) => void
  initialRequestType?: RequestType
}

export function EditingDraftBanner({
  editingDraftId, setEditingDraftId, setDescription, setRequestType, setTargetRepo, initialRequestType,
}: EditingDraftBannerProps) {
  if (!editingDraftId) return null
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
      <FileText className="w-4 h-4 text-orange-400 shrink-0" />
      <span className="text-xs text-orange-400">Editing a saved draft</span>
      <button
        type="button"
        onClick={() => {
          setEditingDraftId(null)
          setDescription('')
          setRequestType(initialRequestType || 'bug')
          setTargetRepo('console')
        }}
        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear
      </button>
    </div>
  )
}

interface SubmitTypeSelectorProps {
  requestType: RequestType
  setRequestType: (v: RequestType) => void
  inputsDisabled: boolean
}

export function SubmitTypeSelector({ requestType, setRequestType, inputsDisabled }: SubmitTypeSelectorProps) {
  const { t } = useTranslation()
  return (
    <fieldset
      disabled={inputsDisabled}
      className="flex gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      aria-disabled={inputsDisabled}
    >
      <button
        type="button"
        onClick={() => setRequestType('bug')}
        disabled={inputsDisabled}
        className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
          requestType === 'bug' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'border-border text-muted-foreground hover:border-muted-foreground'
        }`}
      >
        <Bug className="w-4 h-4" />
        {t('feedback.bugReport')}
        <span className="text-2xs text-muted-foreground">+{REWARD_ACTIONS.bug_report.coins}</span>
      </button>
      <button
        type="button"
        onClick={() => setRequestType('feature')}
        disabled={inputsDisabled}
        className={`flex-1 p-3 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
          requestType === 'feature' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'border-border text-muted-foreground hover:border-muted-foreground'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        {t('feedback.featureRequest')}
        <span className="text-2xs text-muted-foreground">+{REWARD_ACTIONS.feature_suggestion.coins}</span>
      </button>
    </fieldset>
  )
}

interface RepositorySelectorProps {
  targetRepo: TargetRepo
  setTargetRepo: (v: TargetRepo) => void
  inputsDisabled: boolean
}

export function RepositorySelector({ targetRepo, setTargetRepo, inputsDisabled }: RepositorySelectorProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        Where does this issue belong?
      </label>
      <fieldset
        disabled={inputsDisabled}
        className="flex gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        aria-disabled={inputsDisabled}
      >
        <button
          type="button"
          onClick={() => setTargetRepo('console')}
          disabled={inputsDisabled}
          className={`flex-1 p-2.5 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
            targetRepo === 'console' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'border-border text-muted-foreground hover:border-muted-foreground'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span className="text-sm">Console App</span>
        </button>
        <button
          type="button"
          onClick={() => setTargetRepo('docs')}
          disabled={inputsDisabled}
          className={`flex-1 p-2.5 rounded-lg border transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
            targetRepo === 'docs' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'border-border text-muted-foreground hover:border-muted-foreground'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-sm">Console Docs</span>
        </button>
      </fieldset>
      {targetRepo === 'docs' && (
        <p className="text-2xs text-amber-400/80 mt-1">
          This issue will be filed on <span className="font-mono">kubestellar/docs</span>
        </p>
      )}
    </div>
  )
}
