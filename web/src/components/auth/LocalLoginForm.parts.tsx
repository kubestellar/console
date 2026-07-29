import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, ExternalLink, KeyRound, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { sanitizeUrl } from '@/lib/utils/sanitizeUrl'
import { Button } from '../ui/Button'
import type { OAuthErrorEntry } from './useLocalLogin'
import { DEFAULT_OAUTH_CALLBACK, GITHUB_DEVELOPER_SETTINGS_URL } from './useLocalLogin'

interface OAuthSetupStep {
  label: string
  link?: string
  linkText?: string
  value?: string
  command?: string
}

const OAUTH_SETUP_STEPS: OAuthSetupStep[] = [
  { label: 'Go to', link: GITHUB_DEVELOPER_SETTINGS_URL, linkText: 'GitHub Developer Settings' },
  { label: 'Click "New OAuth App" and fill in:' },
  { label: 'Application name:', value: 'KubeStellar Console' },
  { label: 'Homepage URL:', value: 'http://localhost:8080' },
  { label: 'Callback URL:', value: DEFAULT_OAUTH_CALLBACK },
  { label: 'Click "Register application", then copy the Client ID and generate a Client Secret' },
  { label: 'Create a .env file in the project root:', command: 'GITHUB_CLIENT_ID=<your-client-id>\nGITHUB_CLIENT_SECRET=<your-client-secret>' },
  { label: 'Restart the console:', command: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash' },
]

// ─── OAuthErrorBanner ────────────────────────────────────────────────────────

export interface OAuthErrorBannerProps {
  errorInfo: OAuthErrorEntry
  errorDetail: string | null
  repoUrl: string
}

export function OAuthErrorBanner({ errorInfo, errorDetail, repoUrl }: OAuthErrorBannerProps) {
  return (
    <div data-testid="oauth-error-banner" className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 text-red-300 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
        <div>
          <div className="font-medium text-red-300">{errorInfo.title}</div>
          <div className="text-xs text-red-400/80 mt-0.5">{errorInfo.message}</div>
        </div>
      </div>
      {errorDetail && (
        <div className="px-4 pb-2">
          <div className="text-xs text-red-400/60 bg-red-500/5 rounded px-3 py-2 font-mono wrap-break-word">
            {errorDetail}
          </div>
        </div>
      )}
      <div className="px-4 pb-3">
        <div className="text-xs font-medium text-red-300/80 mb-1.5">Troubleshooting:</div>
        <ol className="text-xs text-red-400/70 space-y-1 list-decimal list-inside">
          {(errorInfo.steps || []).map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <div className="flex items-center gap-2 mt-3">
          <a
            href="https://github.com/settings/developers"
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 text-xs rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
          >
            <Settings className="w-3 h-3" />
            GitHub OAuth Settings
          </a>
          <a
            href={`${repoUrl}#quick-start`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1.5 text-xs rounded border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" />
            Setup Guide
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── OAuthSetupNotice ─────────────────────────────────────────────────────────

export interface OAuthSetupNoticeProps {
  oauthSetupExpanded: boolean
  onToggleExpand: () => void
  copiedStep: number | null
  onCopyStep: (text: string | undefined, stepKey: number) => Promise<void>
  repoUrl: string
}

export function OAuthSetupNotice({
  oauthSetupExpanded,
  onToggleExpand,
  copiedStep,
  onCopyStep,
  repoUrl,
}: OAuthSetupNoticeProps) {
  const { t } = useTranslation('common')

  return (
    <div data-testid="oauth-setup-notice" className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <KeyRound className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-xs">
            <div className="font-medium text-blue-300 mb-1">{t('login.oauthNotConfigured')}</div>
            <p className="text-blue-300/80 leading-relaxed">
              {t('login.oauthNotConfiguredDescription')}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <Button
          onClick={onToggleExpand}
          variant="ghost"
          size="sm"
          icon={oauthSetupExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          className="text-blue-400 hover:text-blue-300 h-auto p-0"
        >
          {t('login.showSetupSteps')}
        </Button>

        {oauthSetupExpanded && (
          <div className="mt-2 space-y-2">
            {OAUTH_SETUP_STEPS.map((step, idx) => (
              <div key={idx} className="text-xs">
                {step.link ? (
                  <span className="text-muted-foreground">
                    {idx + 1}. {step.label}{' '}
                    <a
                      href={sanitizeUrl(step.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      {step.linkText}
                    </a>
                  </span>
                ) : step.value ? (
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-muted-foreground shrink-0">{step.label}</span>
                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-foreground select-all">
                      {step.value}
                    </code>
                  </div>
                ) : step.command ? (
                  <div className="ml-4 mt-1">
                    <span className="text-muted-foreground">{idx + 1}. {step.label}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <pre className="flex-1 rounded bg-muted px-3 py-1.5 font-mono text-foreground select-all overflow-x-auto whitespace-pre text-xs">
                        {step.command}
                      </pre>
                      <Button
                        onClick={() => onCopyStep(step.command, idx)}
                        variant="ghost"
                        size="sm"
                        icon={copiedStep === idx ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        title="Copy"
                        className="shrink-0 self-start p-1.5"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    {idx + 1}. {step.label}
                  </span>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/30">
              <a
                href={GITHUB_DEVELOPER_SETTINGS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-1.5"
              >
                <Settings className="w-3 h-3" />
                {t('login.openGitHubSettings')}
              </a>
              <a
                href={`${repoUrl}#quick-start`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 text-xs rounded border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                {t('login.fullSetupGuide')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
