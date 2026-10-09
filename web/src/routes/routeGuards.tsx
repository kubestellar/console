/**
 * Route-level guard and redirect helpers used by AppRoutes.
 *
 * Extracted from AppRoutes.tsx (issue #24058) — logic unchanged.
 */
import { useEffect, useRef } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { CardHistoryEntry } from '../hooks/useCardHistory'
import { useAuth, isJWTExpired } from '../lib/auth'
import { DEMO_TOKEN_VALUE } from '../lib/constants'
import { useDashboardContext } from '../hooks/useDashboardContext'
import { ROUTES } from '../config/routes'
import { getStoredAuthTokenSync } from '../lib/authToken'
import { safeSet } from '../lib/safeLocalStorage'
import { CardHistory } from './lazyRoutes'

// Wrapper for CardHistory that provides the restore functionality
export function CardHistoryWithRestore() {
  const navigate = useNavigate()
  const { setPendingRestoreCard } = useDashboardContext()

  const handleRestoreCard = (entry: CardHistoryEntry) => {
    // Set the card to be restored in context
    setPendingRestoreCard({
      cardType: entry.cardType,
      cardTitle: entry.cardTitle,
      config: entry.config,
      dashboardId: entry.dashboardId,
    })
    // Navigate to the dashboard
    navigate(ROUTES.HOME)
  }

  return <CardHistory onRestoreCard={handleRestoreCard} />
}

/** Key for preserving the intended destination through the OAuth login flow */
const RETURN_TO_KEY = 'kubestellar-return-to'
/** Query param that triggers a synthetic render crash for E2E tests. */
const APP_ERROR_TEST_PARAM = '__e2e_app_error'
/** Stable message asserted by the AppErrorBoundary recovery test. */
const APP_ERROR_TEST_MESSAGE = 'Synthetic AppErrorBoundary crash'

export function AppErrorBoundaryProbe() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)

  if (searchParams.has(APP_ERROR_TEST_PARAM)) {
    throw new Error(APP_ERROR_TEST_MESSAGE)
  }

  return null
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    // #6058 — Optimistically render only when the token in localStorage is
    // either the demo sentinel or a JWT that's still within its exp window.
    // If the token is expired, showing protected children would leak content
    // to an unauthenticated user during the brief refreshUser() window. In
    // that case render nothing (a spinner placeholder) until auth resolves.
    const storedToken = getStoredAuthTokenSync()
    if (storedToken && (storedToken === DEMO_TOKEN_VALUE || !isJWTExpired(storedToken))) {
      return <>{children}</>
    }
    return null
  }

  if (!isAuthenticated) {
    // Save the intended destination so AuthCallback can return here after login.
    // This preserves deep-link params like ?mission= through the OAuth round-trip.
    const destination = location.pathname + location.search
    if (destination !== ROUTES.HOME && destination !== ROUTES.LOGIN) {
      safeSet(RETURN_TO_KEY, destination)
    }
    return <Navigate to={ROUTES.LOGIN} replace />
  }

  return <>{children}</>
}

export function IssueRedirect() {
  const navigate = useNavigate()
  const dispatched = useRef(false)
  useEffect(() => {
    if (!dispatched.current) {
      dispatched.current = true
      navigate(ROUTES.HOME, { replace: true })
      window.dispatchEvent(new CustomEvent('open-feedback'))
    }
  }, [navigate])
  return null
}

export function FeatureRedirect() {
  const navigate = useNavigate()
  const dispatched = useRef(false)
  useEffect(() => {
    if (!dispatched.current) {
      dispatched.current = true
      navigate(ROUTES.HOME, { replace: true })
      window.dispatchEvent(new CustomEvent('open-feedback-feature'))
    }
  }, [navigate])
  return null
}
