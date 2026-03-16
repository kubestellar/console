import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Sparkles, X, Play, Pause, CheckCircle, Loader2, Copy, Download, Terminal, Send, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTokenUsage } from '../../hooks/useTokenUsage'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { AI_THINKING_DELAY_MS, FOCUS_DELAY_MS } from '../../lib/constants/network'
import { authFetch } from '../../lib/api'
import { useTranslation } from 'react-i18next'

interface LogEntry {
  id: string
  timestamp: Date
  type: 'thinking' | 'action' | 'result' | 'error' | 'info' | 'command' | 'output'
  message: string
  details?: string
}

interface RemediationConsoleProps {
  isOpen: boolean
  onClose: () => void
  resourceType: 'pod' | 'deployment' | 'node'
  resourceName: string
  namespace: string
  cluster: string
  issues: string[]
}

// Simulated remediation steps based on issue type
const REMEDIATION_FLOWS: Record<string, Array<{ type: LogEntry['type']; message: string; details?: string; delay: number }>> = {
  CrashLoopBackOff: [
    { type: 'thinking', message: 'Analyzing CrashLoopBackOff issue...', delay: 800 },
    { type: 'action', message: 'Fetching pod logs to identify root cause', delay: 1200 },
    { type: 'info', message: 'Found error in container logs: "Error: Cannot find module \'express\'"', delay: 1500 },
    { type: 'thinking', message: 'This appears to be a missing dependency issue. Checking if this is a code or image problem...', delay: 1000 },
    { type: 'action', message: 'Checking deployment image and pull policy', delay: 800 },
    { type: 'info', message: 'Image: myapp:latest, PullPolicy: Always', delay: 600 },
    { type: 'thinking', message: 'The issue is likely in the container image. Recommending image rebuild or rollback.', delay: 1000 },
    { type: 'result', message: 'Recommendation: Rollback to previous working image version or fix the Docker build', details: 'kubectl rollout undo deployment/myapp -n default', delay: 500 },
  ],
  ImagePullBackOff: [
    { type: 'thinking', message: 'Analyzing ImagePullBackOff issue...', delay: 800 },
    { type: 'action', message: 'Checking image reference and pull secrets', delay: 1000 },
    { type: 'info', message: 'Image: registry.example.com/app:v2.0', delay: 600 },
    { type: 'action', message: 'Verifying image pull secrets in namespace', delay: 1200 },
    { type: 'error', message: 'No valid pull secret found for registry.example.com', delay: 800 },
    { type: 'thinking', message: 'The pod needs a pull secret to access the private registry.', delay: 1000 },
    { type: 'result', message: 'Fix: Create or update image pull secret for the registry', details: 'kubectl create secret docker-registry regcred --docker-server=registry.example.com --docker-username=<user> --docker-password=<pass> -n default', delay: 500 },
  ],
  OOMKilled: [
    { type: 'thinking', message: 'Analyzing OOMKilled issue...', delay: 800 },
    { type: 'action', message: 'Checking container resource limits', delay: 1000 },
    { type: 'info', message: 'Current memory limit: 256Mi, Request: 128Mi', delay: 600 },
    { type: 'action', message: 'Analyzing memory usage patterns from metrics', delay: 1500 },
    { type: 'info', message: 'Peak memory usage before OOM: 254Mi (99% of limit)', delay: 800 },
    { type: 'thinking', message: 'The container is running out of memory. Need to increase limits or optimize the application.', delay: 1000 },
    { type: 'result', message: 'Recommendation: Increase memory limit to 512Mi', details: 'kubectl patch deployment myapp -p \'{"spec":{"template":{"spec":{"containers":[{"name":"app","resources":{"limits":{"memory":"512Mi"}}}]}}}}\'', delay: 500 },
  ],
  Pending: [
    { type: 'thinking', message: 'Analyzing why pod is stuck in Pending state...', delay: 800 },
    { type: 'action', message: 'Checking node resources and scheduling constraints', delay: 1200 },
    { type: 'info', message: 'Pod requests: CPU 2, Memory 4Gi', delay: 600 },
    { type: 'action', message: 'Checking available cluster capacity', delay: 1000 },
    { type: 'info', message: 'Available: CPU 0.5, Memory 1Gi across all nodes', delay: 800 },
    { type: 'thinking', message: 'Insufficient cluster resources to schedule the pod.', delay: 1000 },
    { type: 'result', message: 'Options: Scale up cluster, reduce pod resource requests, or remove other workloads', details: 'Consider: kubectl scale deployment less-critical-app --replicas=0', delay: 500 },
  ],
  default: [
    { type: 'thinking', message: 'Analyzing the issue...', delay: 800 },
    { type: 'action', message: 'Gathering diagnostic information', delay: 1200 },
    { type: 'action', message: 'Checking pod events and logs', delay: 1000 },
    { type: 'action', message: 'Analyzing resource configuration', delay: 1000 },
    { type: 'thinking', message: 'Determining best remediation approach...', delay: 1200 },
    { type: 'result', message: 'Analysis complete. Review the gathered information above for next steps.', delay: 500 },
  ],
}

