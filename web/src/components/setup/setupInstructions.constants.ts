export const REPO_URL = 'https://github.com/kubestellar/console'
export const DOCS_URL = 'https://console-docs.kubestellar.io'
// Rendered docs site for the Console security model (shown alongside
// the source-grounded repo version and the AI-specific threat model).
export const SECURITY_DOC_URL = 'https://kubestellar.io/docs/console/main/console/security-model/'
export const SECURITY_DOC_REPO_URL = 'https://github.com/kubestellar/console/blob/main/docs/security/SECURITY-MODEL.md'
export const SECURITY_AI_DOC_URL = 'https://github.com/kubestellar/console/blob/main/docs/security/SECURITY-AI.md'
const CURL_BASE = 'https://raw.githubusercontent.com/kubestellar/console/main'

export const QUICKSTART_CMD = `curl -sSL ${CURL_BASE}/start.sh | bash`
export const K8S_DEPLOY_CMD = `curl -sSL ${CURL_BASE}/deploy.sh | bash`
export const DEV_MODE_CMD = 'git clone https://github.com/kubestellar/console.git && cd console && ./start-dev.sh'

/** Copy-button step keys — distinct ranges keep the "copied" checkmark scoped to one button. */
export const QUICKSTART_STEP_KEY = 1
export const OAUTH_STEP_KEY_BASE = 200
export const DEV_MODE_STEP_KEY = 300
export const K8S_DEPLOY_STEP_KEY = 400

/** Index of the "Restart the console" step — the last OAuth step */
export const OAUTH_RESTART_STEP_IDX = 7

export interface OAuthStep {
  label: string
  link?: string
  linkText?: string
  value?: string
  command?: string
}

export const OAUTH_STEPS: OAuthStep[] = [
  { label: 'Go to', link: 'https://github.com/settings/developers', linkText: 'GitHub Developer Settings' },
  { label: 'Click "New OAuth App" and fill in:' },
  { label: 'Application name:', value: 'KubeStellar Console' },
  { label: 'Homepage URL:', value: 'http://localhost:8080' },
  { label: 'Callback URL:', value: 'http://localhost:8080/auth/github/callback' },
  { label: 'Click "Register application", then copy the Client ID and generate a Client Secret' },
  { label: 'Create a .env file in the project root:', command: 'GITHUB_CLIENT_ID=<your-client-id>\nGITHUB_CLIENT_SECRET=<your-client-secret>' },
  { label: 'Restart the console (Ctrl+C, then re-run):', command: 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash' },
]
