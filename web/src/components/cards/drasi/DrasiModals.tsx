/**
 * Modal and drawer components for the Drasi Reactive Graph card.
 *
 * Exports:
 *   ModalShell        — shared escape-to-close dialog wrapper
 *   ExpandModal       — read-only node details
 *   RowDetailDrawer   — click-a-row JSON viewer (slide-in drawer)
 *   SourceConfigModal — create / edit a Drasi Source
 *   QueryConfigModal  — create / edit a Drasi ContinuousQuery
 *   ConnectionsModal  — manage Drasi server connections
 */
import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Download, Settings, Trash2, Plus, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import yaml from 'js-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { cypher } from '@codemirror/legacy-modes/mode/cypher'
import { oneDark } from '@codemirror/theme-one-dark'
import { downloadText } from '../../../lib/download'
import type {
  DrasiSource, DrasiQuery, LiveResultRow,
  ExpandedNodeDetails, SourceConfig, QueryConfig, SourceKind,
} from './DrasiTypes'
import type { DrasiConnection } from '../../../hooks/useDrasiConnections'
import { CODEMIRROR_EDITOR_HEIGHT_PX } from './DrasiConstants'

// ---------------------------------------------------------------------------
// ModalShell
// ---------------------------------------------------------------------------

/** Shared dialog wrapper — ESC to close, aria-modal, backdrop click. Modals
 *  are scoped inside the card container (absolute inset-0), not portaled to
 *  body (#7872). */
export function ModalShell({
  labelledBy,
  onClose,
  panelClassName,
  children,
  closeOnBackdrop = true,
}: {
  labelledBy: string
  onClose: () => void
  panelClassName: string
  children: React.ReactNode
  /** When false, clicking the backdrop does not close the modal. Defaults to true. */
  closeOnBackdrop?: boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) onClose()
  }

  return (
    <motion.div
      className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleBackdropClick}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={panelClassName}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// RowDetailDrawer
// ---------------------------------------------------------------------------

