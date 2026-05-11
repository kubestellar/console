import { useState } from 'react'
import { stellarApi } from '../../services/stellar'

const ACTION_CONFIGS: Record<string, {
  label: string
  destructive: boolean
  params: Array<{ name: string; label: string; type: 'text' | 'number'; placeholder?: string; min?: number; max?: number }>
}> = {
  ScaleDeployment: { label: 'Scale Deployment', destructive: false, params: [{ name: 'namespace', label: 'Namespace', type: 'text', placeholder: 'payments' }, { name: 'name', label: 'Deployment name', type: 'text', placeholder: 'worker' }, { name: 'replicas', label: 'Replicas', type: 'number', min: 0, max: 100 }] },
  RestartDeployment: { label: 'Restart Deployment', destructive: false, params: [{ name: 'namespace', label: 'Namespace', type: 'text' }, { name: 'name', label: 'Deployment name', type: 'text' }] },
  DeletePod: { label: 'Delete Pod', destructive: true, params: [{ name: 'namespace', label: 'Namespace', type: 'text' }, { name: 'name', label: 'Pod name', type: 'text' }] },
  CordonNode: { label: 'Cordon Node', destructive: true, params: [{ name: 'node', label: 'Node name', type: 'text' }] },
  DeleteCluster: { label: 'Delete Cluster ⚠', destructive: true, params: [] },
}

export function ScheduleActionForm() {
  const [cluster, setCluster] = useState('')
  const [actionType, setActionType] = useState('RestartDeployment')
  const [values, setValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<string | null>(null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder="Cluster" />
      <select value={actionType} onChange={(e) => setActionType(e.target.value)}>
        {Object.entries(ACTION_CONFIGS).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
      </select>
      {(ACTION_CONFIGS[actionType]?.params || []).map(param => (
        <input key={param.name} type={param.type} value={values[param.name] || ''} onChange={(e) => setValues(prev => ({ ...prev, [param.name]: e.target.value }))} placeholder={param.label} />
      ))}
      <button
        onClick={() => {
          const params: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(values)) params[key] = value
          void stellarApi.createAction({
            description: `${ACTION_CONFIGS[actionType]?.label || actionType}`,
            actionType,
            parameters: params,
            cluster,
            namespace: typeof params.namespace === 'string' ? params.namespace : '',
          }).then(() => setStatus('Action created — waiting for approval in Stellar panel')).catch((e) => setStatus(e instanceof Error ? e.message : 'failed'))
        }}
      >
        Submit
      </button>
      {status && <div>{status}</div>}
    </div>
  )
}
