import { useTranslation } from 'react-i18next'
import { Lock, ExternalLink } from 'lucide-react'
import { Github } from '@/lib/icons'
import { Button } from '../ui/Button'
import { isDemoModeForced } from '../../lib/demoMode'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'

interface SubmitAuthGateBannerProps {
  directIssueUrl: string
  onShowLoginPrompt: () => void
}

export function SubmitAuthGateBanner({ directIssueUrl, onShowLoginPrompt }: SubmitAuthGateBannerProps) {
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
