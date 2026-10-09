import { useState, useEffect, useRef, useMemo } from 'react'
import { useKubectl } from '../../hooks/useKubectl'
import { useClusters } from '../../hooks/useMCP'
import { useCardLoadingState } from './CardDataContext'
import { useTranslation } from 'react-i18next'
import { useDemoMode } from '../../hooks/useDemoMode'
import { copyToClipboard } from '../../lib/clipboard'
import { getDefaultClusterSelection } from '../../lib/clusterSelection'
import type { CommandHistoryItem, YAMLManifest, OutputFormat } from './Kubectl.types'
import { YAML_PREVIEW_LINES, validateYAML, generateCommandFromPrompt, generateYAMLFromPrompt, parseCommandArgs } from './Kubectl.utils'
import { AIAssistantPanel } from './KubectlAIPanel'
import { YAMLEditorPanel } from './KubectlYAMLEditorPanel'
import { CommandHistoryPanel } from './KubectlHistoryPanel'
import { DEMO_COMMAND_HISTORY, DEMO_YAML_MANIFESTS } from './Kubectl.demo'
import { useKubectlCommandHistory } from './useKubectlCommandHistory'
import { KubectlToolbar } from './KubectlToolbar'
import { KubectlTerminalOutput } from './KubectlTerminalOutput'
import { KubectlQuickActions } from './KubectlQuickActions'
import { KubectlExecuteButton, KubectlFormatControls } from './KubectlInputControls'

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
  const { commandHistory, setCommandHistory } = useKubectlCommandHistory()
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
  const demoCommandHistory = commandHistory.length > 0 ? commandHistory : isDemoMode ? DEMO_COMMAND_HISTORY : []
  const demoYamlManifests = yamlManifests.length > 0 ? yamlManifests : isDemoMode ? DEMO_YAML_MANIFESTS : []
  const outputRef = useRef<HTMLDivElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)

  const defaultContext = useMemo(() => getDefaultClusterSelection(clusters), [clusters])

  useEffect(() => {
    if (!selectedContext && defaultContext) {
      setSelectedContext(defaultContext)
    }
  }, [defaultContext, selectedContext])

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

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
        <KubectlToolbar
          showAI={showAI}
          showYAMLEditor={showYAMLEditor}
          showHistory={showHistory}
          onToggleAI={() => setShowAI(!showAI)}
          onToggleYAMLEditor={toggleYAMLEditor}
          onToggleHistory={() => setShowHistory(!showHistory)}
          onClearOutput={clearOutput}
        />
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
      <KubectlTerminalOutput outputRef={outputRef} output={output} />

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
          <KubectlFormatControls
            outputFormat={outputFormat}
            onFormatChange={setOutputFormat}
            isDryRun={isDryRun}
            onToggleDryRun={() => setIsDryRun(!isDryRun)}
          />
        </div>
        <KubectlExecuteButton
          isExecuting={isExecuting}
          disabled={isExecuting || !command.trim() || !selectedContext}
          onExecute={() => executeCommand(command, isDryRun)}
        />
      </div>

      {/* Quick Actions */}
      <KubectlQuickActions
        hasOutput={output.length > 0}
        onSetCommand={setCommand}
        onCopyOutput={copyOutput}
      />
    </div>
  )
}
