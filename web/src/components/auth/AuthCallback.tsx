import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export function AuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setToken, refreshUser } = useAuth()

  useEffect(() => {
    const token = searchParams.get('token')
    const onboarded = searchParams.get('onboarded') === 'true'
    const error = searchParams.get('error')

    if (error) {
      console.error('Auth error:', error)
      navigate('/login?error=' + error)
      return
    }

    if (token) {
      setToken(token, onboarded)
      refreshUser().then(() => {
        if (onboarded) {
          navigate('/')
        } else {
          navigate('/onboarding')
        }
      })
    } else {
      navigate('/login')
    }
  }, [searchParams, setToken, refreshUser, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="spinner w-12 h-12 mx-auto mb-4" />
        <p className="text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  )
}
