import { Component, type ReactNode, type ErrorInfo } from 'react'
import { RefreshCw } from 'lucide-react'
import i18next from 'i18next'
import { emitError, emitChunkReloadRecoveryFailed, markErrorReported } from '../lib/analytics'
import { isChunkLoadError, CHUNK_RELOAD_TS_KEY } from '../lib/chunkErrors'

// Reload throttle interval in milliseconds to prevent infinite reload loops
const RELOAD_THROTTLE_MS = 30_000 // 30 seconds

interface Props {
  children: ReactNode
}

interface State {
  hasChunkError: boolean
}

/**
 * Error boundary that catches chunk loading failures after deploys.
 *
 * When a new build is deployed, chunk filenames change (content hashes).
 * Browsers with cached HTML reference old chunk URLs that no longer exist,
 * causing "Failed to fetch dynamically imported module" or
 * "MIME type text/html" errors. This boundary catches those and
 * auto-reloads once to pick up fresh chunk references.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasChunkError: false }
  }

  static getDerivedStateFromError(error: Error): State | null {
    if (isChunkLoadError(error)) {
      return { hasChunkError: true }
    }
    return null
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    if (!isChunkLoadError(error)) {
      throw error
    }

    console.warn('[ChunkErrorBoundary] Stale chunk detected, will reload:', error.message)
    // Mark as reported so the global handler's tryChunkReloadRecovery skips it (prevents double-counting)
    markErrorReported(error.message)
    emitError('chunk_load', error.message)

    // Auto-reload once. Use sessionStorage to prevent infinite loops.
    const lastReload = sessionStorage.getItem(CHUNK_RELOAD_TS_KEY)
    const now = Date.now()
    if (!lastReload || now - parseInt(lastReload) > RELOAD_THROTTLE_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_TS_KEY, String(now))
      window.location.reload()
    } else {
      // Auto-reload already happened within the throttle window but chunks
      // are still stale — recovery failed, user sees manual reload UI
      sessionStorage.removeItem(CHUNK_RELOAD_TS_KEY)
      emitChunkReloadRecoveryFailed(error.message)
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasChunkError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center p-8 max-w-md">
            <RefreshCw className="w-12 h-12 text-purple-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {i18next.t('common:chunkError.appUpdated')}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {i18next.t('common:chunkError.newVersionDeployed')}
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {i18next.t('common:chunkError.reloadPage')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

