import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useClusters } from '../../hooks/useMCP'
// Shared two-click delete-confirm window (also used by ResolutionHistoryPanel)
// — keep a single source of truth for delete-confirm timing (#7935).
import { DELETE_CONFIRM_TIMEOUT_MS } from '../../lib/constants/network'

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

/** Interval for auto-refreshing status badges (30 seconds) */
const STATUS_REFRESH_INTERVAL_MS = 30_000

function loadWindows(): MaintenanceWindow[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveWindows(windows: MaintenanceWindow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(windows))
  } catch {
    // Silently ignore quota errors or private browsing restrictions
  }
}

export function MaintenanceWindows() {
  const { t } = useTranslation(['common', 'cards'])
  const { deduplicatedClusters: clusters } = useClusters()
  const [windows, setWindows] = useState<MaintenanceWindow[]>(loadWindows)
  const [showForm, setShowForm] = useState(false)
  const [timeError, setTimeError] = useState('')
  /** Tick counter incremented by setInterval to force status recalculation */
  const [, setTick] = useState(0)
  const [formData, setFormData] = useState({
    cluster: '',
    description: '',
    startTime: '',
    endTime: '',
    type: 'maintenance' as MaintenanceWindow['type'] })

  // Auto-refresh status badges so scheduled→active→completed transitions
  // are reflected even when the user is idle (#4848)
  useEffect(() => {
    if (windows.length === 0) return
    const interval = setInterval(() => setTick(prev => prev + 1), STATUS_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [windows.length])

  /** Available cluster names from connected clusters */
  const clusterNames = useMemo(() =>
    (clusters || []).map(c => c.name).filter(Boolean).sort(),
    [clusters]
  )

  const updateStatus = () => {
    const now = new Date()
    return windows.map(w => {
      const start = new Date(w.startTime)
      const end = new Date(w.endTime)
      if (now >= start && now <= end) return { ...w, status: 'active' as const }
      if (now > end) return { ...w, status: 'completed' as const }
      return { ...w, status: 'scheduled' as const }
    })
  }

  const displayWindows = updateStatus().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  const handleAdd = () => {
    if (!formData.cluster || !formData.startTime || !formData.endTime) return
    if (new Date(formData.endTime) <= new Date(formData.startTime)) {
      setTimeError('End time must be after start time')
      return
    }
    setTimeError('')
    const newWindow: MaintenanceWindow = {
      id: `mw-${Date.now()}`,
      ...formData,
      status: 'scheduled' }
    const updated = [...windows, newWindow]
    setWindows(updated)
    saveWindows(updated)
    setShowForm(false)
    setFormData({ cluster: '', description: '', startTime: '', endTime: '', type: 'maintenance' })
  }

  // Two-click delete: first click shows "Confirm?", second click deletes.
  // Prevents accidental loss of scheduled maintenance windows (#7932).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => () => clearTimeout(deleteTimerRef.current), [])

  // Outside-click cancels the pending-confirm state, matching the PR #7934
  // test-plan promise that clicking away resets the confirm pill (#7935).
  useEffect(() => {
    if (!pendingDeleteId) return
    const onPointerDown = (e: PointerEvent) => {
      const btn = confirmButtonRef.current
      if (btn && e.target instanceof Node && btn.contains(e.target)) return
      clearTimeout(deleteTimerRef.current)
      setPendingDeleteId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pendingDeleteId])

  const handleDelete = (id: string) => {
    if (pendingDeleteId === id) {
      // Second click — confirmed
      clearTimeout(deleteTimerRef.current)
      setPendingDeleteId(null)
      const updated = windows.filter(w => w.id !== id)
      setWindows(updated)
      saveWindows(updated)
    } else {
      // First click — enter confirm state with auto-reset
      setPendingDeleteId(id)
      clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = setTimeout(
        () => setPendingDeleteId(prev => prev === id ? null : prev),
        DELETE_CONFIRM_TIMEOUT_MS
      )
    }
  }

  const typeColors: Record<string, string> = {
    upgrade: 'bg-blue-500/10 text-blue-400',
    maintenance: 'bg-purple-500/10 text-purple-400',
    patching: 'bg-orange-500/10 text-orange-400',
    custom: 'bg-cyan-500/10 text-cyan-400' }

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500/10 text-blue-400',
    active: 'bg-green-500/10 text-green-400 animate-pulse',
    completed: 'bg-muted/50 text-muted-foreground' }

  return (
    <div className="space-y-2 p-1">
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <span className="text-xs text-muted-foreground">{displayWindows.filter(w => w.status !== 'completed').length} upcoming</span>
        <button
          onClick={() => { setShowForm(!showForm); setTimeError('') }}
          className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          {showForm ? 'Cancel' : '+ Schedule'}
        </button>
      </div>

      {showForm && (
        <div className="space-y-2 p-2 rounded-lg bg-muted/30 border border-border/50">
          {clusterNames.length > 0 ? (
            <select
              value={formData.cluster}
              onChange={e => setFormData(f => ({ ...f, cluster: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="">{t('common.selectCluster')}</option>
              {clusterNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Cluster name"
              value={formData.cluster}
              onChange={e => setFormData(f => ({ ...f, cluster: e.target.value }))}
              className="w-full px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          )}
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
            className="w-full px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={formData.startTime}
              onChange={e => setFormData(f => ({ ...f, startTime: e.target.value }))}
              className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <input
              type="datetime-local"
              value={formData.endTime}
              onChange={e => setFormData(f => ({ ...f, endTime: e.target.value }))}
              className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>
          {timeError && (
            <p className="text-xs text-red-400">{timeError}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-y-2">
            <select
              value={formData.type}
              onChange={e => setFormData(f => ({ ...f, type: e.target.value as MaintenanceWindow['type'] }))}
              className="px-2 py-1 text-xs rounded bg-background border border-border/50 focus:outline-hidden focus:ring-1 focus:ring-primary"
            >
              <option value="maintenance">{t('common.maintenance')}</option>
              <option value="upgrade">{t('common.upgrade')}</option>
              <option value="patching">{t('common.patching')}</option>
              <option value="custom">{t('common.custom')}</option>
            </select>
            <button onClick={handleAdd} className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              {t('common.add')}
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
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-y-2 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
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
                ref={pendingDeleteId === w.id ? confirmButtonRef : undefined}
                onClick={() => handleDelete(w.id)}
                title={pendingDeleteId === w.id
                  ? t('cards:maintenanceWindows.clickAgainToConfirm')
                  : t('cards:maintenanceWindows.deleteTitle')}
                aria-label={pendingDeleteId === w.id
                  ? t('cards:maintenanceWindows.confirmDeleteAria')
                  : t('cards:maintenanceWindows.deleteAria')}
                // Keyboard users need the button visible when focused — the
                // opacity-0 default hides it (and its focus ring) entirely
                // without a pointer hover (#7935). group-focus-within and
                // focus-visible reveal it for keyboard/assistive tech.
                className={
                  pendingDeleteId === w.id
                    ? 'opacity-100 text-xs font-medium text-red-500 hover:text-red-400 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/40 transition-opacity'
                    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-red-400 text-xs text-red-400 hover:text-red-300 px-1 rounded transition-opacity'
                }
              >
                {pendingDeleteId === w.id ? t('cards:maintenanceWindows.confirmLabel') : '✕'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
