/**
 * Modal and drawer components for the Drasi Reactive Graph card.
 *
 * Exports:
 *   ModalShell        — shared escape-to-close dialog wrapper (DrasiModalShell.tsx)
 *   ExpandModal       — read-only node details
 *   RowDetailDrawer   — click-a-row JSON viewer (slide-in drawer)
 *   SourceConfigModal — create / edit a Drasi Source (DrasiConfigModals.tsx)
 *   QueryConfigModal  — create / edit a Drasi ContinuousQuery (DrasiConfigModals.tsx)
 *   ConnectionsModal  — manage Drasi server connections (DrasiConnectionsModal.tsx)
 */
import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { oneDark } from '@codemirror/theme-one-dark'
import { LazyCodeMirror } from './LazyCodeMirror'
import { ModalShell } from './DrasiModalShell'
import type { LiveResultRow, ExpandedNodeDetails } from './DrasiTypes'

export { ModalShell } from './DrasiModalShell'
export { SourceConfigModal, QueryConfigModal } from './DrasiConfigModals'
export { ConnectionsModal } from './DrasiConnectionsModal'

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
        <LazyCodeMirror
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
