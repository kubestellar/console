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

const EXEC_IMAGES = [
  { label: 'busybox', value: 'busybox:latest' },
  { label: 'alpine', value: 'alpine:latest' },
  { label: 'ubuntu', value: 'ubuntu:latest' },
  { label: 'netshoot', value: 'nicolaka/netshoot:latest' },
]

const EXEC_COMMANDS = [
  { label: 'Disk', shellCmd: 'df -h' },
  { label: 'Memory', shellCmd: 'cat /proc/meminfo | head -5' },
  { label: 'CPU', shellCmd: 'cat /proc/cpuinfo | grep "model name" | head -1 && nproc' },
  { label: 'Processes', shellCmd: 'ps aux --sort=-%mem | head -15' },
  { label: 'Network', shellCmd: 'ip addr 2>/dev/null || ifconfig 2>/dev/null || echo "no network tools"' },
  { label: 'OS Info', shellCmd: 'cat /etc/os-release 2>/dev/null || uname -a' },
  { label: 'Mounts', shellCmd: 'mount | grep -v "cgroup\\|proc\\|sys\\|tmpfs" | head -20' },
  { label: 'Uptime', shellCmd: 'uptime && cat /proc/loadavg' },
]

type TabMode = 'inspect' | 'exec'

export function NodeDebug() {
  const { nodes, isLoading } = useCachedNodes()
  const { execute } = useKubectl()
  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [selectedNode, setSelectedNode] = useState<string>('')
  const [output, setOutput] = useState<string>('')
  const [isRunning, setIsRunning] = useState(false)
  const [mode, setMode] = useState<TabMode>('inspect')
  const [execImage, setExecImage] = useState(EXEC_IMAGES[0].value)
  const [customCmd, setCustomCmd] = useState('')

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

  const handleExec = useCallback(async (shellCmd: string) => {
    if (!selectedNode || !shellCmd.trim()) return
    // kubectl debug node/<name> creates a privileged pod on the node
    const args = [
      `debug`, `node/${selectedNode}`,
      `--image=${execImage}`,
      `--`, `sh`, `-c`, shellCmd,
    ]
    const cmdStr = `kubectl debug node/${selectedNode} --image=${execImage.split('/').pop()} -- sh -c "${shellCmd}"`
    setOutput(`$ ${cmdStr}\n\nCreating debug pod on ${selectedNode}...`)
    setIsRunning(true)
    try {
      const result = await execute(selectedCluster || 'default', args)
      setOutput(`$ ${cmdStr}\n\n${result || 'Command completed (no output)'}`)
    } catch (err) {
      setOutput(`$ ${cmdStr}\n\nError: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsRunning(false)
    }
  }, [selectedNode, selectedCluster, execImage, execute])

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
      {/* Cluster / Node selectors */}
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

      {/* Mode tabs */}
      <div className="flex gap-1">
        <button
          onClick={() => setMode('inspect')}
          className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
            mode === 'inspect'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Inspect
        </button>
        <button
          onClick={() => setMode('exec')}
          className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
            mode === 'exec'
              ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30'
              : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Node Exec
        </button>
      </div>

      {mode === 'inspect' ? (
        /* Inspect mode — kubectl get/describe commands */
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
      ) : (
        /* Exec mode — kubectl debug node/<name> */
        <div className="space-y-1.5">
          <div className="flex gap-2 items-center">
            <select
              value={execImage}
              onChange={e => setExecImage(e.target.value)}
              className="px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
            >
              {EXEC_IMAGES.map(img => (
                <option key={img.value} value={img.value}>{img.label}</option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground">debug image</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {EXEC_COMMANDS.map(cmd => (
              <button
                key={cmd.label}
                disabled={!selectedNode || isRunning}
                onClick={() => handleExec(cmd.shellCmd)}
                className="px-2 py-1 text-xs rounded bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cmd.label}
              </button>
            ))}
          </div>
          <form
            className="flex gap-1"
            onSubmit={e => { e.preventDefault(); handleExec(customCmd) }}
          >
            <input
              value={customCmd}
              onChange={e => setCustomCmd(e.target.value)}
              placeholder="Custom command (e.g. ls -la /var/log)"
              disabled={!selectedNode || isRunning}
              className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-orange-500/50 placeholder:text-muted-foreground/50 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={!selectedNode || isRunning || !customCmd.trim()}
              className="px-2 py-1 text-xs rounded bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Run
            </button>
          </form>
        </div>
      )}

      {/* Output terminal */}
      <div className="flex-1 min-h-[120px] max-h-[300px] overflow-auto rounded-lg bg-black/50 border border-border/30 p-2 font-mono text-xs text-green-400 whitespace-pre-wrap">
        {output || (
          <span className="text-muted-foreground">
            {selectedNode
              ? mode === 'exec'
                ? 'Run a command on the node via kubectl debug'
                : 'Click a command above to run diagnostics'
              : 'Select a node to begin debugging'}
          </span>
        )}
        {isRunning && <span className="animate-pulse ml-1">▊</span>}
      </div>
    </div>
  )
}
