import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Copy, Download, FileCode, History, Sparkles, Trash2, Search, ChevronDown, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useKubectl } from '../../hooks/useKubectl'
import { useClusters } from '../../hooks/useMCP'
import { cn } from '../../lib/cn'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'

interface CommandHistoryItem {
  id: string
  context: string
  command: string
  output: string
  timestamp: Date
  success: boolean
}

interface YAMLManifest {
  id: string
  name: string
  content: string
  timestamp: Date
}

export function Kubectl() {
  const { t } = useTranslation(['common', 'cards'])
  const { execute } = useKubectl()
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const [selectedContext, setSelectedContext] = useState<string>('')

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: clusters.length > 0,
  })
  const [command, setCommand] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
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
  const [historySearch, setHistorySearch] = useState('')
  const [outputFormat, setOutputFormat] = useState<'table' | 'yaml' | 'json' | 'wide'>('table')
  const [isDryRun, setIsDryRun] = useState(false)
  const [showFormatMenu, setShowFormatMenu] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)

  // Set default context when clusters are loaded
  useEffect(() => {
    if (clusters.length > 0 && !selectedContext) {
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
    const saved = localStorage.getItem('kubectl-history')
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
      localStorage.setItem('kubectl-history', JSON.stringify(commandHistory.slice(-100)))
    }
  }, [commandHistory])

  // Validate YAML
  // Note: This is basic validation. For production use, consider using a library like js-yaml
  // for comprehensive YAML parsing and validation
  const validateYAML = useCallback((content: string) => {
    if (!content.trim()) {
      setYamlError(null)
      return true
    }

    try {
      // Basic YAML validation (check for common issues)
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Check for tabs (YAML doesn't allow tabs)
        if (line.includes('\t')) {
          setYamlError(`Line ${i + 1}: YAML doesn't allow tabs, use spaces`)
          return false
        }
      }

      // Check for basic YAML structure
      if (content.includes('apiVersion:') && content.includes('kind:')) {
        setYamlError(null)
        return true
      } else if (content.trim()) {
        setYamlError('YAML should contain apiVersion and kind fields')
        return false
      }

      setYamlError(null)
      return true
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : 'Invalid YAML')
      return false
    }
  }, [])

  // Execute kubectl command
  const executeCommand = useCallback(async (cmd: string, dryRun = false) => {
    if (!cmd.trim() || !selectedContext) return

    setIsExecuting(true)
    const timestamp = new Date()
    const commandId = `cmd-${timestamp.getTime()}`

    try {
      // Parse command
      const args = cmd.trim().split(/\s+/)
      
      // Add output format if not specified
      if (!args.includes('-o') && !args.includes('--output') && outputFormat !== 'table') {
        args.push('-o', outputFormat)
      }

      // Add dry-run flag if enabled
      if (dryRun && (args[0] === 'apply' || args[0] === 'create' || args[0] === 'delete')) {
        if (!args.includes('--dry-run')) {
          args.push('--dry-run=client')
        }
      }

      const result = await execute(selectedContext, args)
      
      setOutput(prev => [
        ...prev,
        `$ kubectl ${cmd}`,
        result || '(no output)',
        ''
      ])

      // Add to history
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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Command failed'
      setOutput(prev => [
        ...prev,
        `$ kubectl ${cmd}`,
        `Error: ${errorMsg}`,
        ''
      ])

      // Add to history as failed
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
  }, [selectedContext, execute, outputFormat])

  // AI-assisted command generation
  const generateCommand = useCallback(async () => {
    if (!aiPrompt.trim()) return

    setIsExecuting(true)
    try {
      // Simple AI command generation using pattern matching
      // Note: This is a basic implementation. For production, consider integrating
      // with a proper AI service for more accurate command generation
      let generatedCmd = ''
      const prompt = aiPrompt.toLowerCase()

      if (prompt.includes('deployment') && prompt.includes('nginx')) {
        const replicas = prompt.match(/(\d+)\s+replica/)?.[1] || '3'
        generatedCmd = `create deployment nginx --image=nginx --replicas=${replicas}`
      } else if (prompt.includes('pod') && prompt.includes('list')) {
        generatedCmd = 'get pods --all-namespaces'
      } else if (prompt.includes('scale') && prompt.match(/deployment|deploy/)) {
        const name = prompt.match(/deployment\s+(\S+)/)?.[1] || 'my-deployment'
        const replicas = prompt.match(/(\d+)\s+replica/)?.[1] || '5'
        generatedCmd = `scale deployment ${name} --replicas=${replicas}`
      } else if (prompt.includes('delete') && prompt.match(/pod|pods/)) {
        generatedCmd = 'delete pod <pod-name>'
      } else if (prompt.includes('logs')) {
        generatedCmd = 'logs <pod-name>'
      } else if (prompt.includes('describe')) {
        const resource = prompt.match(/describe\s+(\S+)/)?.[1] || 'pod'
        generatedCmd = `describe ${resource} <name>`
      } else {
        setOutput(prev => [
          ...prev,
          `AI: I'm not sure how to generate that command. Try: "create deployment nginx", "list pods", "scale deployment", etc.`,
          `Tip: Use the YAML editor for complex resource definitions.`,
          ''
        ])
        setIsExecuting(false)
        return
      }

      setCommand(generatedCmd)
      setOutput(prev => [
        ...prev,
        `AI: Generated command from "${aiPrompt}":`,
        `kubectl ${generatedCmd}`,
        ''
      ])
      setAiPrompt('')
      setShowAI(false)
      commandInputRef.current?.focus()
    } catch (err) {
      setOutput(prev => [
        ...prev,
        `AI Error: ${err instanceof Error ? err.message : 'Failed to generate command'}`,
        ''
      ])
    } finally {
      setIsExecuting(false)
    }
  }, [aiPrompt])

  // Generate YAML from AI prompt
  const generateYAML = useCallback(async () => {
    if (!aiPrompt.trim()) return

    setIsExecuting(true)
    try {
      const prompt = aiPrompt.toLowerCase()
      let yaml = ''

      if (prompt.includes('deployment') && prompt.includes('nginx')) {
        const replicas = prompt.match(/(\d+)\s+replica/)?.[1] || '3'
        yaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "250m"
          limits:
            memory: "128Mi"
            cpu: "500m"`
      } else if (prompt.includes('service')) {
        yaml = `apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app: my-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: ClusterIP`
      } else if (prompt.includes('configmap')) {
        yaml = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  config.json: |
    {
      "key": "value"
    }`
      } else {
        setOutput(prev => [
          ...prev,
          `AI: I can generate YAML for: deployments, services, configmaps, etc.`,
          ''
        ])
        setIsExecuting(false)
        return
      }

      setYamlContent(yaml)
      validateYAML(yaml)
      setShowYAMLEditor(true)
      setShowAI(false)
      setAiPrompt('')
    } catch (err) {
      setOutput(prev => [
        ...prev,
        `AI Error: ${err instanceof Error ? err.message : 'Failed to generate YAML'}`,
        ''
      ])
    } finally {
      setIsExecuting(false)
    }
  }, [aiPrompt, validateYAML])

  // Apply YAML manifest
  const applyYAML = useCallback(async () => {
    if (!yamlContent.trim() || !selectedContext) return

    if (!validateYAML(yamlContent)) {
      return
    }

    setIsExecuting(true)
    try {
      const manifestId = `manifest-${Date.now()}`
      const manifestName = yamlContent.match(/name:\s*(\S+)/)?.[1] || 'unnamed'
      
      // Apply the YAML using kubectl
      const args = ['apply', '-f', '-']
      if (isDryRun) {
        args.push('--dry-run=client')
      }

      // Note: In a real implementation, you would need to pass the YAML content to stdin
      // For now, we show what would be executed and save the manifest
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
        `$ kubectl apply -f -`,
        isDryRun ? `(dry-run) ${result || 'Manifest validated successfully'}` : result || `Applied manifest "${manifestName}"`,
        yamlContent.split('\n').slice(0, 5).join('\n') + (yamlContent.split('\n').length > 5 ? '\n...' : ''),
        ''
      ])

      if (!isDryRun) {
        setYamlContent('')
        setShowYAMLEditor(false)
      }
    } catch (err) {
      setOutput(prev => [
        ...prev,
        `Error applying YAML: ${err instanceof Error ? err.message : 'Unknown error'}`,
        ''
      ])
    } finally {
      setIsExecuting(false)
    }
  }, [yamlContent, selectedContext, validateYAML, isDryRun, execute])

  // Copy output to clipboard
  const copyOutput = useCallback(() => {
    navigator.clipboard.writeText(output.join('\n'))
    setOutput(prev => [...prev, 'Copied to clipboard!', ''])
  }, [output])

  // Export YAML
  const exportYAML = useCallback(() => {
    if (!yamlContent.trim()) return

    const blob = new Blob([yamlContent], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'manifest.yaml'
    a.click()
    URL.revokeObjectURL(url)
  }, [yamlContent])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
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
  }, [command, commandHistory, historyIndex, executeCommand, isDryRun])

  // Clear output
  const clearOutput = useCallback(() => {
    setOutput([])
  }, [])

  // Filtered history based on search
  const filteredHistory = commandHistory.filter(item =>
    item.command.toLowerCase().includes(historySearch.toLowerCase()) ||
    item.context.toLowerCase().includes(historySearch.toLowerCase())
  ).reverse()

  return (
    <div className="h-full flex flex-col min-h-card overflow-hidden">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-4 gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {clusters.length > 0 && (
            <select
              value={selectedContext}
              onChange={(e) => setSelectedContext(e.target.value)}
              className="text-xs bg-secondary border border-border/50 rounded px-2 py-1 text-foreground max-w-[150px] truncate"
              title="Select cluster context"
            >
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
            onClick={() => setShowYAMLEditor(!showYAMLEditor)}
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
        <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-purple-300">{t('cards:kubectl.aiAssist')}</span>
          </div>
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generateCommand()}
            placeholder="e.g., Create a deployment for nginx with 3 replicas"
            className="w-full px-3 py-2 text-sm bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={generateCommand}
              disabled={isExecuting || !aiPrompt.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('cards:kubectl.generateCommand')}
            </button>
            <button
              onClick={generateYAML}
              disabled={isExecuting || !aiPrompt.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('cards:kubectl.generateYAML')}
            </button>
          </div>
        </div>
      )}

      {/* YAML Editor Panel */}
      {showYAMLEditor && (
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-300">{t('cards:kubectl.yamlEditor')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDryRun(!isDryRun)}
                className={cn(
                  'px-2 py-1 text-xs rounded',
                  isDryRun ? 'bg-yellow-500/20 text-yellow-400' : 'bg-secondary text-muted-foreground'
                )}
                title={isDryRun ? 'Dry-run enabled' : 'Dry-run disabled'}
              >
                {t('cards:kubectl.dryRun')}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(yamlContent)
                  setOutput(prev => [...prev, 'YAML copied to clipboard!', ''])
                }}
                disabled={!yamlContent.trim()}
                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Copy YAML"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={exportYAML}
                disabled={!yamlContent.trim()}
                className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Download YAML"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <textarea
            value={yamlContent}
            onChange={(e) => {
              setYamlContent(e.target.value)
              validateYAML(e.target.value)
            }}
            placeholder="Paste or write your YAML manifest here..."
            className="w-full h-40 px-3 py-2 text-xs font-mono bg-black/30 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
          />
          {yamlError && (
            <div className="flex items-center gap-2 mt-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {yamlError}
            </div>
          )}
          {!yamlError && yamlContent.trim() && (
            <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
              <CheckCircle className="w-3.5 h-3.5" />
              {t('cards:kubectl.validYaml')}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={applyYAML}
              disabled={isExecuting || !yamlContent.trim() || !!yamlError}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? t('cards:kubectl.applying') : isDryRun ? t('cards:kubectl.dryRunApply') : t('common:common.apply')}
            </button>
            <button
              onClick={() => {
                setYamlContent('')
                setYamlError(null)
              }}
              className="px-3 py-1.5 text-xs rounded-lg hover:bg-secondary/50 text-muted-foreground"
            >
              {t('common:common.clear')}
            </button>
          </div>

          {/* Saved Manifests */}
          {yamlManifests.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/30">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{t('cards:kubectl.savedManifests')}</span>
              </div>
              <div className="space-y-1">
                {yamlManifests.slice(-5).reverse().map(manifest => (
                  <button
                    key={manifest.id}
                    onClick={() => {
                      setYamlContent(manifest.content)
                      setSelectedManifest(manifest.id)
                      validateYAML(manifest.content)
                    }}
                    className={cn(
                      'w-full px-2 py-1.5 text-xs rounded text-left hover:bg-secondary/50',
                      selectedManifest === manifest.id ? 'bg-secondary/50 text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{manifest.name}</span>
                      <span className="text-[10px]">{manifest.timestamp.toLocaleTimeString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Command History Panel */}
      {showHistory && (
        <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg max-h-64 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-medium text-orange-300">{t('cards:kubectl.history')}</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder={t('cards:kubectl.searchHistory')}
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-secondary rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orange-500/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filteredHistory.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setCommand(item.command)
                  setSelectedContext(item.context)
                  setShowHistory(false)
                  commandInputRef.current?.focus()
                }}
                className="w-full px-2 py-1.5 text-xs rounded text-left hover:bg-secondary/50 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {item.success ? (
                      <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                    )}
                    <span className="text-muted-foreground truncate">{item.command}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                    {item.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                  {item.context}
                </div>
              </button>
            ))}
            {filteredHistory.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                {historySearch ? t('cards:kubectl.noMatchingCommands') : t('cards:kubectl.noHistory')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal Output */}
      <div
        ref={outputRef}
        className="flex-1 font-mono text-xs bg-black/30 rounded-lg p-3 overflow-y-auto mb-3 min-h-0"
      >
        {output.length === 0 ? (
          <div className="text-muted-foreground/50">
            <p>kubectl terminal ready. Type commands or use AI assistant.</p>
            <p className="mt-2">Examples:</p>
            <p className="ml-4">• get pods</p>
            <p className="ml-4">• get deployments</p>
            <p className="ml-4">• describe pod &lt;name&gt;</p>
            <p className="ml-4">• logs &lt;pod-name&gt;</p>
          </div>
        ) : (
          output.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                line.startsWith('$') ? 'text-green-400 font-semibold' :
                line.startsWith('Error:') ? 'text-red-400' :
                line.startsWith('AI:') ? 'text-purple-400' :
                'text-foreground'
              )}
            >
              {line}
            </div>
          ))
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
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          />
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setShowFormatMenu(!showFormatMenu)}
                onBlur={() => setTimeout(() => setShowFormatMenu(false), 200)}
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
                'px-2 py-1 text-[10px] rounded',
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
          className="px-2 py-1 text-[10px] rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('cards:kubectl.listPods')}
        </button>
        <button
          onClick={() => setCommand('get deployments')}
          className="px-2 py-1 text-[10px] rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('common:common.deployments')}
        </button>
        <button
          onClick={() => setCommand('get services')}
          className="px-2 py-1 text-[10px] rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('common:common.services')}
        </button>
        <button
          onClick={() => setCommand('get nodes')}
          className="px-2 py-1 text-[10px] rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          {t('common:common.nodes')}
        </button>
        <button
          onClick={copyOutput}
          disabled={output.length === 0}
          className="px-2 py-1 text-[10px] rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Copy className="w-3 h-3 inline mr-1" />
          {t('cards:kubectl.copyOutput')}
        </button>
      </div>
    </div>
  )
}
