import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE,
  STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED,
  FETCH_EXTERNAL_TIMEOUT_MS,
} from '../../../lib/constants'
import { getStoredAuthToken } from '../../../lib/authToken'
import { emitGitHubTokenConfigured, emitGitHubTokenRemoved, emitConversionStep } from '../../../lib/analytics'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../../lib/constants/network'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../../lib/utils/localStorage'
import { useToast } from '../../ui/Toast'

const TOKEN_SOURCE_SETTINGS = 'settings'
const TOKEN_SOURCE_ENV = 'env'

interface GitHubTokenErrorBody {
  error?: string
  message?: string
}

export interface RateLimit {
  limit: number
  remaining: number
  reset: Date
}

function normalizeErrorDetail(detail: string | null | undefined): string | null {
  if (!detail) return null
  const trimmed = detail.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as GitHubTokenErrorBody
    return normalizeErrorDetail(body.error ?? body.message)
  } catch {
    return null
  }
}

/** Build JWT auth headers for backend proxy requests */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getStoredAuthToken()
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export function buildGitHubTokenValidationError(status: number, detail?: string | null): string {
  const normalizedDetail = normalizeErrorDetail(detail)
  if (status === 401) {
    return normalizedDetail ?? 'Invalid token - authentication failed. Confirm the token is active and copied correctly.'
  }
  if (status === 403) {
    const lowerDetail = (normalizedDetail ?? '').toLowerCase()
    if (lowerDetail.includes('rate limit') || lowerDetail.includes('abuse')) {
      return normalizedDetail ?? 'GitHub rate limit exceeded. Try again later.'
    }
    const baseMessage = normalizedDetail ?? 'GitHub rejected the token with 403 Forbidden.'
    return `${baseMessage} Troubleshooting: Classic PATs need the 'repo' scope. Fine-grained PATs must include repository access plus 'Issues' and 'Contents' read/write permissions.`
  }
  return normalizedDetail ?? `GitHub API error: ${status}`
}

export function buildGitHubTokenSaveError(status: number, detail?: string | null): string {
  const normalizedDetail = normalizeErrorDetail(detail)
  if (status === 403 && normalizedDetail === 'Console admin access required') {
    return 'Console admin access required. Ask a console admin to grant your account the admin role before saving shared GitHub settings.'
  }
  return normalizedDetail ?? `Failed to save token: ${status}`
}

export interface UseGitHubTokenResult {
  tokenInput: string
  setTokenInput: (value: string) => void
  hasToken: boolean
  tokenSource: string | null
  tokenSaved: boolean
  tokenTesting: boolean
  tokenError: string | null
  rateLimit: RateLimit | null
  isInitializing: boolean
  isEnvToken: boolean
  handleSaveToken: () => Promise<void>
  handleClearToken: () => Promise<void>
}

export function useGitHubToken(forceVersionCheck: () => void): UseGitHubTokenResult {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const [tokenInput, setTokenInput] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [tokenSource, setTokenSource] = useState<string | null>(null)
  const [tokenSaved, setTokenSaved] = useState(false)
  const [tokenTesting, setTokenTesting] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [rateLimit, setRateLimit] = useState<RateLimit | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const validateViaProxy = async () => {
    setTokenTesting(true)
    setTokenError(null)
    try {
      const response = await fetch('/api/github/rate_limit', {
        headers: {
          ...(await authHeaders()),
          Accept: 'application/vnd.github.v3+json',
        },
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS),
      })

      if (!response.ok) {
        const detail = await readErrorDetail(response)
        throw new Error(buildGitHubTokenValidationError(response.status, detail))
      }

      const data = await response.json()
      setRateLimit({
        limit: data.rate.limit,
        remaining: data.rate.remaining,
        reset: new Date(data.rate.reset * 1000),
      })
      return true
    } catch (err: unknown) {
      setTokenError(err instanceof Error ? err.message : 'Failed to validate token')
      setRateLimit(null)
      return false
    } finally {
      setTokenTesting(false)
    }
  }

  // Load GitHub token status on mount
  useEffect(() => {
    const controller = new AbortController()

    const loadToken = async () => {
      if (safeGetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED) === 'true') {
        setIsInitializing(false)
        return
      }

      try {
        const response = await fetch('/api/github/token/status', {
          headers: await authHeaders(),
          signal: controller.signal,
        })
        if (response.ok) {
          const data = (await response.json()) as { hasToken: boolean; source: string }
          if (data.hasToken) {
            const source = data.source || TOKEN_SOURCE_SETTINGS
            safeSetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE, source)
            window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
            setHasToken(true)
            setTokenSource(source)
            await validateViaProxy()
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          // Backend unavailable — no token available
        }
      }

      if (!controller.signal.aborted) {
        setIsInitializing(false)
      }
    }
    loadToken()

    return () => controller.abort()
  }, [])

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return

    setTokenTesting(true)
    setTokenError(null)

    try {
      const saveResponse = await fetch('/api/github/token', {
        method: 'POST',
        headers: {
          ...(await authHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: tokenInput.trim() }),
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS),
      })

      if (!saveResponse.ok) {
        const detail = await readErrorDetail(saveResponse)
        throw new Error(buildGitHubTokenSaveError(saveResponse.status, detail))
      }

      const isValid = await validateViaProxy()

      if (isValid) {
        if (!safeSetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE, TOKEN_SOURCE_SETTINGS)) {
          console.warn('Token saved to backend but localStorage write failed — settings may not persist')
        }
        safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED)
        window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
        setHasToken(true)
        setTokenSource(TOKEN_SOURCE_SETTINGS)
        setTokenInput('')
        setTokenSaved(true)
        setTimeout(() => setTokenSaved(false), UI_FEEDBACK_TIMEOUT_MS)
        showToast(t('settings.github.saveSuccessToast'), 'success')

        emitGitHubTokenConfigured()
        emitConversionStep(6, 'github_token')

        forceVersionCheck()
      }
    } catch (err: unknown) {
      setTokenError(err instanceof Error ? err.message : 'Failed to save token')
    } finally {
      setTokenTesting(false)
    }
  }

  const handleClearToken = async () => {
    if (tokenTesting) return

    try {
      await fetch('/api/github/token', {
        method: 'DELETE',
        headers: await authHeaders(),
        signal: AbortSignal.timeout(FETCH_EXTERNAL_TIMEOUT_MS),
      })
    } catch {
      // Best-effort — clear local state regardless
    }

    safeRemoveItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_SOURCE)
    if (tokenSource === TOKEN_SOURCE_ENV) {
      safeSetItem(STORAGE_KEY_FEEDBACK_GITHUB_TOKEN_DISMISSED, 'true')
    }
    setHasToken(false)
    setTokenSource(null)
    setRateLimit(null)
    setTokenError(null)
    window.dispatchEvent(new CustomEvent('kubestellar-settings-changed'))
    emitGitHubTokenRemoved()
  }

  const isEnvToken = tokenSource === TOKEN_SOURCE_ENV

  return {
    tokenInput,
    setTokenInput,
    hasToken,
    tokenSource,
    tokenSaved,
    tokenTesting,
    tokenError,
    rateLimit,
    isInitializing,
    isEnvToken,
    handleSaveToken,
    handleClearToken,
  }
}
