import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { AI_THINKING_DELAY_MS, FOCUS_DELAY_MS } from '../../lib/constants/network'
import { authFetch } from '../../lib/api'
import { copyToClipboard } from '../../lib/clipboard'
import { downloadText } from '../../lib/download'
import {
  LogEntry,
  RemediationConsoleProps,
  REMEDIATION_FLOWS,
  BASE_TOKEN_ESTIMATE,
  TOKENS_PER_STEP_ESTIMATE,
} from './RemediationConsole.types'

type RemediationRunProps = Pick<RemediationConsoleProps, 'resourceType' | 'resourceName' | 'namespace' | 'cluster' | 'issues'>

/**
 * Encapsulates the AI remediation run lifecycle (start/pause/stop) and the
 * interactive shell state (command history, execution, MCP tool mapping) for
 * RemediationConsole. Split out of the component to keep the UI file focused
 * on rendering.
 */
export function useRemediationRun({ resourceType, resourceName, namespace, cluster, issues }: RemediationRunProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(false)

  // Shell state consolidated into a single object to prevent re-render flicker
  // when multiple fields change together (e.g. after command execution completes).
  const [shell, setShell] = useState({
    command: '',
    history: [] as string[],
    historyIndex: -1,
    isExecuting: false,
    error: null as string | null,
    lastFailedCommand: '',
  })
  // Convenience destructure for reads
  const { command: shellCommand, history: commandHistory, historyIndex,
    isExecuting, error: shellError, lastFailedCommand } = shell
  const updateShell = useCallback(
    (patch: Partial<typeof shell>) => setShell(prev => ({ ...prev, ...patch })),
    [],
  )

  const logsEndRef = useRef<HTMLDivElement>(null)
  const shellInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)
  const { addTokens } = useTokenUsage()

  // Auto-scroll to bottom when new logs appear
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Abort any running remediation on unmount
  useEffect(() => {
    return () => { abortRef.current = true }
  }, [])

  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogs(prev => [...prev, {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    }])
  }

  const startRemediation = async () => {
    abortRef.current = false

    // Batch state updates together to prevent render flicker
    setLogs([])
    setIsRunning(true)
    setIsComplete(false)
    setIsLoadingInitialData(true)

    // Initial log
    addLog({
      type: 'info',
      message: `Starting AI remediation for ${resourceType} "${resourceName}"`,
      details: `Cluster: ${cluster}, Namespace: ${namespace}`,
    })

    // Simulate brief loading for gathering initial data
    await new Promise(resolve => setTimeout(resolve, AI_THINKING_DELAY_MS))
    setIsLoadingInitialData(false)

    // Get the remediation flow based on issues
    const primaryIssue = issues[0] || 'default'
    const flow = REMEDIATION_FLOWS[primaryIssue] || REMEDIATION_FLOWS.default

    // Add issue context
    addLog({
      type: 'info',
      message: `Detected issues: ${issues.join(', ') || 'Unknown'}`,
    })

    // Run through the flow
    for (const step of flow) {
      if (abortRef.current) break

      // Wait while paused
      while (isPaused && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, FOCUS_DELAY_MS))
      }

      await new Promise(resolve => setTimeout(resolve, step.delay))
      if (abortRef.current) break

      addLog({
        type: step.type,
        message: step.message,
        details: step.details,
      })
    }

    if (!abortRef.current) {
      addLog({
        type: 'info',
        message: 'Remediation analysis complete',
      })
      addTokens(BASE_TOKEN_ESTIMATE + flow.length * TOKENS_PER_STEP_ESTIMATE)
      // Batch state updates together
      setIsRunning(false)
      setIsComplete(true)
    } else {
      setIsRunning(false)
    }
  }

  const stopRemediation = () => {
    abortRef.current = true
    setIsRunning(false)
    addLog({
      type: 'info',
      message: 'Remediation stopped by user',
    })
  }

  /**
   * Map a kubectl command to an MCP ops tool call.
   * Returns { name, arguments } if mapped, or null if the command is not supported.
   */
  const mapCommandToMcpTool = (cmd: string): { name: string; arguments: Record<string, string> } | null => {
    const trimmed = cmd.trim()

    // kubectl get pods
    if (/^kubectl\s+get\s+pods?\b/.test(trimmed)) {
      return { name: 'get_pods', arguments: { cluster, namespace } }
    }
    // kubectl describe pod <name>
    const describeMatch = trimmed.match(/^kubectl\s+describe\s+pod\s+(\S+)/)
    if (describeMatch) {
      return { name: 'describe_pod', arguments: { cluster, namespace, pod: describeMatch[1] } }
    }
    // kubectl describe deployment <name>
    if (/^kubectl\s+describe\s+(deployment|deploy)\b/.test(trimmed)) {
      return { name: 'find_deployment_issues', arguments: { cluster, namespace } }
    }
    // kubectl logs <pod>
    const logsMatch = trimmed.match(/^kubectl\s+logs?\s+(\S+)/)
    if (logsMatch) {
      return { name: 'get_pod_logs', arguments: { cluster, namespace, pod: logsMatch[1] } }
    }
    // kubectl get events
    if (/^kubectl\s+get\s+events?\b/.test(trimmed)) {
      return { name: 'get_events', arguments: { cluster, namespace } }
    }
    // kubectl get deployments
    if (/^kubectl\s+get\s+(deployments?|deploy)\b/.test(trimmed)) {
      return { name: 'get_deployments', arguments: { cluster, namespace } }
    }
    // kubectl get services
    if (/^kubectl\s+get\s+(services?|svc)\b/.test(trimmed)) {
      return { name: 'get_services', arguments: { cluster, namespace } }
    }
    // kubectl get nodes
    if (/^kubectl\s+get\s+nodes?\b/.test(trimmed)) {
      return { name: 'get_nodes', arguments: { cluster } }
    }

    return null
  }

  // Simulate command output for demo
  const simulateCommandOutput = (cmd: string): string => {
    if (cmd.includes('kubectl get pods')) {
      return `NAME                      READY   STATUS    RESTARTS   AGE
${resourceName}   1/1     Running   0          5m
app-backend-xyz           1/1     Running   2          1h
redis-master-abc          1/1     Running   0          2h`
    }
    if (cmd.includes('kubectl describe')) {
      return `Name:         ${resourceName}
Namespace:    ${namespace}
Status:       Running
IP:           10.42.0.15
Node:         worker-1/192.168.1.10
Start Time:   ${new Date().toISOString()}
Labels:       app=${resourceName.split('-')[0]}
...`
    }
    if (cmd.includes('kubectl logs')) {
      return `[${new Date().toISOString()}] Server starting on port 3000
[${new Date().toISOString()}] Connected to database
[${new Date().toISOString()}] Ready to accept connections`
    }
    return `Command executed: ${cmd}\n(Demo mode - connect backend for real output)`
  }

  // Shell command execution via MCP ops tools
  const executeCommand = async (cmd: string) => {
    if (!cmd.trim()) return

    // Add to history
    updateShell({ history: [...commandHistory, cmd], historyIndex: -1 })

    // Log the command
    addLog({
      type: 'command',
      message: `$ ${cmd}`,
    })

    updateShell({ isExecuting: true, error: null })

    const toolCall = mapCommandToMcpTool(cmd)

    if (!toolCall) {
      // Command is not a supported kubectl operation
      addLog({
        type: 'output',
        message: simulateCommandOutput(cmd),
      })
      updateShell({ error: 'This command is not supported via the MCP bridge. Use the quick commands above for supported operations.', lastFailedCommand: cmd, isExecuting: false, command: '' })
      return
    }

    try {
      const response = await authFetch('/api/mcp/tools/ops/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: toolCall.name,
          arguments: toolCall.arguments,
        }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`MCP tool call failed: ${response.status}`)
      }

      const result = await response.json()

      // MCP tools return content as an array of { type, text } or as a direct object
      const output = Array.isArray(result?.content)
        ? (result.content as Array<{ text?: string }>).map((c: { text?: string }) => c.text || '').join('\n')
        : typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2)

      addLog({
        type: 'output',
        message: output,
      })
    } catch (error: unknown) {
      // Fall back to simulated output when backend is unavailable
      const message = error instanceof Error ? error.message : 'Connection failed'
      updateShell({ error: `MCP bridge unavailable: ${message}`, lastFailedCommand: cmd })
      addLog({
        type: 'output',
        message: simulateCommandOutput(cmd),
      })
    }

    updateShell({ isExecuting: false, command: '' })
  }

  const handleShellKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isExecuting) {
      executeCommand(shellCommand)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
        updateShell({ historyIndex: newIndex, command: commandHistory[commandHistory.length - 1 - newIndex] || '' })
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        updateShell({ historyIndex: newIndex, command: commandHistory[commandHistory.length - 1 - newIndex] || '' })
      } else {
        updateShell({ historyIndex: -1, command: '' })
      }
    }
  }

  // Quick commands for the shell
  const quickCommands = [
    { label: 'Get Pods', cmd: `kubectl get pods -n ${namespace}` },
    { label: 'Describe', cmd: `kubectl describe ${resourceType} ${resourceName} -n ${namespace}` },
    { label: 'Logs', cmd: `kubectl logs ${resourceName} -n ${namespace} --tail=50` },
    { label: 'Events', cmd: `kubectl get events -n ${namespace} --sort-by='.lastTimestamp'` },
  ]

  const copyLogs = () => {
    const text = logs.map(log =>
      `[${log.timestamp.toISOString()}] [${log.type.toUpperCase()}] ${log.message}${log.details ? `\n  ${log.details}` : ''}`
    ).join('\n')
    copyToClipboard(text)
  }

  const downloadLogs = () => {
    const text = logs.map(log =>
      `[${log.timestamp.toISOString()}] [${log.type.toUpperCase()}] ${log.message}${log.details ? `\n  ${log.details}` : ''}`
    ).join('\n')
    // #6226: route through downloadText so a failure (storage quota,
    // browser blocker, etc.) is captured and surfaced in the remediation
    // log itself rather than crashing the dialog. This dialog has no
    // useToast, so an inline addLog entry is the most natural feedback.
    const result = downloadText(`remediation-${resourceName}-${Date.now()}.log`, text)
    if (!result.ok) {
      addLog({
        type: 'error',
        message: 'Failed to download remediation log',
        details: result.error?.message || 'unknown browser error',
      })
    }
  }

  return {
    logs,
    isRunning,
    isComplete,
    isPaused,
    setIsPaused,
    isLoadingInitialData,
    shellCommand,
    commandHistory,
    isExecuting,
    shellError,
    lastFailedCommand,
    updateShell,
    logsEndRef,
    shellInputRef,
    startRemediation,
    stopRemediation,
    executeCommand,
    handleShellKeyDown,
    quickCommands,
    copyLogs,
    downloadLogs,
  }
}
