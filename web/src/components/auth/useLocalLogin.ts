import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { LoginOptions } from '../../lib/devLogin'
import { useBranding } from '../../hooks/useBranding'
import type { BrandingConfig } from '../../lib/branding'
import { checkOAuthConfiguredWithRetry } from '../../lib/api'
import { emitLogin } from '../../lib/analytics'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

export const GITHUB_DEVELOPER_SETTINGS_URL = 'https://github.com/settings/developers'
export const DEFAULT_OAUTH_CALLBACK = 'http://localhost:8080/auth/github/callback'

export interface OAuthErrorEntry {
  title: string
  message: string
  steps: string[]
}

export const OAUTH_ERROR_INFO: Record<string, OAuthErrorEntry> = {
  exchange_failed: {
    title: 'GitHub OAuth Token Exchange Failed',
    message: 'The console was unable to complete the login with GitHub. This usually means your OAuth app is misconfigured.',
    steps: [
      'Check that GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set in your .env file',
      'Verify the Client Secret in your GitHub OAuth app matches what\'s in .env (regenerate if unsure)',
      'Confirm the "Authorization callback URL" in your GitHub OAuth app is set to: http://localhost:8080/auth/github/callback',
      'Restart the console after updating .env',
    ] },
  invalid_client: {
    title: 'Invalid OAuth Client Credentials',
    message: 'GitHub rejected the client ID or client secret. Your OAuth app may be misconfigured or the credentials may have been rotated.',
    steps: [
      'Open your GitHub OAuth app settings and copy a fresh Client ID and Client Secret',
      'Update GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file',
      'If using GitHub Enterprise, verify GITHUB_URL points to the correct instance',
      'Restart the console after updating .env',
    ] },
  redirect_mismatch: {
    title: 'OAuth Callback URL Mismatch',
    message: 'The callback URL configured in the console does not match the one registered in your GitHub OAuth app.',
    steps: [
      'Open your GitHub OAuth app settings',
      'Set "Authorization callback URL" to: http://localhost:8080/auth/github/callback',
      'If using a custom BACKEND_URL, make sure the callback URL matches: <BACKEND_URL>/auth/github/callback',
      'Restart the console after updating the GitHub OAuth app',
    ] },
  network_error: {
    title: 'Network Error',
    message: 'The console backend could not reach GitHub to complete authentication. This is usually a connectivity issue.',
    steps: [
      'Check your internet connection',
      'If behind a corporate proxy or firewall, ensure github.com and api.github.com are reachable',
      'Try again in a few moments — GitHub may be experiencing an outage',
      'Check https://www.githubstatus.com for service status',
    ] },
  csrf_validation_failed: {
    title: 'Login Session Expired',
    message: 'The login session timed out or was interrupted. This can happen with Safari or slow networks.',
    steps: [
      'Try logging in again — click "Continue with GitHub" below',
      'If using Safari, try Chrome or Firefox instead',
      'Clear your browser cookies for localhost and try again',
    ] },
  missing_code: {
    title: 'GitHub Login Incomplete',
    message: 'GitHub did not return an authorization code. The OAuth flow may have been interrupted.',
    steps: [
      'Try logging in again — click "Continue with GitHub" below',
      'Check that your GitHub OAuth app is not suspended or deleted',
      'Verify the "Homepage URL" in your GitHub OAuth app settings',
    ] },
  access_denied: {
    title: 'Access Denied',
    message: 'You denied the GitHub authorization request, or the OAuth app does not have permission to access your account.',
    steps: [
      'Click "Continue with GitHub" below and approve the authorization prompt',
      'If you did not deny access, check that the GitHub OAuth app is not restricted by your organization\'s policies',
      'Contact your GitHub organization admin if SSO enforcement is blocking access',
    ] },
  github_error: {
    title: 'GitHub Authorization Error',
    message: 'GitHub returned an error during the authorization process.',
    steps: [
      'Try logging in again — this may be a temporary issue',
      'Verify your GitHub OAuth app is not suspended or deleted',
      'Check https://www.githubstatus.com for service status',
    ] },
  manifest_missing_code: {
    title: 'GitHub App Setup Incomplete',
    message: 'GitHub did not return a setup code. The app creation may have been cancelled.',
    steps: [
      'Click "Set up GitHub Sign-In" to try again',
      'Make sure to click "Create GitHub App" on the GitHub confirmation page',
    ] },
  manifest_conversion_failed: {
    title: 'GitHub App Setup Failed',
    message: 'The console was unable to complete the GitHub App setup. The temporary code may have expired.',
    steps: [
      'Click "Set up GitHub Sign-In" to try again',
      'Check your internet connection',
      'If the problem persists, use the manual setup option instead',
    ] },
  manifest_already_configured: {
    title: 'GitHub Sign-In Already Configured',
    message: 'OAuth credentials are already set up. You can sign in directly.',
    steps: [
      'Click "Continue with GitHub" to sign in',
      'If you need to reconfigure, remove existing credentials first',
    ] },
  user_fetch_failed: {
    title: 'Could Not Retrieve GitHub Profile',
    message: 'Login succeeded but the console was unable to fetch your GitHub profile.',
    steps: [
      'Try logging in again — this may be a temporary GitHub API issue',
      'Check that your GitHub OAuth app has the "user:email" scope',
      'Verify your internet connection to api.github.com',
    ] },
  db_error: {
    title: 'Database Error',
    message: 'The console backend encountered a database error while processing your login.',
    steps: [
      'Restart the console and try again',
      'Check the backend logs for more details',
    ] },
  create_user_failed: {
    title: 'Account Creation Failed',
    message: 'The console was unable to create your user account in its local database.',
    steps: [
      'Restart the console and try again',
      'Check the backend logs for database errors',
      'If the problem persists, try deleting the local database file and restarting',
    ] },
  jwt_failed: {
    title: 'Session Token Generation Failed',
    message: 'The console backend was unable to generate a session token after successful GitHub login.',
    steps: [
      'Restart the console and try again',
      'Ensure JWT_SECRET is set in your .env file (any random string)',
      'Check the backend logs for more details',
    ] } }

