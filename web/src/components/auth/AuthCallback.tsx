import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setToken, refreshUser } = useAuth()
  const [status, setStatus] = useState('Signing you in...')

  useEffect(() => {
    const token = searchParams.get('token')
    const onboarded = searchParams.get('onboarded') === 'true'
    const error = searchParams.get('error')

    console.log('[AuthCallback] Starting auth flow', { hasToken: !!token, onboarded, error })

    if (error) {
      console.error('Auth error:', error)
      navigate('/login?error=' + error)
      return
    }

    if (token) {
      setToken(token, onboarded)
      setStatus('Fetching user info...')

      // Add timeout to prevent hanging forever
      const timeoutId = setTimeout(() => {
        console.warn('[AuthCallback] Auth timeout - proceeding anyway')
        if (onboarded) {
          navigate('/')
        } else {
          navigate('/onboarding')
        }
      }, 5000)

      refreshUser(token).then(() => {
        clearTimeout(timeoutId)
        console.log('[AuthCallback] User refreshed, navigating', { onboarded })
        if (onboarded) {
          navigate('/')
        } else {
          navigate('/onboarding')
        }
      }).catch((err) => {
        clearTimeout(timeoutId)
        console.error('Failed to refresh user:', err)
        // Still try to proceed if we have a token
        setStatus('Completing sign in...')
        setTimeout(() => {
          if (onboarded) {
            navigate('/')
          } else {
            navigate('/onboarding')
          }
        }, 500)
      })
    } else {
      console.warn('[AuthCallback] No token in URL')
      navigate('/login')
    }
  }, [searchParams, setToken, refreshUser, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="spinner w-12 h-12 mx-auto mb-4" />
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  )
}
