import { Component, Fragment, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import i18next from 'i18next'
import { emitError, markErrorReported } from '../lib/analytics'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  /**
   * Increments each time the user clicks "Try again". Used as a React `key`
   * on the children subtree so the whole tree remounts with fresh state,
   * instead of re-running against the same broken props that originally
   * crashed. Without this, "Try again" appeared unresponsive because the
   * same error would immediately re-throw (issue #5902).
   */
  resetKey: number
}

/**
 * Generic error boundary that catches any unhandled React runtime errors.
 *
 * Wraps the app outside ChunkErrorBoundary. ChunkErrorBoundary handles stale
 * chunk errors specifically (auto-reload). This boundary catches everything
 * else — null references, bad API response shapes, rendering bugs — and
 * shows a recovery UI instead of a white screen.
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, resetKey: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary] Uncaught error:', error, errorInfo)
    // Mark as reported so the global window 'error' handler skips it (prevents double-counting)
    markErrorReported(error.message)
    emitError('uncaught_render', error.message)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    // Full navigation (not client-side) so any bad state in the SPA —
    // including router/query caches — is cleared before landing on "/".
    window.location.href = '/'
  }

  handleRecover = () => {
    // Bump the reset key so the children subtree remounts instead of
    // re-rendering with whatever bad props caused the original crash.
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1,
    }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center p-8 max-w-md" role="alert">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {i18next.t('common:appError.title', 'Something went wrong')}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {i18next.t('common:appError.description', 'An unexpected error occurred. Try rendering the page again, go back to the dashboard, or reload the app.')}
            </p>
            {this.state.error && (
              // `wrap-break-word` (overflow-wrap: break-word) prefers to wrap on
              // whitespace and only breaks mid-word when a single token is
              // wider than the container. `break-all` (used previously) would
              // split after any character, producing lines like
              // "…cardType is undefine" / "d" (issue #5902).
              <p className="text-xs text-muted-foreground/70 font-mono mb-6 wrap-break-word whitespace-pre-wrap">
                {this.state.error.message}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={this.handleRecover}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors"
                aria-label={i18next.t('common:appError.tryAgain', 'Try again')}
              >
                {i18next.t('common:appError.tryAgain', 'Try again')}
              </button>
              <button
                onClick={this.handleGoHome}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                aria-label={i18next.t('common:appError.goHome', 'Go to dashboard')}
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                {i18next.t('common:appError.goHome', 'Go to dashboard')}
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                aria-label={i18next.t('common:appError.reloadPage', 'Reload page')}
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                {i18next.t('common:appError.reloadPage', 'Reload page')}
              </button>
            </div>
          </div>
        </div>
      )
    }

    // The resetKey forces the subtree to remount after "Try again" so the
    // children get a fresh start instead of re-rendering with the same
    // state that originally triggered the error boundary. Using a keyed
    // Fragment keeps DOM layout identical to rendering children directly.
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>
  }
}
