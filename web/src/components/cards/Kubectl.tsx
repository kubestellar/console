import { useState, useEffect, useRef, useMemo } from 'react'
import { Send, Copy, Trash2, ChevronDown, Sparkles, FileCode, History, Loader2 } from 'lucide-react'
import { STORAGE_KEY_KUBECTL_HISTORY } from '../../lib/constants'
import { TRANSITION_DELAY_MS } from '../../lib/constants/network'
import { useKubectl } from '../../hooks/useKubectl'
import { useClusters } from '../../hooks/useMCP'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { copyToClipboard } from '../../lib/clipboard'
import type { CommandHistoryItem, YAMLManifest, OutputFormat } from './Kubectl.types'
import { YAML_PREVIEW_LINES, validateYAML, generateCommandFromPrompt, generateYAMLFromPrompt, parseCommandArgs } from './Kubectl.utils'
import { AIAssistantPanel } from './KubectlAIPanel'
import { YAMLEditorPanel } from './KubectlYAMLEditorPanel'
import { CommandHistoryPanel } from './KubectlHistoryPanel'

const DEMO_YAML_CONTENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-cache-warmer
  namespace: llm-d
spec:
  replicas: 2
  selector:
    matchLabels:
      app: llm-cache-warmer
  template:
    metadata:
      labels:
        app: llm-cache-warmer
    spec:
      containers:
      - name: warmer
        image: ghcr.io/kubestellar/demo-cache-warmer:v1.4.2
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "250m"
            memory: "512Mi"
          limits:
            cpu: "1"
            memory: "1Gi"`

const DEMO_MANIFEST_TIMESTAMP = new Date('2026-05-26T09:30:00Z')

const DEMO_YAML_MANIFESTS: YAMLManifest[] = [
  {
    id: 'demo-manifest-cache-warmer',
    name: 'llm-cache-warmer',
    content: DEMO_YAML_CONTENT,
    timestamp: DEMO_MANIFEST_TIMESTAMP,
  },
]

const DEMO_COMMAND_HISTORY: CommandHistoryItem[] = [
  {
    id: 'demo-history-get-pods',
    command: 'get pods -n llm-d',
    context: 'demo-cluster',
    output: 'NAME READY STATUS RESTARTS AGE\nllm-cache-warmer-7dd68 1/1 Running 0 18m',
    success: true,
    timestamp: new Date('2026-05-26T09:22:00Z'),
  },
]

const SINGLE_VISIBLE_CLUSTER_COUNT = 1

export function Kubectl() {
  const { t } = useTranslation(['common', 'cards'])
  const { execute } = useKubectl()
  const { deduplicatedClusters: allClusters, isLoading, isRefreshing, isFailed, consecutiveFailures } = useClusters()
  // Filter to only reachable & healthy clusters
  const clusters = useMemo(() => (allClusters || []).filter(c => c.reachable !== false && c.healthy !== false), [allClusters])
  const { isDemoMode } = useDemoMode()
  const [selectedContext, setSelectedContext] = useState<string>('')

  // Report loading state to CardWrapper
  const hasData = clusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode,
    isFailed,
    consecutiveFailures })
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<string[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [commandHistory, setCommandHistory] = useState<CommandHistoryItem[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [showHistory, setShowHistory] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [showYAMLEditor, setShowYAMLEditor] = useState(false)
  const [yamlContent, setYamlContent] = useState('')
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlManifests, setYamlManifests] = useState<YAMLManifest[]>([])
  const [selectedManifest, setSelectedManifest] = useState<string | null>(null)
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('table')
  const [isDryRun, setIsDryRun] = useState(false)
  const [showFormatMenu, setShowFormatMenu] = useState(false)
  const demoCommandHistory = commandHistory.length > 0 ? commandHistory : isDemoMode ? DEMO_COMMAND_HISTORY : []
  const demoYamlManifests = yamlManifests.length > 0 ? yamlManifests : isDemoMode ? DEMO_YAML_MANIFESTS : []
  const outputRef = useRef<HTMLDivElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const formatMenuBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (formatMenuBlurTimeoutRef.current !== null) clearTimeout(formatMenuBlurTimeoutRef.current)
    }
  }, [])

  // Set a default context only when it's explicit or unambiguous.
  useEffect(() => {
    if (selectedContext) return

    const currentCtx = clusters.find(c => c.isCurrent)
    if (currentCtx) {
      setSelectedContext(currentCtx.name)
      return
    }

    // clusters[0] is intentional: only auto-selected when exactly ONE cluster exists (unambiguous choice)
    if (clusters.length === SINGLE_VISIBLE_CLUSTER_COUNT) {
      setSelectedContext(clusters[0].name)
    }
  }, [clusters, selectedContext])

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // Load command history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_KUBECTL_HISTORY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setCommandHistory(parsed.map((item: CommandHistoryItem) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        })))
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  // Save command history to localStorage
  useEffect(() => {
    if (commandHistory.length > 0) {
      localStorage.setItem(STORAGE_KEY_KUBECTL_HISTORY, JSON.stringify(commandHistory.slice(-100)))
    }
  }, [commandHistory])

  // Execute kubectl command
  const executeCommand = async (cmd: string, dryRun = false) => {
    if (!cmd.trim() || !selectedContext) return

    setIsExecuting(true)
    const timestamp = new Date()
    const commandId = `cmd-${timestamp.getTime()}`

    try {
      const args = parseCommandArgs(cmd, outputFormat, dryRun)
      const result = await execute(selectedContext, args)
      
      setOutput(prev => [
        ...prev,
        `$ kubectl ${cmd}  [context: ${selectedContext}]`,
        result || '(no output)',
        ''
      ])

      const historyItem: CommandHistoryItem = {
        id: commandId,
        context: selectedContext,
        command: cmd,
        output: result,
        timestamp,
        success: true
      }
      setCommandHistory(prev => [...prev, historyItem])

      setCommand('')
      setHistoryIndex(-1)
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Command failed'
      setOutput(prev => [
        ...prev,
        `$ kubectl ${cmd}  [context: ${selectedContext}]`,
        `Error: ${errorMsg}`,
        ''
      ])

      const historyItem: CommandHistoryItem = {
        id: commandId,
        context: selectedContext,
        command: cmd,
        output: errorMsg,
        timestamp,
        success: false
      }
      setCommandHistory(prev => [...prev, historyItem])
    } finally {
      setIsExecuting(false)
    }
  }

  // AI-assisted command generation
  const handleGenerateCommand = (prompt: string) => {
    const generatedCmd = generateCommandFromPrompt(prompt)
    if (generatedCmd) {
      setCommand(generatedCmd)
      setOutput(prev => [
        ...prev,
        `AI: Generated command from "${prompt}":`,
        `kubectl ${generatedCmd}`,
        ''
      ])
      setShowAI(false)
      commandInputRef.current?.focus()
    } else {
      setOutput(prev => [
        ...prev,
        `AI: I'm not sure how to generate that command. Try: "create deployment nginx", "list pods", "scale deployment", etc.`,
        `Tip: Use the YAML editor for complex resource definitions.`,
        ''
      ])
    }
  }

  // Generate YAML from AI prompt
  const handleGenerateYAML = (prompt: string) => {
    const yaml = generateYAMLFromPrompt(prompt)
    if (yaml) {
      setYamlContent(yaml)
      const validation = validateYAML(yaml)
      setYamlError(validation.error)
      setShowYAMLEditor(true)
      setShowAI(false)
    } else {
      setOutput(prev => [
        ...prev,
        `AI: I can generate YAML for: deployments, services, configmaps, etc.`,
        ''
      ])
    }
  }

  // Apply YAML manifest
  const applyYAML = async () => {
    if (!yamlContent.trim() || !selectedContext) return

    const validation = validateYAML(yamlContent)
    if (!validation.valid) {
      return
    }

    setIsExecuting(true)
    try {
      const manifestId = `manifest-${Date.now()}`
      const manifestName = yamlContent.match(/name:\s*(\S+)/)?.[1] || 'unnamed'
      
      const args = ['apply', '-f', '-']
      if (isDryRun) {
        args.push('--dry-run=client')
      }

      const result = await execute(selectedContext, args)
      
      const manifest: YAMLManifest = {
        id: manifestId,
        name: manifestName,
        content: yamlContent,
        timestamp: new Date()
      }

      setYamlManifests(prev => [...prev, manifest])

      setOutput(prev => [
        ...prev,
        `$ kubectl apply -f -  [context: ${selectedContext}]`,
        isDryRun ? `(dry-run) ${result || 'Manifest validated successfully'}` : result || `Applied manifest "${manifestName}"`,
        yamlContent.split('\n').slice(0, YAML_PREVIEW_LINES).join('\n') + (yamlContent.split('\n').length > YAML_PREVIEW_LINES ? '\n...' : ''),
        ''
      ])

      if (!isDryRun) {
        setYamlContent('')
        setShowYAMLEditor(false)
      }
    } catch (err: unknown) {
      setOutput(prev => [
        ...prev,
        `Error applying YAML: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ''
      ])
    } finally {
      setIsExecuting(false)
    }
  }

  // Copy output to clipboard
  const copyOutput = () => {
    copyToClipboard(output.join('\n'))
    setOutput(prev => [...prev, 'Copied to clipboard!', ''])
  }

  // Clear output
  const clearOutput = () => {
    setOutput([])
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      executeCommand(command, isDryRun)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[commandHistory.length - 1 - newIndex].command)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCommand(commandHistory[commandHistory.length - 1 - newIndex].command)
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCommand('')
      }
    }
  }

  const handleSelectCommand = (cmd: string, context: string) => {
    setCommand(cmd)
    setSelectedContext(context)
    setShowHistory(false)
    commandInputRef.current?.focus()
  }

  const handleValidateYAML = (content: string) => {
    const validation = validateYAML(content)
    setYamlError(validation.error)
  }

  const handleLoadManifest = (manifest: YAMLManifest) => {
    setYamlContent(manifest.content)
    setSelectedManifest(manifest.id)
    handleValidateYAML(manifest.content)
  }

  const toggleYAMLEditor = () => {
    const nextOpen = !showYAMLEditor
    if (nextOpen && isDemoMode && !yamlContent.trim()) {
      const demoManifest = DEMO_YAML_MANIFESTS[0]
      setYamlContent(demoManifest.content)
      setSelectedManifest(demoManifest.id)
      setYamlError(null)
    }
    setShowYAMLEditor(nextOpen)
  }

  return (
    <div className="h-full flex flex-col min-h-card overflow-hidden">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {clusters.length > 0 && (
            <select
              value={selectedContext}
              onChange={(e) => setSelectedContext(e.target.value)}
              className="text-xs bg-secondary border border-border/50 rounded px-2 py-1 text-foreground max-w-[150px] truncate"
              title={t('selectors.selectCluster')}
            >
              <option value="">{t('selectors.selectCluster')}</option>
              {clusters.map(cluster => (
                <option key={cluster.name} value={cluster.name}>
                  {cluster.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAI(!showAI)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              showAI ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
            title={t('cards:kubectl.aiAssist')}
          >
            <Sparkles className="w-4 h-4" />
          </button>
          <button
            onClick={toggleYAMLEditor}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              showYAMLEditor ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
            title={t('cards:kubectl.yamlEditor')}
          >
            <FileCode className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              showHistory ? 'bg-orange-500/20 text-orange-400' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            )}
            title={t('cards:kubectl.history')}
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={clearOutput}
            className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            title={t('cards:kubectl.clearOutput')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* AI Assistant Panel */}
      {showAI && (
        <AIAssistantPanel
          onGenerateCommand={handleGenerateCommand}
          onGenerateYAML={handleGenerateYAML}
          isExecuting={isExecuting}
        />
      )}

      {/* YAML Editor Panel */}
      {showYAMLEditor && (
        <YAMLEditorPanel
          isDemoData={isDemoMode}
          yamlContent={yamlContent}
          yamlError={yamlError}
          yamlManifests={demoYamlManifests}
          selectedManifest={selectedManifest}
          isDryRun={isDryRun}
          isExecuting={isExecuting}
          onContentChange={setYamlContent}
          onValidate={handleValidateYAML}
          onApply={applyYAML}
          onClear={() => {
            setYamlContent('')
            setYamlError(null)
          }}
          onToggleDryRun={() => setIsDryRun(!isDryRun)}
          onLoadManifest={handleLoadManifest}
          onAddOutput={(message) => setOutput(prev => [...prev, message, ''])}
        />
      )}

      {/* Command History Panel */}
      {showHistory && (
        <CommandHistoryPanel
          history={demoCommandHistory}
          onSelectCommand={handleSelectCommand}
        />
      )}

      {/* Terminal Output */}
      <div
        ref={outputRef}
        className="flex-1 font-mono text-xs bg-black/30 rounded-lg p-3 overflow-y-auto mb-3 min-h-0"
      >
        {output.length === 0 ? (
          <div className="text-muted-foreground/50 whitespace-pre">
            <p>{t('cards:kubectl.terminalReady')}</p>
            <p className="mt-2">{t('cards:kubectl.examples')}</p>
            <p className="ml-4">  {t('cards:kubectl.exampleGetPods')}</p>
            <p className="ml-4">  {t('cards:kubectl.exampleGetDeployments')}</p>
            <p className="ml-4">  {t('cards:kubectl.exampleDescribePod')}</p>
            <p className="ml-4">  {t('cards:kubectl.exampleLogs')}</p>
          </div>
        ) : (
          output.map((line, idx) => {
            const isCommand = line.startsWith('$')
            const isError = line.startsWith('Error:')
            const isAI = line.startsWith('AI:')
            const isEmpty = line === ''
            // Show a subtle separator for empty lines between command blocks
            if (isEmpty) {
              return <div key={idx} className="h-2 border-b border-border/10 mb-2" />
            }
            return (
              <pre
                key={idx}
                className={cn(
                  'whitespace-pre-wrap wrap-break-word m-0 py-0 leading-snug',
                  isCommand && 'text-green-400 font-semibold bg-green-500/5 -mx-1 px-1 rounded mt-1 py-0.5 border-l-2 border-green-500/40',
                  isError && 'text-red-400 bg-red-500/5 -mx-1 px-1 rounded',
                  isAI && 'text-purple-400',
                  !isCommand && !isError && !isAI && 'text-foreground/90'
                )}
              >{line}</pre>
            )
          })
        )}
      </div>

      {/* Command Input */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 border border-border/30 focus-within:border-green-500/50">
          <span className="text-green-400 text-sm font-semibold">$</span>
          <input
            ref={commandInputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter kubectl command (without 'kubectl' prefix)"
            disabled={isExecuting || !selectedContext}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden disabled:opacity-50"
          />
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowFormatMenu(!showFormatMenu)}
                onBlur={() => {
                  if (formatMenuBlurTimeoutRef.current !== null) clearTimeout(formatMenuBlurTimeoutRef.current)
                  formatMenuBlurTimeoutRef.current = setTimeout(() => setShowFormatMenu(false), TRANSITION_DELAY_MS)
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
                title={`Output format: ${outputFormat}`}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showFormatMenu && (
                <div className="absolute bottom-full right-0 mb-1 bg-secondary border border-border/50 rounded-lg py-1 shadow-lg z-10 min-w-[100px]">
                  {['table', 'yaml', 'json', 'wide'].map(format => (
                    <button
                      key={format}
                      onClick={() => {
                        setOutputFormat(format as typeof outputFormat)
                        setShowFormatMenu(false)
                      }}
                      className={cn(
                        'w-full px-3 py-1.5 text-xs text-left hover:bg-secondary/50',
                        outputFormat === format ? 'text-green-400' : 'text-muted-foreground'
                      )}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setIsDryRun(!isDryRun)}
              className={cn(
                'px-2 py-1 text-2xs rounded',
                isDryRun ? 'bg-yellow-500/20 text-yellow-400' : 'text-muted-foreground hover:bg-secondary'
              )}
              title="Toggle dry-run mode"
            >
              {isDryRun ? t('cards:kubectl.dry') : t('cards:kubectl.run')}
            </button>
          </div>
        </div>
        <button
          onClick={() => executeCommand(command, isDryRun)}
          disabled={isExecuting || !command.trim() || !selectedContext}
          className="px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          title="Execute command (or press Enter)"
        >
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t('cards:kubectl.running')}</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span className="text-sm">{t('cards:kubectl.run')}</span>
            </>
          )}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground">{t('cards:kubectl.quickCommands')}:</span>
        <button
          onClick={() => setCommand('get pods --all-namespaces')}
          className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('cards:kubectl.listPods')}
        </button>
        <button
          onClick={() => setCommand('get deployments')}
          className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('common:common.deployments')}
        </button>
        <button
          onClick={() => setCommand('get services')}
          className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('common:common.services')}
        </button>
        <button
          onClick={() => setCommand('get nodes')}
          className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('common:common.nodes')}
        </button>
        <button
          onClick={copyOutput}
          disabled={output.length === 0}
          className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Copy className="w-3 h-3 inline mr-1" />
          {t('cards:kubectl.copyOutput')}
        </button>
      </div>
    </div>
  )
}
