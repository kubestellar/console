import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface MaintenanceWindow {
  id: string
  cluster: string
  description: string
  startTime: string
  endTime: string
  type: 'upgrade' | 'maintenance' | 'patching' | 'custom'
  status: 'scheduled' | 'active' | 'completed'
}

const STORAGE_KEY = 'kubestellar-maintenance-windows'

function loadWindows(): MaintenanceWindow[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveWindows(windows: MaintenanceWindow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(windows))
}

export function MaintenanceWindows() {
  const { t } = useTranslation()
  const [windows, setWindows] = useState<MaintenanceWindow[]>(loadWindows)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    cluster: '',
    description: '',
    startTime: '',
    endTime: '',
    type: 'maintenance' as MaintenanceWindow['type'],
  })

  const updateStatus = useCallback(() => {
    const now = new Date()
    return windows.map(w => {
      const start = new Date(w.startTime)
      const end = new Date(w.endTime)
      if (now >= start && now <= end) return { ...w, status: 'active' as const }
      if (now > end) return { ...w, status: 'completed' as const }
      return { ...w, status: 'scheduled' as const }
    })
  }, [windows])

  const displayWindows = useMemo(() => {
    return updateStatus().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [updateStatus])

  const handleAdd = useCallback(() => {
    if (!formData.cluster || !formData.startTime || !formData.endTime) return
    const newWindow: MaintenanceWindow = {
      id: `mw-${Date.now()}`,
      ...formData,
      status: 'scheduled',
    }
    const updated = [...windows, newWindow]
    setWindows(updated)
    saveWindows(updated)
    setShowForm(false)
    setFormData({ cluster: '', description: '', startTime: '', endTime: '', type: 'maintenance' })
  }, [formData, windows])

  const handleDelete = useCallback((id: string) => {
    const updated = windows.filter(w => w.id !== id)
    setWindows(updated)
    saveWindows(updated)
  }, [windows])

  const typeColors: Record<string, string> = {
    upgrade: 'bg-blue-500/10 text-blue-400',
    maintenance: 'bg-purple-500/10 text-purple-400',
    patching: 'bg-orange-500/10 text-orange-400',
    custom: 'bg-cyan-500/10 text-cyan-400',
  }

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500/10 text-blue-400',
    active: 'bg-green-500/10 text-green-400 animate-pulse',
    completed: 'bg-muted/50 text-muted-foreground',
  }

  return (
    <div className="space-y-2 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{displayWindows.filter(w => w.status !== 'completed').length} upcoming</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Schedule'}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2 p-2 rounded-lg bg-muted/30 border border-border/50">
          <input
            type="text"
            placeholder="Cluster name"
            value={formData.cluster}
            onChange={e => setFormData(f => ({ ...f, cluster: e.target.value }))}
            className="w-full px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
            className="w-full px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={formData.startTime}
              onChange={e => setFormData(f => ({ ...f, startTime: e.target.value }))}
              className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="datetime-local"
              value={formData.endTime}
              onChange={e => setFormData(f => ({ ...f, endTime: e.target.value }))}
              className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center justify-between">
            <select
              value={formData.type}
              onChange={e => setFormData(f => ({ ...f, type: e.target.value as MaintenanceWindow['type'] }))}
              className="px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="maintenance">Maintenance</option>
              <option value="upgrade">{t('common.upgrade')}</option>
              <option value="patching">Patching</option>
              <option value="custom">{t('common.custom')}</option>
            </select>
            <button onClick={handleAdd} className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Add
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {displayWindows.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No maintenance windows scheduled
          </div>
        ) : (
          displayWindows.map(w => (
            <div key={w.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[w.status]}`}>{w.status}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${typeColors[w.type]}`}>{w.type}</span>
                  <span className="text-sm font-medium truncate">{w.cluster}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{w.description}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(w.startTime).toLocaleString()} — {new Date(w.endTime).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => handleDelete(w.id)}
                className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-300 px-1 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
