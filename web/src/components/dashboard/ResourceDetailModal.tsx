import { useState, useEffect } from 'react'
import {
  ExternalLink,
  Terminal,
  Trash2,
  RefreshCw,
  Copy,
  Sparkles,
  Loader2,
  Activity,
  Server,
  Box,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { cn } from '../../lib/cn'

export type ResourceType = 'pod' | 'deployment' | 'service' | 'node' | 'event' | 'cluster' | 'namespace'

export interface ResourceInfo {
  type: ResourceType
  name: string
  namespace?: string
  cluster?: string
  status?: string
  details?: Record<string, unknown>
}

interface ResourceDetailModalProps {
  isOpen: boolean
  resource: ResourceInfo | null
  onClose: () => void
  onAction?: (action: string, resource: ResourceInfo) => void
}

// Quick actions per resource type
const RESOURCE_ACTIONS: Record<ResourceType, Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; danger?: boolean }>> = {
  pod: [
    { id: 'logs', label: 'View Logs', icon: Terminal },
    { id: 'describe', label: 'Describe', icon: Activity },
    { id: 'exec', label: 'Open Shell', icon: Terminal },
    { id: 'restart', label: 'Restart', icon: RefreshCw },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ],
  deployment: [
    { id: 'describe', label: 'Describe', icon: Activity },
    { id: 'scale', label: 'Scale', icon: Server },
    { id: 'rollout', label: 'Rollout Status', icon: RefreshCw },
    { id: 'restart', label: 'Restart', icon: RefreshCw },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ],
  service: [
    { id: 'describe', label: 'Describe', icon: Activity },
    { id: 'endpoints', label: 'View Endpoints', icon: Server },
    { id: 'port-forward', label: 'Port Forward', icon: ExternalLink },
  ],
  node: [
    { id: 'describe', label: 'Describe', icon: Activity },
    { id: 'drain', label: 'Drain', icon: AlertTriangle },
    { id: 'cordon', label: 'Cordon', icon: XCircle },
    { id: 'uncordon', label: 'Uncordon', icon: CheckCircle },
  ],
  event: [
    { id: 'related', label: 'Related Resources', icon: Activity },
    { id: 'similar', label: 'Similar Events', icon: Clock },
  ],
  cluster: [
    { id: 'health', label: 'Health Check', icon: Activity },
    { id: 'nodes', label: 'View Nodes', icon: Server },
    { id: 'namespaces', label: 'View Namespaces', icon: Box },
  ],
  namespace: [
    { id: 'describe', label: 'Describe', icon: Activity },
    { id: 'resources', label: 'View Resources', icon: Box },
    { id: 'quotas', label: 'Resource Quotas', icon: Activity },
  ],
}

// Status icons and colors
const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  Running: { icon: CheckCircle, color: 'text-green-400' },
  Succeeded: { icon: CheckCircle, color: 'text-green-400' },
  Healthy: { icon: CheckCircle, color: 'text-green-400' },
  Ready: { icon: CheckCircle, color: 'text-green-400' },
  Pending: { icon: Clock, color: 'text-yellow-400' },
  Warning: { icon: AlertTriangle, color: 'text-yellow-400' },
  Failed: { icon: XCircle, color: 'text-red-400' },
  Error: { icon: XCircle, color: 'text-red-400' },
  CrashLoopBackOff: { icon: XCircle, color: 'text-red-400' },
  ImagePullBackOff: { icon: XCircle, color: 'text-red-400' },
  Unhealthy: { icon: XCircle, color: 'text-red-400' },
}

