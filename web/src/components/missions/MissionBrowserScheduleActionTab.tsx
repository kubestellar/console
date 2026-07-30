import { useEffect, useMemo, useState } from 'react'
import { stellarApi } from '../../services/stellar'
import { useToast } from '../ui/Toast'

type ActionType = 'ScaleDeployment' | 'RestartDeployment' | 'DeletePod' | 'CordonNode' | 'DeleteCluster'
type ScheduleMode = 'after-approval' | 'scheduled-time'

interface Props {
  isActive: boolean
}

const MAX_SCALE_REPLICAS = 50

const ACTION_OPTIONS: Array<{ value: ActionType; label: string; destructive?: boolean }> = [
  { value: 'ScaleDeployment', label: 'Scale Deployment' },
  { value: 'RestartDeployment', label: 'Restart Deployment' },
  { value: 'DeletePod', label: 'Delete Pod', destructive: true },
  { value: 'CordonNode', label: 'Cordon Node' },
  { value: 'DeleteCluster', label: 'Delete Cluster', destructive: true },
]

export function MissionBrowserScheduleActionTab({ isActive }: Props) {
  const { showToast } = useToast()
  const [clusters, setClusters] = useState<string[]>([])
  const [cluster, setCluster] = useState('')
  const [actionType, setActionType] = useState<ActionType>('ScaleDeployment')
  const [namespace, setNamespace] = useState('default')
  const [name, setName] = useState('')
  const [replicas, setReplicas] = useState(1)
  const [node, setNode] = useState('')
  const [confirmToken, setConfirmToken] = useState('')
  const [description, setDescription] = useState('')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('after-approval')
  const [scheduledAtLocal, setScheduledAtLocal] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isActive) return
    let mounted = true
    const loadState = async () => {
      try {
        const state = await stellarApi.getState()
        if (!mounted) return
        const watching = state.clustersWatching || []
        setClusters(watching)
        if (!cluster && watching.length > 0) setCluster(watching[0])
      } catch {
        if (mounted) setClusters([])
      }
    }
    void loadState()
    return () => {
      mounted = false
    }
  }, [cluster, isActive])

  useEffect(() => {
    setDescription(buildDescription({ actionType, namespace, name, replicas, node }))
  }, [actionType, namespace, name, replicas, node])

  const isDestructive = useMemo(
    () => ACTION_OPTIONS.find(item => item.value === actionType)?.destructive ?? false,
    [actionType],
  )

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!cluster) {
      showToast('Select a cluster first.', 'warning')
      return
    }
    const parameters: Record<string, unknown> = {}
    let namespaceValue = ''
    if (actionType === 'ScaleDeployment') {
      namespaceValue = namespace.trim()
      parameters.namespace = namespaceValue
      parameters.name = name.trim()
      parameters.replicas = replicas
    } else if (actionType === 'RestartDeployment') {
      namespaceValue = namespace.trim()
      parameters.namespace = namespaceValue
      parameters.name = name.trim()
    } else if (actionType === 'DeletePod') {
      namespaceValue = namespace.trim()
      parameters.namespace = namespaceValue
      parameters.name = name.trim()
    } else if (actionType === 'CordonNode') {
      parameters.node = node.trim()
    } else if (actionType === 'DeleteCluster') {
      parameters.confirm_token = confirmToken.trim()
    }

    setSubmitting(true)
    try {
      const scheduledAt = scheduleMode === 'scheduled-time' && scheduledAtLocal
        ? new Date(scheduledAtLocal).toISOString()
        : null
      await stellarApi.createAction({
        description: description.trim() || buildDescription({ actionType, namespace, name, replicas, node }),
        actionType,
        parameters,
        cluster,
        namespace: namespaceValue,
        scheduledAt,
      })
      showToast('Action created — waiting for approval in Stellar panel.', 'success')
      setName('')
      setNode('')
      setConfirmToken('')
      setScheduledAtLocal('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create action'
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h3 className="text-base font-semibold text-foreground">Schedule Action</h3>
      <form className="space-y-4 rounded-lg border border-border bg-card p-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Cluster</span>
            <select
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={cluster}
              onChange={(event) => setCluster(event.target.value)}
            >
              {clusters.length === 0 && <option value="">No clusters available</option>}
              {clusters.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Action type</span>
            <select
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={actionType}
              onChange={(event) => setActionType(event.target.value as ActionType)}
            >
              {ACTION_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(actionType === 'ScaleDeployment' || actionType === 'RestartDeployment' || actionType === 'DeletePod') && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Namespace</span>
              <input
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{actionType === 'DeletePod' ? 'Pod name' : 'Deployment name'}</span>
              <input
                className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>
        )}

        {actionType === 'ScaleDeployment' && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Replicas (0–50)</span>
            <input
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              type="number"
              min={0}
              max={MAX_SCALE_REPLICAS}
              value={replicas}
              onChange={(event) => setReplicas(Number(event.target.value))}
            />
          </label>
        )}

        {actionType === 'CordonNode' && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Node name</span>
            <input
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={node}
              onChange={(event) => setNode(event.target.value)}
            />
          </label>
        )}

        {actionType === 'DeleteCluster' && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Confirm token</span>
            <input
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={confirmToken}
              onChange={(event) => setConfirmToken(event.target.value)}
              placeholder="Type first 8 chars of action ID after creation"
            />
          </label>
        )}

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Description</span>
          <input
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <div className="space-y-2 rounded border border-border p-3">
          <div className="text-sm text-muted-foreground">When</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scheduleMode === 'after-approval'}
              onChange={() => setScheduleMode('after-approval')}
            />
            After approval
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={scheduleMode === 'scheduled-time'}
              onChange={() => setScheduleMode('scheduled-time')}
            />
            Scheduled time
          </label>
          {scheduleMode === 'scheduled-time' && (
            <input
              type="datetime-local"
              className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-sm"
              value={scheduledAtLocal}
              onChange={(event) => setScheduledAtLocal(event.target.value)}
            />
          )}
        </div>

        {isDestructive && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            ⚠ This action is destructive and cannot be undone. It will not execute until you approve it in the Stellar panel.
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create action'}
        </button>
      </form>
    </div>
  )
}

function buildDescription(input: {
  actionType: ActionType
  namespace: string
  name: string
  replicas: number
  node: string
}) {
  if (input.actionType === 'ScaleDeployment') {
    return `Scale ${input.namespace || 'default'}/${input.name || 'deployment'} to ${input.replicas} replicas`
  }
  if (input.actionType === 'RestartDeployment') {
    return `Restart deployment ${input.namespace || 'default'}/${input.name || 'deployment'}`
  }
  if (input.actionType === 'DeletePod') {
    return `Delete pod ${input.namespace || 'default'}/${input.name || 'pod'}`
  }
  if (input.actionType === 'CordonNode') {
    return `Cordon node ${input.node || 'node'}`
  }
  return 'Delete cluster context'
}
