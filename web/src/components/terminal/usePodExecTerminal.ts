import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useExecSession, type ExecSessionConfig } from '../../hooks/useExecSession'

export interface PodExecTerminalProps {
  cluster: string
  namespace: string
  pod: string
  /** Available container names */
  containers?: string[]
  /** Pre-selected container (defaults to first in list) */
  defaultContainer?: string
}

/** Debounce delay for terminal resize events */
const RESIZE_DEBOUNCE_MS = 100 // Debounce terminal resize handling to avoid thrashing on rapid container resizes

/** Default terminal font size in pixels */
const TERMINAL_FONT_SIZE = 13 // Default xterm.js font size (px)

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

export function usePodExecTerminal({ cluster, namespace, pod, containers = [], defaultContainer }: PodExecTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedContainer, setSelectedContainer] = useState(
    defaultContainer || (containers.length > 0 ? containers[0] : '')
  )
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
    onExit,
    isStale } = useExecSession()

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

  return {
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
  }
}
