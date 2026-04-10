import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import i18next from 'i18next'
import { emitError, markErrorReported } from '../lib/analytics'
import { isChunkLoadError } from '../lib/chunkErrors'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Page-level error boundary that catches render crashes within individual
 * route pages. Sits between ChunkErrorBoundary (which handles stale chunks)
 * and AppErrorBoundary (which is the last resort full-page fallback).
 *
 * When a page crashes (e.g. due to a failed lazy import, undefined variable
 * access, or null-reference during render), this boundary shows a recovery
 * UI while keeping the sidebar and navbar functional. Without this, render
 * errors propagate to AppErrorBoundary and replace the entire app with a
 * "Something went wrong" screen.
 */
export class PageErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State | null {
    // Let chunk load errors propagate to ChunkErrorBoundary for auto-reload
    if (isChunkLoadError(error)) {
      return null
    }
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Re-throw chunk load errors so ChunkErrorBoundary handles them
    if (isChunkLoadError(error)) {
      throw error
    }

    console.error('[PageErrorBoundary] Render error:', error, errorInfo)
    markErrorReported(error.message)
    emitError('page_render', error.message)
  }

  handleRecover = () => {
    this.setState({ hasError: false, error: null })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mb-4" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground mb-2">
            {i18next.t('common:pageError.title', 'This page encountered an error')}
          </h2>
          <div className="text-sm text-muted-foreground mb-2 max-w-md">
            {i18next.t(
              'common:pageError.description',
              'Something went wrong while rendering this page. You can try again, go back to the dashboard, or reload.',
            )}
          </div>
          {this.state.error && (
            // `break-words` avoids splitting words like "undefined" mid-letter
            // (see issue #5902). `break-all` was the previous class and caused
            // single-character lines when error messages contained long tokens.
            <div className="text-xs text-muted-foreground/70 font-mono mb-6 break-words whitespace-pre-wrap max-w-lg">
              {this.state.error.message}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={this.handleRecover}
              className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors"
              aria-label="Try rendering the page again"
            >
              {i18next.t('common:pageError.tryAgain', 'Try again')}
            </button>
            <button
              onClick={this.handleGoHome}
              className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              aria-label="Go back to the dashboard"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {i18next.t('common:pageError.goHome', 'Dashboard')}
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              aria-label="Reload the page"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              {i18next.t('common:pageError.reload', 'Reload')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