export function ResourceDetailModal({ isOpen, resource, onClose, onAction }: ResourceDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'actions' | 'ai'>('details')
  const [nlPrompt, setNlPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    if (resource) {
      setActiveTab('details')
      setNlPrompt('')
      setAiResponse(null)
    }
  }, [resource])

  // Early return if no resource - must be before other computations that use resource
  if (!resource) return null

  const actions = RESOURCE_ACTIONS[resource.type] || []
  const statusConfig = resource.status ? STATUS_CONFIG[resource.status] : null
  const StatusIcon = statusConfig?.icon || Activity

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleAction = (actionId: string) => {
    if (onAction) {
      onAction(actionId, resource)
    }
  }

  const handleNLSubmit = async () => {
    if (!nlPrompt.trim()) return
    setIsProcessing(true)
    setAiResponse(null)

    // Simulate AI processing - would call Claude API in production
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Generate contextual response based on resource type and prompt
    const prompt = nlPrompt.toLowerCase()
    let response = ''

    if (resource.type === 'pod') {
      if (prompt.includes('log') || prompt.includes('error')) {
        response = `To view logs for pod ${resource.name}:\n\n\`\`\`bash\nkubectl logs ${resource.name} -n ${resource.namespace || 'default'}\n\`\`\`\n\nFor previous container logs: \`kubectl logs ${resource.name} -n ${resource.namespace || 'default'} --previous\``
      } else if (prompt.includes('restart') || prompt.includes('fix')) {
        response = `To restart the pod, you can delete it (the deployment will recreate it):\n\n\`\`\`bash\nkubectl delete pod ${resource.name} -n ${resource.namespace || 'default'}\n\`\`\`\n\nOr rollout restart the deployment:\n\`kubectl rollout restart deployment/<deployment-name> -n ${resource.namespace || 'default'}\``
      } else if (prompt.includes('resource') || prompt.includes('cpu') || prompt.includes('memory')) {
        response = `To check resource usage:\n\n\`\`\`bash\nkubectl top pod ${resource.name} -n ${resource.namespace || 'default'}\n\`\`\`\n\nTo view resource limits:\n\`kubectl describe pod ${resource.name} -n ${resource.namespace || 'default'} | grep -A5 "Limits\\|Requests"\``
      } else {
        response = `For pod ${resource.name}, you can:\n- View logs: \`kubectl logs ${resource.name}\`\n- Get details: \`kubectl describe pod ${resource.name}\`\n- Check events: \`kubectl get events --field-selector involvedObject.name=${resource.name}\`\n- Access shell: \`kubectl exec -it ${resource.name} -- /bin/sh\``
      }
    } else if (resource.type === 'cluster') {
      if (prompt.includes('health') || prompt.includes('status')) {
        response = `Cluster ${resource.name} health check:\n- Nodes: \`kubectl get nodes\`\n- System pods: \`kubectl get pods -n kube-system\`\n- API health: \`kubectl get --raw='/healthz'\``
      } else {
        response = `For cluster ${resource.name}, you can:\n- Check nodes: \`kubectl get nodes\`\n- View namespaces: \`kubectl get ns\`\n- List all pods: \`kubectl get pods -A\``
      }
    } else {
      response = `For ${resource.type} "${resource.name}":\n- Describe: \`kubectl describe ${resource.type} ${resource.name}\`\n- Get YAML: \`kubectl get ${resource.type} ${resource.name} -o yaml\``
    }

    setAiResponse(response)
    setIsProcessing(false)
  }

  const renderDetailValue = (key: string, value: unknown) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">-</span>

    const stringValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

    return (
      <div className="flex items-center gap-2">
        <span className="text-foreground font-mono text-sm break-all">{stringValue}</span>
        <button
          onClick={() => handleCopy(key, stringValue)}
          className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          {copiedField === key ? (
            <CheckCircle className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      </div>
    )
  }

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
      <BaseModal.Header
        title={resource.name}
        description={`${resource.namespace ? `${resource.namespace} · ` : ''}${resource.cluster || 'current cluster'}${resource.status ? ` · ${resource.status}` : ''}`}
        icon={StatusIcon}
        onClose={onClose}
        showBack={false}
        extra={
          <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
            {resource.type}
          </span>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-border/50">
          <button
            onClick={() => setActiveTab('details')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'details'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors',
              activeTab === 'actions'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Quick Actions
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2',
              activeTab === 'ai'
                ? 'text-purple-400 border-b-2 border-purple-500'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Sparkles className="w-4 h-4" />
            Ask AI
          </button>
        </div>

      <BaseModal.Content className="max-h-[60vh]">
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Name</p>
                  {renderDetailValue('name', resource.name)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Type</p>
                  {renderDetailValue('type', resource.type)}
                </div>
                {resource.namespace && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Namespace</p>
                    {renderDetailValue('namespace', resource.namespace)}
                  </div>
                )}
                {resource.cluster && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Cluster</p>
                    {renderDetailValue('cluster', resource.cluster)}
                  </div>
                )}
                {resource.status && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <span className={cn('font-medium', statusConfig?.color || 'text-foreground')}>
                      {resource.status}
                    </span>
                  </div>
                )}
              </div>

              {/* Additional details */}
              {resource.details && Object.keys(resource.details).length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <h4 className="text-sm font-medium text-foreground mb-3">Additional Information</h4>
                  <div className="space-y-3">
                    {Object.entries(resource.details).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-muted-foreground mb-1 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        {renderDetailValue(key, value)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick command reference */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <h4 className="text-sm font-medium text-foreground mb-3">Quick Commands</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded bg-secondary/30 font-mono text-xs">
                    <span className="text-muted-foreground">
                      kubectl describe {resource.type} {resource.name}
                      {resource.namespace ? ` -n ${resource.namespace}` : ''}
                    </span>
                    <button
                      onClick={() => handleCopy('cmd-describe', `kubectl describe ${resource.type} ${resource.name}${resource.namespace ? ` -n ${resource.namespace}` : ''}`)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-secondary/30 font-mono text-xs">
                    <span className="text-muted-foreground">
                      kubectl get {resource.type} {resource.name}
                      {resource.namespace ? ` -n ${resource.namespace}` : ''} -o yaml
                    </span>
                    <button
                      onClick={() => handleCopy('cmd-yaml', `kubectl get ${resource.type} ${resource.name}${resource.namespace ? ` -n ${resource.namespace}` : ''} -o yaml`)}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="grid grid-cols-2 gap-3">
              {actions.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.id}
                    onClick={() => handleAction(action.id)}
                    className={cn(
                      'flex items-center gap-3 p-4 rounded-lg transition-colors text-left',
                      action.danger
                        ? 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400'
                        : 'bg-secondary/30 hover:bg-secondary/50 text-foreground'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{action.label}</span>
                  </button>
                )
              })}
              {actions.length === 0 && (
                <p className="col-span-2 text-center text-muted-foreground py-8">
                  No quick actions available for this resource type
                </p>
              )}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-purple-300">AI Assistant</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ask anything about this {resource.type}. Get troubleshooting help, kubectl commands,
                  or explanations of what's happening.
                </p>
              </div>

              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  What would you like to know?
                </label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  placeholder={`e.g., "Why is this ${resource.type} failing?" or "How do I view the logs?"`}
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm h-20 resize-none"
                  disabled={isProcessing}
                />
              </div>

              <button
                onClick={handleNLSubmit}
                disabled={!nlPrompt.trim() || isProcessing}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  nlPrompt.trim() && !isProcessing
                    ? 'bg-purple-500 text-foreground hover:bg-purple-600'
                    : 'bg-secondary text-muted-foreground cursor-not-allowed'
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Ask AI
                  </>
                )}
              </button>

              {aiResponse && (
                <div className="mt-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-purple-300">AI Response</span>
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap font-mono">
                    {aiResponse}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">Try asking:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>"Why is this failing?"</li>
                  <li>"How do I check the logs?"</li>
                  <li>"What resources is it using?"</li>
                  <li>"How do I restart it?"</li>
                  <li>"Show me related events"</li>
                </ul>
              </div>
            </div>
          )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <div className="flex justify-between gap-3 w-full">
          <button
            onClick={() => window.open(`#/${resource.type}/${resource.name}`, '_blank')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          >
            <ExternalLink className="w-4 h-4" />
            Open Full View
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-purple-500 text-foreground hover:bg-purple-600"
          >
            Close
          </button>
        </div>
      </BaseModal.Footer>
    </BaseModal>
  )
}