export function RowDetailDrawer({ row, onClose }: { row: LiveResultRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && row) {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [row, onClose])

  if (!row) return null
  const json = JSON.stringify(row, null, 2)
  return (
    <motion.div
      className="absolute top-0 right-0 bottom-0 z-40 w-80 bg-slate-950 border-l border-slate-700 shadow-2xl flex flex-col"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.2 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-y-2 px-3 py-2 border-b border-slate-700/60">
        <span className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">{t('drasi.rowDetailTitle')}</span>
        <button type="button" onClick={onClose} className="min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden text-xs">
        <CodeMirror
          value={json}
          theme={oneDark}
          extensions={[]}
          editable={false}
          basicSetup={{
            lineNumbers: false,
            highlightActiveLine: false,
            foldGutter: false,
            autocompletion: false,
          }}
        />
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// ExpandModal
// ---------------------------------------------------------------------------

export function ExpandModal({ node, onClose }: { node: ExpandedNodeDetails | null; onClose: () => void }) {
  const { t } = useTranslation()
  if (!node) return null
  const titleId = `drasi-expand-title-${node.id}`
  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{node.name}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {node.type} · {node.kind}
          </div>
        </div>
        <button type="button" onClick={onClose} className="min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between text-foreground">
          <span className="text-muted-foreground">{t('drasi.idLabel')}</span>
          <span className="font-mono">{node.id}</span>
        </div>
        {node.extra && Object.entries(node.extra).map(([k, v]) => (
          <div key={k} className="flex justify-between text-foreground gap-3">
            <span className="text-muted-foreground whitespace-nowrap">{k}:</span>
            <span className="font-mono truncate text-right">{v}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// SourceConfigModal
// ---------------------------------------------------------------------------

const SOURCE_KINDS: SourceKind[] = ['HTTP', 'POSTGRES', 'COSMOSDB', 'GREMLIN', 'SQL']

export function SourceConfigModal({
  source, onSave, onClose,
}: {
  /** When null, the modal is in create mode. */
  source: DrasiSource | null
  onSave: (config: SourceConfig) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isCreate = source === null
  const [name, setName] = useState(source?.name ?? '')
  const [kind, setKind] = useState<SourceKind>(source?.kind ?? 'HTTP')
  const titleId = `drasi-source-config-title-${source?.id ?? 'new'}`

  const handleDownloadYaml = () => {
    if (!source) return
    const doc = { apiVersion: 'v1', kind: 'Source', name: source.name, spec: { kind: source.kind } }
    downloadText(`${source.name}.yaml`, yaml.dump(doc), 'text/yaml')
  }

  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      closeOnBackdrop={false}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-md w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{isCreate ? t('drasi.createSource') : t('drasi.configureSource')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {isCreate ? t('drasi.newSourceSubtitle') : t('drasi.sourceKindLabel', { kind: source!.kind })}
          </div>
        </div>
        <button type="button" onClick={onClose} className="min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.sourceTypeLabel')}</label>
          <select
            value={kind}
            onChange={e => setKind(e.target.value as SourceKind)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          >
            {SOURCE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-4">
        {!isCreate ? (
          <button
            type="button"
            onClick={handleDownloadYaml}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {t('drasi.downloadYaml')}
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700">{t('actions.cancel')}</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => { onSave({ name: name.trim(), kind }); onClose() }}
            className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white"
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// QueryConfigModal
// ---------------------------------------------------------------------------

const QUERY_LANGUAGES = ['CYPHER QUERY', 'GREMLIN QUERY', 'SQL QUERY']

export function QueryConfigModal({
  query, onSave, onClose,
}: {
  /** When null, the modal is in create mode. */
  query: DrasiQuery | null
  onSave: (config: QueryConfig) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const isCreate = query === null
  const [name, setName] = useState(query?.name ?? '')
  const [language, setLanguage] = useState(query?.language ?? 'CYPHER QUERY')
  const [queryText, setQueryText] = useState(query?.queryText ?? '')
  const titleId = `drasi-query-config-title-${query?.id ?? 'new'}`

  const handleDownloadYaml = () => {
    if (!query) return
    const doc = {
      apiVersion: 'v1',
      kind: 'ContinuousQuery',
      name: query.name,
      spec: {
        mode: query.language.replace(/ QUERY$/, ''),
        query: query.queryText || '',
        sources: query.sourceIds.map(id => ({ id })),
      },
    }
    downloadText(`${query.name}.yaml`, yaml.dump(doc), 'text/yaml')
  }

  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      closeOnBackdrop={false}
      panelClassName="bg-slate-900 border border-slate-600/50 rounded-lg max-w-lg w-full p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div id={titleId} className="text-white font-semibold text-sm">{isCreate ? t('drasi.createContinuousQuery') : t('drasi.configureContinuousQuery')}</div>
          <div className="text-muted-foreground text-xs uppercase tracking-wider mt-0.5">
            {isCreate ? t('drasi.newQuerySubtitle') : t('drasi.queryLanguageLabel', { language: query!.language })}
          </div>
        </div>
        <button type="button" onClick={onClose} className="min-w-11 min-h-11 flex items-center justify-center rounded hover:bg-slate-800 text-slate-400" aria-label={t('actions.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryTypeLabel')}</label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          >
            {QUERY_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryLabel')}</label>
          <div className="rounded border border-slate-700 overflow-hidden text-xs">
            <CodeMirror
              value={queryText}
              onChange={setQueryText}
              theme={oneDark}
              extensions={[StreamLanguage.define(cypher)]}
              height={CODEMIRROR_EDITOR_HEIGHT_PX}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: true,
                foldGutter: false,
                autocompletion: false,
              }}
              placeholder={t('drasi.queryPlaceholder')}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center gap-2 mt-4">
        {!isCreate ? (
          <button
            type="button"
            onClick={handleDownloadYaml}
            className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {t('drasi.downloadYaml')}
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-muted-foreground border border-slate-700">{t('actions.cancel')}</button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => { onSave({ name: name.trim(), language, queryText }); onClose() }}
            className="px-3 py-1.5 text-xs rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white"
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

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
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
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
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('drasi.connectionNamePlaceholder')}
              className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.connectionModeLabel')}</label>
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
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.serverUrlLabel')}</label>
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
              <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.clusterContextLabel')}</label>
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
