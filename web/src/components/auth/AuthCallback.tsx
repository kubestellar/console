import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { getLastRoute } from '../../hooks/useLastRoute'
import { ROUTES, getLoginWithError } from '../../config/routes'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast'

export function AuthCallback() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setToken, refreshUser } = useAuth()
  const { showToast } = useToast()
  const [status, setStatus] = useState(t('authCallback.signingIn'))
  const hasProcessed = useRef(false)

  useEffect(() => {
    // Prevent running multiple times
    if (hasProcessed.current) return
    hasProcessed.current = true

    const token = searchParams.get('token')
    const error = searchParams.get('error')

    if (error) {
      navigate(getLoginWithError(error))
      return
    }

    if (token) {
      setToken(token, true)
      setStatus(t('authCallback.fetchingUserInfo'))

      // Navigate directly to the last visited dashboard route instead of '/'
      // to avoid a flash of the default dashboard before useLastRoute redirects.
      const destination = getLastRoute() || ROUTES.HOME

      // Add timeout to prevent hanging forever
      const timeoutId = setTimeout(() => {
        navigate(destination)
      }, 5000)

      refreshUser(token).then(() => {
        clearTimeout(timeoutId)
        navigate(destination)
      }).catch((_err) => {
        clearTimeout(timeoutId)
        showToast(t('authCallback.failedToFetchUser'), 'warning')
        // Still try to proceed if we have a token
        setStatus(t('authCallback.completingSignIn'))
        setTimeout(() => {
          navigate(destination)
        }, 500)
      })
    } else {
      navigate(ROUTES.LOGIN)
    }
  }, [searchParams, setToken, refreshUser, navigate, showToast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="spinner w-12 h-12 mx-auto mb-4" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  )
}
