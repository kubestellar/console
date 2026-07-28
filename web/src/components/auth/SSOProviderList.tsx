import { ExternalLink, KeyRound, Monitor } from 'lucide-react'
import { Github } from '@/lib/icons'
import { Button } from '../ui/Button'

interface SSOProviderListProps {
  inClusterNoOAuth: boolean
  oauthSetupExpanded: boolean
  continueWithClusterAccessLabel: string
  signInToGitHubFirstLabel: string
  setupGitHubSignInLabel: string
  hideManualSetupLabel: string
  showManualSetupLabel: string
  continueInDemoModeLabel: string
  onClusterAccess: () => void
  onSetupGitHub: () => void
  onToggleManualSetup: () => void
  onDemoMode: () => void
}

export function SSOProviderList({
  inClusterNoOAuth,
  oauthSetupExpanded,
  continueWithClusterAccessLabel,
  signInToGitHubFirstLabel,
  setupGitHubSignInLabel,
  hideManualSetupLabel,
  showManualSetupLabel,
  continueInDemoModeLabel,
  onClusterAccess,
  onSetupGitHub,
  onToggleManualSetup,
  onDemoMode,
}: SSOProviderListProps) {
  return (
    <div className="space-y-3">
      {inClusterNoOAuth && (
        <Button
          data-testid="cluster-access-button"
          onClick={onClusterAccess}
          variant="primary"
          size="lg"
          fullWidth
          icon={<KeyRound className="w-5 h-5" />}
        >
          {continueWithClusterAccessLabel}
        </Button>
      )}
      <a
        href="https://github.com"
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center text-xs text-muted-foreground hover:text-blue-400 transition-colors mb-1"
      >
        {signInToGitHubFirstLabel}
        <ExternalLink className="w-3 h-3 inline ml-1 -mt-0.5" />
      </a>
      <Button
        data-testid="github-setup-button"
        onClick={onSetupGitHub}
        variant="secondary"
        size="lg"
        fullWidth
        icon={<Github className="w-5 h-5" />}
        className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 hover:shadow-lg"
      >
        {setupGitHubSignInLabel}
      </Button>
      <Button
        onClick={onToggleManualSetup}
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground mx-auto h-auto p-0"
      >
        {oauthSetupExpanded ? hideManualSetupLabel : showManualSetupLabel}
      </Button>
      <Button
        data-testid="demo-mode-button"
        onClick={onDemoMode}
        variant="secondary"
        size="md"
        fullWidth
        icon={<Monitor className="w-4 h-4" />}
        className="text-muted-foreground border border-border/50 hover:bg-secondary/50 hover:text-foreground"
      >
        {continueInDemoModeLabel}
      </Button>
    </div>
  )
}
