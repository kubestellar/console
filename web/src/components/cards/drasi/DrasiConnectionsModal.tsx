/**
 * Modal for managing Drasi server connections.
 */
import { useState } from 'react'
import { X, Settings, Trash2, Plus, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ModalShell } from './DrasiModalShell'
import type { DrasiConnection } from '../../../hooks/useDrasiConnections'

// ---------------------------------------------------------------------------
// ConnectionsModal
// ---------------------------------------------------------------------------

interface ConnectionsModalProps {
  connections: DrasiConnection[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: (conn: Omit<DrasiConnection, 'id' | 'createdAt'>) => void
  onUpdate: (id: string, patch: Partial<Omit<DrasiConnection, 'id' | 'createdAt'>>) => void
  /** Parent handles confirm UX + runs the actual removal — we just fire
   *  the request so the parent's ConfirmDialog is what the user sees. */
  onRequestRemove: (id: string, name: string) => void
  onClose: () => void
}

export function ConnectionsModal({
  connections, activeId, onSelect, onAdd, onUpdate, onRequestRemove, onClose,
}: ConnectionsModalProps) {
  const { t } = useTranslation()
  // null = list view. 'new' = create form. string id = edit form.
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'server' | 'platform'>('server')
  const [url, setUrl] = useState('')
  const [cluster, setCluster] = useState('')

  const beginAdd = () => {
    setEditing('new')
    setName('')
    setMode('server')
    setUrl('')
    setCluster('')
  }
  const beginEdit = (conn: DrasiConnection) => {
    setEditing(conn.id)
    setName(conn.name)
    setMode(conn.mode)
    setUrl(conn.url ?? '')
    setCluster(conn.cluster ?? '')
  }
  const saveEdit = () => {
    const payload: Omit<DrasiConnection, 'id' | 'createdAt'> = {
      name: name.trim(),
      mode,
      url: mode === 'server' ? url.trim() : undefined,
      cluster: mode === 'platform' ? cluster.trim() : undefined,
    }
    if (!payload.name) return
    if (mode === 'server' && !payload.url) return
    if (mode === 'platform' && !payload.cluster) return
    if (editing === 'new') onAdd(payload)
    else if (editing) onUpdate(editing, payload)
    setEditing(null)
  }

  return (
    <ModalShell
      labelledBy="drasi-connections-title"
      onClose={onClose}
      closeOnBackdrop={false}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-lg w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id="drasi-connections-title" className="text-white font-semibold text-sm">{t('drasi.connectionsTitle')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">{t('drasi.connectionsSubtitle')}</div>
        </div>
        <button type="button" onClick={onClose} className="min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {editing === null ? (
        <>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {connections.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">{t('drasi.noConnections')}</div>
            )}
            {connections.map(conn => (
              <div
                key={conn.id}
                className={`flex items-center gap-2 p-2 rounded border ${
                  conn.id === activeId ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-slate-700/40 bg-slate-950/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(conn.id)}
                  className="flex-1 text-left min-w-0"
                  aria-label={t('drasi.selectConnection', { name: conn.name })}
                >
                  <div className="flex items-center gap-1.5">
                    {conn.id === activeId && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                    <span className="text-xs font-semibold text-white truncate">{conn.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {conn.mode === 'server' ? conn.url : `${t('drasi.clusterLabel')}: ${conn.cluster}`}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => beginEdit(conn)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300"
                  aria-label={t('actions.edit')}
                  title={t('actions.edit')}
                >
                  <Settings className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRequestRemove(conn.id, conn.name)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300"
                  aria-label={t('actions.delete')}
                  title={t('actions.delete')}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={beginAdd}
              className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />
              {t('drasi.addConnection')}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
            {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('drasi.connectionNamePlaceholder')}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.connectionModeLabel')}</label>
            {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
            <select
              value={mode}
              onChange={e => setMode(e.target.value as 'server' | 'platform')}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
            >
              <option value="server">drasi-server (REST)</option>
              <option value="platform">drasi-platform (Kubernetes)</option>
            </select>
          </div>
          {mode === 'server' ? (
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.serverUrlLabel')}</label>
              {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="http://localhost:8090"
                className="w-full px-2 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.clusterContextLabel')}</label>
              {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
              <input
                type="text"
                value={cluster}
                onChange={e => setCluster(e.target.value)}
                placeholder="prow"
                className="w-full px-2 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700">{t('actions.cancel')}</button>
            <button
              type="button"
              onClick={saveEdit}
              className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              {t('actions.save')}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