export function RemediationConsole({
  isOpen,
  onClose,
  resourceType,
  resourceName,
  namespace,
  cluster,
  issues,
}: RemediationConsoleProps) {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [activeTab, setActiveTab] = useState<'ai' | 'shell'>('ai')
  const [shellCommand, setShellCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isExecuting, setIsExecuting] = useState(false)
  const [shellError, setShellError] = useState<string | null>(null)
  const [lastFailedCommand, setLastFailedCommand] = useState<string>('')
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(false)
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
    setIsRunning(true)
    setIsComplete(false)
    setLogs([])
    setIsLoadingInitialData(true)
    abortRef.current = false

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
      // Track token usage for AI remediation (~1000 tokens for analysis)
      addTokens(1000 + flow.length * 100)
    }

    setIsRunning(false)
    setIsComplete(true)
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

  // Shell command execution via MCP ops tools
  const executeCommand = async (cmd: string) => {
    if (!cmd.trim()) return

    // Add to history
    setCommandHistory(prev => [...prev, cmd])
    setHistoryIndex(-1)

    // Log the command
    addLog({
      type: 'command',
      message: `$ ${cmd}`,
    })

    setIsExecuting(true)
    setShellError(null)

    const toolCall = mapCommandToMcpTool(cmd)

    if (!toolCall) {
      // Command is not a supported kubectl operation
      addLog({
        type: 'output',
        message: simulateCommandOutput(cmd),
      })
      setShellError('This command is not supported via the MCP bridge. Use the quick commands above for supported operations.')
      setLastFailedCommand(cmd)
      setIsExecuting(false)
      setShellCommand('')
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
    } catch (error) {
      // Fall back to simulated output when backend is unavailable
      const message = error instanceof Error ? error.message : 'Connection failed'
      setShellError(`MCP bridge unavailable: ${message}`)
      setLastFailedCommand(cmd)
      addLog({
        type: 'output',
        message: simulateCommandOutput(cmd),
      })
    }

    setIsExecuting(false)
    setShellCommand('')
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

  const handleShellKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isExecuting) {
      executeCommand(shellCommand)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
        setHistoryIndex(newIndex)
        setShellCommand(commandHistory[commandHistory.length - 1 - newIndex] || '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setShellCommand(commandHistory[commandHistory.length - 1 - newIndex] || '')
      } else {
        setHistoryIndex(-1)
        setShellCommand('')
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
    navigator.clipboard.writeText(text)
  }

  const downloadLogs = () => {
    const text = logs.map(log =>
      `[${log.timestamp.toISOString()}] [${log.type.toUpperCase()}] ${log.message}${log.details ? `\n  ${log.details}` : ''}`
    ).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `remediation-${resourceName}-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-2xl flex items-center justify-center z-[60]">
      <div className="w-[800px] max-h-[80vh] glass rounded-xl flex flex-col overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              {activeTab === 'ai' ? (
                <Sparkles className="w-5 h-5 text-purple-400" />
              ) : (
                <Terminal className="w-5 h-5 text-green-400" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">
                {activeTab === 'ai' ? t('remediation.title') : t('remediation.shellTitle')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('remediation.resourceType', { type: resourceType, name: resourceName })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('ai')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'ai'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Sparkles className="w-4 h-4" />
            {t('remediation.aiAnalysis')}
          </button>
          <button
            onClick={() => {
              setActiveTab('shell')
              setTimeout(() => shellInputRef.current?.focus(), FOCUS_DELAY_MS)
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'shell'
                ? 'text-green-400 border-b-2 border-green-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Terminal className="w-4 h-4" />
            {t('remediation.shell')}
          </button>
        </div>

        {/* Console Output */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0d0d0d] font-mono text-sm">
          {activeTab === 'ai' ? (
            // AI Tab Content
            logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {isLoadingInitialData ? (
                  <>
                    <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin opacity-50" />
                    <p>{t('remediation.gatheringData')}</p>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>{t('remediation.clickStart')}</p>
                    <p className="text-xs mt-2">{t('remediation.claudeWillAnalyze')}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {logs.filter(l => l.type !== 'command' && l.type !== 'output').map(log => (
                  <div key={log.id} className="flex gap-3">
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-start gap-2">
                        {log.type === 'thinking' && (
                          <span className="text-purple-400">🤔</span>
                        )}
                        {log.type === 'action' && (
                          <span className="text-blue-400">⚡</span>
                        )}
                        {log.type === 'result' && (
                          <span className="text-green-400">✅</span>
                        )}
                        {log.type === 'error' && (
                          <span className="text-red-400">❌</span>
                        )}
                        {log.type === 'info' && (
                          <span className="text-muted-foreground">ℹ️</span>
                        )}
                        <span className={cn(
                          log.type === 'thinking' && 'text-purple-300',
                          log.type === 'action' && 'text-blue-300',
                          log.type === 'result' && 'text-green-300',
                          log.type === 'error' && 'text-red-300',
                          log.type === 'info' && 'text-muted-foreground',
                        )}>
                          {log.message}
                        </span>
                      </div>
                      {log.details && (
                        <pre className="mt-1 ml-6 p-2 rounded bg-black/50 text-xs text-yellow-300 overflow-x-auto">
                          {log.details}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
                {isRunning && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('common.processing')}</span>
                  </div>
                )}
                <div ref={logsEndRef} />
              </div>
            )
          ) : (
            // Shell Tab Content
            <div className="space-y-2">
              {/* Quick commands */}
              <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border/30">
                {quickCommands.map((qc, i) => (
                  <button
                    key={i}
                    onClick={() => executeCommand(qc.cmd)}
                    disabled={isExecuting}
                    className="px-3 py-1 text-xs rounded bg-card/50 border border-border text-muted-foreground hover:text-foreground hover:border-green-500/50 transition-colors disabled:opacity-50"
                  >
                    {qc.label}
                  </button>
                ))}
              </div>

              {/* Shell output */}
              {logs.filter(l => l.type === 'command' || l.type === 'output' || l.type === 'error').length === 0 ? (
                <div className="text-muted-foreground">
                  <p className="mb-2">{t('remediation.welcomeShell')}</p>
                  <p className="text-xs">{t('remediation.clusterContext')} <span className="text-green-400">{cluster}</span></p>
                  <p className="text-xs">{t('remediation.namespaceContext')} <span className="text-green-400">{namespace}</span></p>
                  <p className="text-xs mt-4">{t('remediation.typeKubectl')}</p>
                </div>
              ) : (
                logs.filter(l => l.type === 'command' || l.type === 'output' || l.type === 'error').map(log => (
                  <div key={log.id}>
                    {log.type === 'command' ? (
                      <div className="text-green-400">{log.message}</div>
                    ) : log.type === 'error' ? (
                      <pre className="text-red-400 whitespace-pre-wrap">{log.message}</pre>
                    ) : (
                      <pre className="text-muted-foreground whitespace-pre-wrap">{log.message}</pre>
                    )}
                  </div>
                ))
              )}
              {isExecuting && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('common.executing')}</span>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* Shell Input (only shown in shell tab) */}
        {activeTab === 'shell' && (
          <div className="p-3 border-t border-border bg-[#0d0d0d]">
            {shellError && (
              <div className="mb-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>{shellError}</span>
                </div>
                {lastFailedCommand && (
                  <button
                    onClick={() => {
                      setShellError(null)
                      executeCommand(lastFailedCommand)
                    }}
                    disabled={isExecuting}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isExecuting ? 'animate-spin' : ''}`} />
                    <span>{t('remediation.retryCommand')}</span>
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-green-400">$</span>
              <input
                ref={shellInputRef}
                type="text"
                value={shellCommand}
                onChange={(e) => setShellCommand(e.target.value)}
                onKeyDown={handleShellKeyDown}
                placeholder={t('remediation.enterCommand')}
                disabled={isExecuting}
                className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
              <button
                onClick={() => executeCommand(shellCommand)}
                disabled={isExecuting || !shellCommand.trim()}
                className="p-2 rounded hover:bg-card/50 text-muted-foreground hover:text-green-400 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Footer Controls */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <div className="flex items-center gap-2">
            {activeTab === 'ai' && (
              <>
                {!isRunning && !isComplete && (
                  <button
                    onClick={startRemediation}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 text-foreground transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    {t('remediation.startRemediation')}
                  </button>
                )}
                {isRunning && (
                  <>
                    <button
                      onClick={() => setIsPaused(!isPaused)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-600 text-foreground transition-colors"
                    >
                      {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      {isPaused ? t('remediation.resume') : t('remediation.pause')}
                    </button>
                    <button
                      onClick={stopRemediation}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                      {t('remediation.stop')}
                    </button>
                  </>
                )}
                {isComplete && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-5 h-5" />
                    <span>{t('remediation.analysisComplete')}</span>
                  </div>
                )}
              </>
            )}
            {activeTab === 'shell' && (
              <div className="text-xs text-muted-foreground">
                {t('remediation.commandHistory')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyLogs}
              disabled={logs.length === 0}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={t('remediation.copyLogs')}
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={downloadLogs}
              disabled={logs.length === 0}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
              title={t('remediation.downloadLogs')}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
