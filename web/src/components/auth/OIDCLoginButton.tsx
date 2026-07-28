import { Github } from '@/lib/icons'
import { Button } from '../ui/Button'

interface OIDCLoginButtonProps {
  isHostedDemoLogin: boolean
  onLogin: () => void
  label: string
}

export function OIDCLoginButton({
  isHostedDemoLogin,
  onLogin,
  label,
}: OIDCLoginButtonProps) {
  return (
    <Button
      data-testid="github-login-button"
      onClick={() => { if (!isHostedDemoLogin) { onLogin() } }}
      disabled={isHostedDemoLogin}
      title={isHostedDemoLogin ? 'Not available in the hosted demo — self-host to enable GitHub OAuth' : undefined}
      variant="secondary"
      size="lg"
      fullWidth
      icon={<Github className="w-5 h-5" />}
      className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 hover:shadow-lg disabled:hover:bg-white dark:disabled:hover:bg-gray-800 disabled:hover:shadow-none"
    >
      {label}
    </Button>
  )
}
