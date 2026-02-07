import { useState, useEffect } from 'react'
import { Copy, Check, Download, RefreshCw } from 'lucide-react'
import { api } from '../../../lib/api'
import { useToast } from '../../ui/Toast'

interface Props {
  data: Record<string, unknown>
}

export function YAMLDrillDown({ data }: Props) {
  const { showToast } = useToast()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const resourceType = data.resourceType as string
  const resourceName = data.resourceName as string

  const [yaml, setYAML] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchYAML()
  }, [cluster, namespace, resourceType, resourceName])

  const fetchYAML = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        cluster,
        namespace,
        type: resourceType,
        name: resourceName,
      })
      const { data: response } = await api.get<{ yaml: string }>(`/api/mcp/resource-yaml?${params}`)
      setYAML(response.yaml || getDemoYAML(resourceType, resourceName, namespace))
    } catch (err) {
      // Use demo YAML if API fails
      setYAML(getDemoYAML(resourceType, resourceName, namespace))
      setError('Using example YAML - live fetch requires MCP')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(yaml)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      showToast('Failed to copy to clipboard', 'error')
    }
  }

  const downloadYAML = () => {
    const blob = new Blob([yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${resourceName}.yaml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resource Info */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            {resourceType}/{resourceName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {namespace} - {cluster.split('/').pop()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchYAML}
            className="p-2 rounded-lg bg-card/50 border border-border hover:bg-card transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={copyToClipboard}
            className="p-2 rounded-lg bg-card/50 border border-border hover:bg-card transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={downloadYAML}
            className="p-2 rounded-lg bg-card/50 border border-border hover:bg-card transition-colors"
            title="Download YAML"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-sm text-yellow-400">
          {error}
        </div>
      )}

      {/* YAML Content */}
      <div className="relative">
        <pre className="p-4 rounded-lg bg-card/50 border border-border overflow-auto max-h-[60vh] text-sm font-mono text-foreground whitespace-pre">
          {yaml}
        </pre>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button className="px-3 py-1.5 rounded bg-card/50 border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
          Apply Changes
        </button>
        <button className="px-3 py-1.5 rounded bg-card/50 border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
          Compare with Git
        </button>
        <button className="px-3 py-1.5 rounded bg-card/50 border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
          View in Editor
        </button>
      </div>
    </div>
  )
}

// Demo YAML for when API is not available
function getDemoYAML(resourceType: string, resourceName: string, namespace: string): string {
  const kind = resourceType.charAt(0).toUpperCase() + resourceType.slice(1)

  if (resourceType.toLowerCase() === 'pod') {
    return `apiVersion: v1
kind: Pod
metadata:
  name: ${resourceName}
  namespace: ${namespace}
  labels:
    app: ${resourceName.split('-')[0]}
spec:
  containers:
  - name: main
    image: nginx:latest
    ports:
    - containerPort: 80
    resources:
      limits:
        cpu: "500m"
        memory: "256Mi"
      requests:
        cpu: "100m"
        memory: "128Mi"
    livenessProbe:
      httpGet:
        path: /healthz
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /ready
        port: 80
      initialDelaySeconds: 3
      periodSeconds: 5
  restartPolicy: Always
status:
  phase: Running
  conditions:
  - type: Ready
    status: "True"
  - type: ContainersReady
    status: "True"`
  }

  if (resourceType.toLowerCase() === 'deployment') {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${resourceName}
  namespace: ${namespace}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${resourceName}
  template:
    metadata:
      labels:
        app: ${resourceName}
    spec:
      containers:
      - name: main
        image: nginx:latest
        ports:
        - containerPort: 80
        resources:
          limits:
            cpu: "500m"
            memory: "256Mi"
status:
  replicas: 3
  readyReplicas: 3
  availableReplicas: 3`
  }

  return `apiVersion: v1
kind: ${kind}
metadata:
  name: ${resourceName}
  namespace: ${namespace}
spec:
  # Resource specification
  # (Demo data - connect to cluster for live YAML)`
}
