/**
 * PodExecTerminal - Interactive terminal for pod exec sessions
 *
 * Wraps xterm.js to provide an in-browser terminal connected via WebSocket
 * to the backend /api/exec endpoint for SPDY-bridged pod exec.
 *
 * Features:
 * - Connection status indicator (dot + label) in toolbar (#3027)
 * - Meaningful error messages when backend is unreachable (#3026)
 * - Automatic reconnection with exponential backoff and countdown (#3029)
 */

import { useState, type RefObject } from 'react'
import type { SessionStatus } from '../../hooks/useExecSession'
import { Loader2, AlertCircle, RotateCcw, Power, ChevronDown, WifiOff, RefreshCw, AlertTriangle } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { useTranslation } from 'react-i18next'
import { useKeyboardNav } from '../../hooks/useKeyboardNav'
import { usePodExecTerminal } from './usePodExecTerminal'

/** Terminal container style to prevent inline object creation on each render */
const TERMINAL_CONTAINER_STYLE = { minHeight: 0 } as const

export interface PodExecTerminalProps {
  cluster: string
  namespace: string
  pod: string
  /** Available container names */
  containers?: string[]
  /** Pre-selected container (defaults to first in list) */
  defaultContainer?: string
}

// ============================================================================
// Component
// ============================================================================

// Default export enables React.lazy() in consumers
export default function PodExecTerminal({
  cluster,
  namespace,
  pod,
  containers = [],
  defaultContainer }: PodExecTerminalProps) {
  const { t } = useTranslation()
  const {
    terminalRef,
    selectedContainer,
    setSelectedContainer,
    exitCode,
    status,
    error,
    reconnectAttempt,
    reconnectCountdown,
    isStale,
    handleReconnect,
    handleDisconnect,
  } = usePodExecTerminal({ cluster, namespace, pod, containers, defaultContainer })
  const [showContainerPicker, setShowContainerPicker] = useState(false)

  const containerMenuNav = useKeyboardNav({
    selector: '[role="menuitem"]:not([disabled])',
    orientation: 'vertical',
    onEscape: () => setShowContainerPicker(false),
  })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          {/* Container picker */}
          {containers.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowContainerPicker(!showContainerPicker)}
                aria-haspopup="true"
                aria-expanded={showContainerPicker}
                className="flex items-center gap-2 px-3 py-1 text-xs rounded bg-secondary border border-border text-foreground/80 hover:border-blue-400 transition-colors"
              >
                <span className="text-muted-foreground">container:</span>
                <span className="font-mono">{selectedContainer || 'none'}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
              {showContainerPicker && (
                <div
                  ref={containerMenuNav.containerRef as RefObject<HTMLDivElement>}
                  role="menu"
                  onKeyDown={containerMenuNav.handleKeyDown}
                  className="absolute top-full left-0 mt-1 z-dropdown bg-card border border-border rounded shadow-lg"
                >
                  {(containers || []).map((c) => (
                    <button
                      key={c}
                      role="menuitem"
                      onClick={() => {
                        setSelectedContainer(c)
                        setShowContainerPicker(false)
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-secondary transition-colors ${
                        c === selectedContainer ? 'text-blue-400' : 'text-foreground/80'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status indicator */}
          <StatusIndicator
            status={status}
            reconnectAttempt={reconnectAttempt}
            reconnectCountdown={reconnectCountdown}
            isStale={isStale}
          />
        </div>

        <div className="flex items-center gap-2">
          {(status === 'disconnected' || status === 'error') && (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {exitCode !== null ? t('terminal.reconnect') : t('terminal.connect')}
            </button>
          )}
          {status === 'reconnecting' && (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-black dark:text-black transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {t('terminal.reconnectNow')}
            </button>
          )}
          {(status === 'connected' || status === 'reconnecting') && (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-red-700 hover:bg-red-500 text-white transition-colors"
            >
              <Power className="w-3 h-3" />
              {t('terminal.disconnect')}
            </button>
          )}
        </div>
      </div>

      {isStale && status !== 'error' && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs bg-yellow-500/10 text-yellow-400 border-b border-yellow-500/20" role="status">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{t('terminal.connectionStale')}</span>
        </div>
      )}

      {/* Terminal area */}
      <div className="flex-1 relative bg-gray-950">
        {/* Overlay for connecting state */}
        {status === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-10">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">{t('terminal.connectingToPod', { pod })}</span>
            </div>
          </div>
        )}

        {/* Overlay for error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-10">
            <div className="flex flex-col items-center gap-3 text-center max-w-md">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div className="text-sm text-red-500 font-medium">{t('terminal.connectionError')}</div>
              <div className="text-xs text-red-500/80">
                {error || 'Could not connect to cluster exec endpoint. Please verify the backend is running and /ws/exec is reachable.'}
              </div>
              <button
                onClick={handleReconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground/80 border border-border transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                {t('terminal.tryAgain')}
              </button>
            </div>
          </div>
        )}

        {/* Overlay for reconnecting state */}
        {status === 'reconnecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/60 z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-center pointer-events-auto">
              <RefreshCw className="w-6 h-6 text-yellow-600 animate-spin" />
              <div className="text-sm text-yellow-600">
                Reconnecting{reconnectCountdown > 0 ? ` in ${reconnectCountdown}s` : '...'}
              </div>
              <div className="text-xs text-muted-foreground">
                Attempt {reconnectAttempt} of 5
              </div>
            </div>
          </div>
        )}

        {/* xterm.js container */}
        <div
          ref={terminalRef}
          className="absolute inset-0 p-2"
          style={TERMINAL_CONTAINER_STYLE}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Sub-Components
// ============================================================================

interface StatusIndicatorProps {
  status: SessionStatus
  reconnectAttempt: number
  reconnectCountdown: number
  isStale: boolean
}

function StatusIndicator({ status, reconnectAttempt, reconnectCountdown, isStale }: StatusIndicatorProps) {
  const { t } = useTranslation()
  const config: Record<SessionStatus, { color: string; label: string; Icon?: typeof WifiOff }> = {
    disconnected: { color: 'bg-gray-600', label: t('terminal.disconnected') },
    connecting: { color: 'bg-yellow-600 animate-pulse', label: t('terminal.connecting') },
    connected: {
      color: isStale ? 'bg-yellow-500 animate-pulse' : 'bg-green-500',
      label: isStale ? t('terminal.connectionStaleShort') : t('terminal.connected'),
    },
    error: { color: 'bg-red-500', label: t('terminal.error'), Icon: WifiOff },
    reconnecting: {
      color: 'bg-yellow-600 animate-pulse',
      label: reconnectCountdown > 0
        ? t('terminal.reconnectingCountdown', { count: reconnectCountdown })
        : t('terminal.reconnecting'),
    },
  }

  const { color, label, Icon } = config[status]

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {Icon ? (
        <Icon className="w-3 h-3 text-red-500" />
      ) : (
        <div className={`w-2 h-2 rounded-full ${color}`} />
      )}
      <span>{label}</span>
      {status === 'reconnecting' && reconnectAttempt > 0 && (
        <span className="text-muted-foreground/60 text-2xs">
          (attempt {reconnectAttempt}/5)
        </span>
      )}
    </div>
  )
}
