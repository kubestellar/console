import { useState, useCallback } from 'react'
import { useCachedNodes } from '../../hooks/useCachedData'
import { useKubectl } from '../../hooks/useKubectl'

const DEBUG_COMMANDS = [
  { label: 'Node Info', cmd: (node: string) => [`describe`, `node`, node] },
  { label: 'Top Pods', cmd: (node: string) => [`get`, `pods`, `--all-namespaces`, `--field-selector`, `spec.nodeName=${node}`, `-o`, `wide`] },
  { label: 'Conditions', cmd: (node: string) => [`get`, `node`, node, `-o`, `jsonpath={range .status.conditions[*]}{.type}={.status} {.message}{"\\n"}{end}`] },
  { label: 'Resources', cmd: (node: string) => [`top`, `node`, node] },
  { label: 'Events', cmd: (node: string) => [`get`, `events`, `--field-selector`, `involvedObject.name=${node},involvedObject.kind=Node`] },
  { label: 'Taints', cmd: (node: string) => [`get`, `node`, node, `-o`, `jsonpath={range .spec.taints[*]}{.key}={.value}:{.effect}{"\\n"}{end}`] },
]

export function NodeDebug() {
  const { nodes, isLoading } = useCachedNodes()
  const { execute } = useKubectl()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [selectedNode, setSelectedNode] = useState<string>('')
  const [output, setOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)

  const clusters = Array.from(new Set(nodes.map(n => n.cluster).filter(Boolean))).sort()
  const clusterNodes = nodes.filter(n => !selectedCluster || n.cluster === selectedCluster)

  const handleRun = useCallback(async (cmdFn: (node: string) => string[]) => {
    if (!selectedNode) return
    const args = cmdFn(selectedNode)
    const cmdStr = `kubectl ${args.join(' ')}`
    setOutput(`$ ${cmdStr}\n\nRunning...`)
    setIsRunning(true)
    try {
      const result = await execute(selectedCluster || 'default', args)
      setOutput(`$ ${cmdStr}\n\n${result || 'Command completed'}`)
    } catch (err) {
      setOutput(`$ ${cmdStr}\n\nError: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsRunning(false)
    }
  }, [selectedNode, selectedCluster, execute])

  if (isLoading && nodes.length === 0) {
    return (
      <div className="space-y-2 p-1">
        <div className="h-8 rounded bg-muted/50 animate-pulse" />
        <div className="h-8 rounded bg-muted/50 animate-pulse" />
        <div className="h-32 rounded bg-muted/50 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-2 p-1 flex flex-col h-full">
      <div className="flex gap-2">
        <select
          value={selectedCluster}
          onChange={e => { setSelectedCluster(e.target.value); setSelectedNode('') }}
          className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All clusters</option>
          {clusters.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={selectedNode}
          onChange={e => setSelectedNode(e.target.value)}
          className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Select node...</option>
          {clusterNodes.map(n => (
            <option key={`${n.cluster}-${n.name}`} value={n.name}>
              {n.name} {n.cluster ? `(${n.cluster})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 flex-wrap">
        {DEBUG_COMMANDS.map(cmd => (
          <button
            key={cmd.label}
            disabled={!selectedNode || isRunning}
            onClick={() => handleRun(cmd.cmd)}
            className="px-2 py-1 text-xs rounded bg-muted/50 hover:bg-muted text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {cmd.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-[120px] max-h-[300px] overflow-auto rounded-lg bg-black/50 border border-border/30 p-2 font-mono text-xs text-green-400 whitespace-pre-wrap">
        {output || (
          <span className="text-muted-foreground">
            {selectedNode ? 'Click a command above to run diagnostics' : 'Select a node to begin debugging'}
          </span>
        )}
        {isRunning && <span className="animate-pulse ml-1">▊</span>}
      </div>
    </div>
  )
}
