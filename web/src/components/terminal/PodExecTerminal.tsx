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

import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useExecSession, type ExecSessionConfig, type SessionStatus } from '../../hooks/useExecSession'
import { Loader2, AlertCircle, RotateCcw, Power, ChevronDown, WifiOff, RefreshCw } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

// ============================================================================
// Constants
// ============================================================================

/** Debounce delay for terminal resize events */
const RESIZE_DEBOUNCE_MS = 100

/** Default terminal font size in pixels */
const TERMINAL_FONT_SIZE = 13

/** Default terminal line height */
const TERMINAL_LINE_HEIGHT = 1.2

/** Default terminal columns when dimensions cannot be detected */
const DEFAULT_TERMINAL_COLS = 80

/** Default terminal rows when dimensions cannot be detected */
const DEFAULT_TERMINAL_ROWS = 24

/** xterm.js terminal theme — GitHub Dark palette.
 *  xterm.js renders on <canvas> so it requires raw hex values;
 *  CSS variables / Tailwind classes cannot be used here.          */
const TERMINAL_THEME = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  selectionBackground: '#264f78',
  black: '#0d1117',
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#484f58',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc' } as const

// ============================================================================
// Types
// ============================================================================

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

export function PodExecTerminal({
  cluster,
  namespace,
  pod,
  containers = [],
  defaultContainer }: PodExecTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedContainer, setSelectedContainer] = useState(
    defaultContainer || (containers.length > 0 ? containers[0] : '')
  )
  const [showContainerPicker, setShowContainerPicker] = useState(false)
  const [exitCode, setExitCode] = useState<number | null>(null)

  const {
    status,
    error,
    reconnectAttempt,
    reconnectCountdown,
    connect,
    disconnect,
    sendInput,
    resize,
    onData,
    onExit } = useExecSession()

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: TERMINAL_THEME })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)

    // Initial fit after a frame to ensure container is sized
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    return () => {
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Wire xterm input -> WebSocket
  useEffect(() => {
    const term = xtermRef.current
    if (!term) return

    const disposable = term.onData((data) => {
      sendInput(data)
    })

    return () => disposable.dispose()
  }, [sendInput])

  // Wire WebSocket output -> xterm
  useEffect(() => {
    onData((data) => {
      xtermRef.current?.write(data)
    })
  }, [onData])

  // Wire exit callback
  useEffect(() => {
    onExit((code) => {
      setExitCode(code)
      xtermRef.current?.write(`\r\n\x1b[33m[Process exited with code ${code}]\x1b[0m\r\n`)
    })
  }, [onExit])

  // Handle window resize -> fit terminal -> send resize to backend
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
      }
      resizeTimerRef.current = setTimeout(() => {
        const fitAddon = fitAddonRef.current
        const term = xtermRef.current
        if (fitAddon && term) {
          fitAddon.fit()
          resize(term.cols, term.rows)
        }
      }, RESIZE_DEBOUNCE_MS)
    }

    window.addEventListener('resize', handleResize)

    // Also observe the terminal container for size changes
    const observer = new ResizeObserver(handleResize)
    if (terminalRef.current) {
      observer.observe(terminalRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current)
      }
    }
  }, [resize])

  // Connect to exec session
  const handleConnect = () => {
    setExitCode(null)
    const term = xtermRef.current
    const fitAddon = fitAddonRef.current

    // Clear terminal
    term?.reset()

    // Fit to get accurate dimensions
    if (fitAddon) {
      fitAddon.fit()
    }

    const config: ExecSessionConfig = {
      cluster,
      namespace,
      pod,
      container: selectedContainer,
      command: ['/bin/sh'],
      tty: true,
      cols: term?.cols || DEFAULT_TERMINAL_COLS,
      rows: term?.rows || DEFAULT_TERMINAL_ROWS }
    connect(config)
  }

  // Auto-connect on mount if container is known
  useEffect(() => {
    if (selectedContainer && status === 'disconnected' && exitCode === null) {
      handleConnect()
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDisconnect = () => {
    disconnect()
  }

  const handleReconnect = () => {
    handleConnect()
  }

  // Focus terminal when connected
  useEffect(() => {
    if (status === 'connected') {
      xtermRef.current?.focus()
    }
  }, [status])

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
                className="flex items-center gap-2 px-3 py-1 text-xs rounded bg-secondary border border-border text-foreground/80 hover:border-blue-400 transition-colors"
              >
                <span className="text-muted-foreground">container:</span>
                <span className="font-mono">{selectedContainer || 'none'}</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>
              {showContainerPicker && (
                <div className="absolute top-full left-0 mt-1 z-dropdown bg-card border border-border rounded shadow-lg">
                  {(containers || []).map((c) => (
                    <button
                      key={c}
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
          />
        </div>

        <div className="flex items-center gap-2">
          {(status === 'disconnected' || status === 'error') && (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-green-700 hover:bg-green-600 text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              {exitCode !== null ? 'Reconnect' : 'Connect'}
            </button>
          )}
          {status === 'reconnecting' && (
            <button
              onClick={handleReconnect}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-yellow-600 hover:bg-yellow-500 text-black dark:text-black transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reconnect Now
            </button>
          )}
          {(status === 'connected' || status === 'reconnecting') && (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-red-700 hover:bg-red-500 text-white transition-colors"
            >
              <Power className="w-3 h-3" />
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 relative bg-gray-950">
        {/* Overlay for connecting state */}
        {status === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-10">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Connecting to {pod}...</span>
            </div>
          </div>
        )}

        {/* Overlay for error state */}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-10">
            <div className="flex flex-col items-center gap-3 text-center max-w-md">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div className="text-sm text-red-500 font-medium">Connection Error</div>
              <div className="text-xs text-red-500/80">
                {error || 'Could not connect to cluster exec endpoint. Please verify the backend is running and /ws/exec is reachable.'}
              </div>
              <button
                onClick={handleReconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-secondary hover:bg-secondary/80 text-foreground/80 border border-border transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Try Again
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
          style={{ minHeight: 0 }}
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
}

function StatusIndicator({ status, reconnectAttempt, reconnectCountdown }: StatusIndicatorProps) {
  const config: Record<SessionStatus, { color: string; label: string; Icon?: typeof WifiOff }> = {
    disconnected: { color: 'bg-gray-600', label: 'Disconnected' },
    connecting: { color: 'bg-yellow-600 animate-pulse', label: 'Connecting...' },
    connected: { color: 'bg-green-500', label: 'Connected' },
    error: { color: 'bg-red-500', label: 'Error', Icon: WifiOff },
    reconnecting: { color: 'bg-yellow-600 animate-pulse', label: `Reconnecting${reconnectCountdown > 0 ? ` (${reconnectCountdown}s)` : '...'}` } }

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
