import { Github } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { GlobeAnimation } from '../animations/globe'

export function Login() {
  const { login, isAuthenticated } = useAuth()

  // Redirect to dashboard if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen flex bg-[#0a0a0a] relative overflow-hidden">
      {/* Left side - Login form */}
      <div className="flex-1 flex items-center justify-center relative z-10">
        {/* Star field background (left side only) */}
        <div className="star-field absolute inset-0">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="star"
              style={{
                width: Math.random() * 3 + 1 + 'px',
                height: Math.random() * 3 + 1 + 'px',
                left: Math.random() * 100 + '%',
                top: Math.random() * 100 + '%',
                animationDelay: Math.random() * 3 + 's',
              }}
            />
          ))}
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl" />

        {/* Login card */}
        <div className="relative z-10 glass rounded-2xl p-8 max-w-md w-full mx-4 animate-fade-in-up">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <img
                src="/kubestellar-logo.svg"
                alt="KubeStellar"
                className="w-14 h-14"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">KubeStellar</h1>
                <p className="text-sm text-muted-foreground">Klaude Console</p>
              </div>
            </div>
          </div>

          {/* Welcome text */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-white mb-2">
              Welcome back
            </h2>
            <p className="text-muted-foreground">
              Sign in to manage your multi-cluster deployments
            </p>
          </div>

          {/* GitHub login button */}
          <button
            onClick={login}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 transition-all duration-200 hover:shadow-lg"
          >
            <Github className="w-5 h-5" />
            Continue with GitHub
          </button>

          {/* Footer */}
          <p className="text-center text-sm text-muted-foreground mt-8">
            By signing in, you agree to our{' '}
            <a href="#" className="text-purple-400 hover:text-purple-300">
              Terms of Service
            </a>
          </p>
        </div>
      </div>

      {/* Right side - Globe animation */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative">
        {/* Subtle gradient background for the globe side */}
        <div className="absolute inset-0 bg-gradient-to-l from-[#0a0f1c] to-transparent" />
        <GlobeAnimation
          width="100%"
          height="100%"
          showLoader={true}
          enableControls={true}
          className="absolute inset-0"
        />
      </div>

      {/* Version info - bottom right */}
      <div className="absolute bottom-4 right-4 text-xs text-gray-600 font-mono z-10">
        <span title={`Built: ${__BUILD_TIME__}`}>
          v{__APP_VERSION__} ({__COMMIT_HASH__.substring(0, 7)})
        </span>
      </div>
    </div>
  )
}
