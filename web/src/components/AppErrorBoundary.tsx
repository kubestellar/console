import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import i18next from 'i18next'
import { emitError, markErrorReported } from '../lib/analytics'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
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
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
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

  handleRecover = () => {
    this.setState({ hasError: false, error: null })
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
              {i18next.t('common:appError.description', 'An unexpected error occurred. You can try recovering or reload the page.')}
            </p>
            {this.state.error && (
              <p className="text-xs text-muted-foreground/70 font-mono mb-6 break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRecover}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors"
                aria-label={i18next.t('common:appError.tryAgain', 'Try again')}
              >
                {i18next.t('common:appError.tryAgain', 'Try again')}
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

    return this.props.children
  }
}