const UNKNOWN_ERROR_FALLBACK: OAuthErrorEntry = {
  title: 'Authentication Error',
  message: 'An unexpected error occurred during login.',
  steps: [
    'Try logging in again — click "Continue with GitHub" below',
    'Restart the console and try again',
    'Check the backend logs for more details',
  ] }

export interface UseLocalLoginResult {
  sessionExpired: boolean
  manifestSuccess: boolean
  oauthError: string | null
  errorDetail: string | null
  errorInfo: OAuthErrorEntry | null
  branding: BrandingConfig
  isHostedDemoLogin: boolean
  showOAuthSetup: boolean
  inClusterNoOAuth: boolean
  oauthSetupExpanded: boolean
  toggleOauthSetupExpanded: () => void
  copiedStep: number | null
  handleCopyStep: (text: string | undefined, stepKey: number) => Promise<void>
}

export function useLocalLogin(
  login: (opts?: LoginOptions) => void,
  isLoading: boolean,
  isAuthenticated: boolean,
): UseLocalLoginResult {
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('reason') === 'session_expired'
  const manifestSuccess = searchParams.get('manifest') === 'success'
  const oauthError = useMemo(() => searchParams.get('error'), [searchParams])
  const errorDetail = searchParams.get('error_detail')
  const errorInfo = (() => {
    if (!oauthError) return null
    const known = OAUTH_ERROR_INFO[oauthError]
    if (known) return known
    return { ...UNKNOWN_ERROR_FALLBACK, message: `An unexpected error occurred during login (code: ${oauthError}).` }
  })()
  const branding = useBranding()
  const isHostedDemoLogin = typeof window !== 'undefined'
    && !!branding.hostedDomain
    && window.location.hostname === branding.hostedDomain

  const [showOAuthSetup, setShowOAuthSetup] = useState(false)
  const [inClusterNoOAuth, setInClusterNoOAuth] = useState(false)
  const [oauthSetupExpanded, setOauthSetupExpanded] = useState(false)
  const [copiedStep, setCopiedStep] = useState<number | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => clearTimeout(copiedTimerRef.current)
  }, [])

  const handleCopyStep = async (text: string | undefined, stepKey: number): Promise<void> => {
    if (!text) return
    const ok = await copyToClipboard(text)
    if (!ok) return
    setCopiedStep(stepKey)
    clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopiedStep(null), UI_FEEDBACK_TIMEOUT_MS)
  }

  useEffect(() => {
    if (isLoading || isAuthenticated || oauthError || manifestSuccess) return

    const isNetlifyPreview = window.location.hostname.includes('deploy-preview-') ||
      window.location.hostname.includes('netlify.app')
    const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'
    const hostedDomain = branding.hostedDomain
    const isHostedDemo = !!hostedDomain && window.location.hostname === hostedDomain

    if (isNetlifyPreview || isDemoMode || isHostedDemo) {
      emitLogin('auto-netlify'); login()
      return
    }

    checkOAuthConfiguredWithRetry().then(({ backendUp, oauthConfigured, inCluster }) => {
      if (backendUp && !oauthConfigured) {
        setShowOAuthSetup(true)
        setInClusterNoOAuth(!!inCluster)
      }
    }).catch(() => { })
  }, [isLoading, isAuthenticated, login, oauthError, manifestSuccess, branding.hostedDomain])

  const toggleOauthSetupExpanded = () => setOauthSetupExpanded(prev => !prev)

  return {
    sessionExpired,
    manifestSuccess,
    oauthError,
    errorDetail,
    errorInfo,
    branding,
    isHostedDemoLogin,
    showOAuthSetup,
    inClusterNoOAuth,
    oauthSetupExpanded,
    toggleOauthSetupExpanded,
    copiedStep,
    handleCopyStep,
  }
}
