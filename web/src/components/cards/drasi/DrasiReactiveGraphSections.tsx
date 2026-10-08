// Modal safety: All modals rendered here (SourceConfigModal, QueryConfigModal,
// ConnectionsModal, ConfirmDialog) are defined in DrasiModals.tsx and already
// handle Escape via ModalShell, with closeOnBackdrop={false} on form modals.
import { AnimatePresence } from 'framer-motion'
import { Code2, Rocket, Server, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMissionRoute } from '../../../config/routes'
import { ConfirmDialog } from '../../../lib/modals'
import type { DrasiConnection } from '../../../hooks/useDrasiConnections'
import {
  KPI_LABEL_EVENTS_PER_SEC,
  KPI_LABEL_REACTIONS,
  KPI_LABEL_RESULT_ROWS,
  KPI_LABEL_SOURCES,
} from './DrasiConstants'
import { FLOW_ID_ALL, type Flow } from './DrasiFlowUtils'
import {
  ConnectionsModal,
  ExpandModal,
  QueryConfigModal,
  RowDetailDrawer,
  SourceConfigModal,
} from './DrasiModals'
import { StreamSampleDrawer } from './DrasiStreamSamples'
import { KPIBox } from './DrasiResultsTable'
import type {
  DrasiQuery,
  DrasiSource,
  ExpandedNodeDetails,
  LiveResultRow,
  QueryConfig,
  SourceConfig,
} from './DrasiTypes'

export { DrasiPipelineCanvas } from './DrasiPipelineCanvas'

interface DrasiHeaderControlsProps {
  activeConnection: DrasiConnection | null
  drasiConnections: DrasiConnection[]
  flows: Flow[]
  selectedFlowId: string
  onSelectConnection: (id: string) => void
  onOpenConnectionsModal: () => void
  onSelectFlow: (id: string) => void
  onOpenStreamSamples: () => void
}

export function DrasiHeaderControls({
  activeConnection,
  drasiConnections,
  flows,
  selectedFlowId,
  onSelectConnection,
  onOpenConnectionsModal,
  onSelectFlow,
  onOpenStreamSamples,
}: DrasiHeaderControlsProps) {
  const { t } = useTranslation()

  return (
    <div className="shrink-0 mb-4 flex items-center gap-2 flex-wrap">
      <Server className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
      <select
        value={activeConnection?.id ?? ''}
        onChange={e => onSelectConnection(e.target.value)}
        className="min-w-[160px] max-w-[260px] px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
        aria-label={t('drasi.connectionsTitle')}
      >
        <option value="">{t('drasi.noActiveConnection')}</option>
        {drasiConnections.map(connection => (
          <option key={connection.id} value={connection.id}>
            {connection.name}
            {connection.mode === 'server' ? ' · server' : ' · platform'}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onOpenConnectionsModal}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300"
        aria-label={t('drasi.manageConnections')}
        title={t('drasi.manageConnections')}
      >
        <Settings className="w-3 h-3" />
      </button>
      {(flows.length > 1 || selectedFlowId !== FLOW_ID_ALL) && (
        <>
          <span className="text-xs uppercase tracking-wider text-muted-foreground shrink-0 ml-1">{t('drasi.flowLabel')}</span>
          <select
            value={selectedFlowId}
            onChange={e => onSelectFlow(e.target.value)}
            className="shrink-0 min-w-[140px] max-w-[220px] px-2 py-1 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
            aria-label={t('drasi.flowLabel')}
          >
            <option value={FLOW_ID_ALL}>{t('drasi.flowAllResources')}</option>
            {flows.map(flow => (
              <option key={flow.id} value={flow.id}>{flow.label}</option>
            ))}
          </select>
        </>
      )}
      <button
        type="button"
        onClick={onOpenStreamSamples}
        className="shrink-0 ml-auto px-2 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-muted-foreground hover:text-cyan-300 flex items-center gap-1.5"
        aria-label={t('drasi.consumeStreamTitle')}
        title={t('drasi.consumeStreamTitle')}
      >
        <Code2 className="w-3 h-3" />
        {t('drasi.consumeStream')}
      </button>
    </div>
  )
}

export function DrasiInstallBanner({ isLive }: { isLive: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (isLive) return null

  return (
    <div className="shrink-0 mb-2 p-2 rounded border border-cyan-500/30 bg-cyan-500/5 flex flex-wrap items-center justify-between gap-y-2 gap-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-cyan-300 truncate">{t('drasi.installDrasiTitle')}</div>
        <div className="text-xs text-muted-foreground truncate">{t('drasi.installDrasiDescription')}</div>
      </div>
      <button
        type="button"
        onClick={() => navigate(getMissionRoute('install-drasi'))}
        className="shrink-0 px-2.5 py-1 text-xs rounded bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5"
      >
        <Rocket className="w-3 h-3" />
        {t('drasi.installDrasiButton')}
      </button>
    </div>
  )
}

export function DrasiKpiStrip({
  kpis,
}: {
  kpis: { eventsPerSec: number; matchRate: number; activeSources: number; activeReactions: number }
}) {
  return (
    <div className="shrink-0 grid grid-cols-2 @md:grid-cols-4 gap-2 mb-2">
      <KPIBox label={KPI_LABEL_EVENTS_PER_SEC} value={kpis.eventsPerSec} accent="emerald" />
      <KPIBox label={KPI_LABEL_RESULT_ROWS} value={kpis.matchRate} accent="cyan" />
      <KPIBox label={KPI_LABEL_SOURCES} value={kpis.activeSources} accent="emerald" />
      <KPIBox label={KPI_LABEL_REACTIONS} value={kpis.activeReactions} accent="emerald" />
    </div>
  )
}

interface DrasiOverlaysProps {
  selectedRow: LiveResultRow | null
  onCloseSelectedRow: () => void
  showStreamSamples: boolean
  streamEndpoint: string
  isDemoData: boolean
  onCloseStreamSamples: () => void
  showConnectionsModal: boolean
  connections: DrasiConnection[]
  activeConnectionId: string
  onSelectConnection: (id: string) => void
  onAddConnection: (connection: Omit<DrasiConnection, 'id' | 'createdAt'>) => DrasiConnection
  onUpdateConnection: (id: string, patch: Partial<Omit<DrasiConnection, 'id' | 'createdAt'>>) => void
  onRequestRemoveConnection: (id: string, name: string) => void
  onCloseConnectionsModal: () => void
  expandedNode: ExpandedNodeDetails | null
  onCloseExpandedNode: () => void
  configuringSource: DrasiSource | 'new' | null
  onSaveSourceConfig: (config: SourceConfig) => void
  onCloseSourceConfig: () => void
  configuringQuery: DrasiQuery | 'new' | null
  onSaveQueryConfig: (config: QueryConfig) => void
  onCloseQueryConfig: () => void
  pendingConfirm: { title: string; message: string; onConfirm: () => void } | null
  onConfirmPending: () => void
  onClosePendingConfirm: () => void
}

export function DrasiOverlays({
  selectedRow,
  onCloseSelectedRow,
  showStreamSamples,
  streamEndpoint,
  isDemoData,
  onCloseStreamSamples,
  showConnectionsModal,
  connections,
  activeConnectionId,
  onSelectConnection,
  onAddConnection,
  onUpdateConnection,
  onRequestRemoveConnection,
  onCloseConnectionsModal,
  expandedNode,
  onCloseExpandedNode,
  configuringSource,
  onSaveSourceConfig,
  onCloseSourceConfig,
  configuringQuery,
  onSaveQueryConfig,
  onCloseQueryConfig,
  pendingConfirm,
  onConfirmPending,
  onClosePendingConfirm,
}: DrasiOverlaysProps) {
  const { t } = useTranslation()

  return (
    <>
      <AnimatePresence>
        {selectedRow && <RowDetailDrawer row={selectedRow} onClose={onCloseSelectedRow} />}
        {showStreamSamples && (
          <StreamSampleDrawer
            endpoint={streamEndpoint}
            isDemoData={isDemoData}
            onClose={onCloseStreamSamples}
          />
        )}
        {showConnectionsModal && (
          <ConnectionsModal
            connections={connections}
            activeId={activeConnectionId}
            onSelect={id => { onSelectConnection(id); onCloseConnectionsModal() }}
            onAdd={onAddConnection}
            onUpdate={onUpdateConnection}
            onRequestRemove={onRequestRemoveConnection}
            onClose={onCloseConnectionsModal}
          />
        )}
        {expandedNode && <ExpandModal node={expandedNode} onClose={onCloseExpandedNode} />}
        {configuringSource && (
          <SourceConfigModal
            source={configuringSource === 'new' ? null : configuringSource}
            onSave={onSaveSourceConfig}
            onClose={onCloseSourceConfig}
          />
        )}
        {configuringQuery && (
          <QueryConfigModal
            query={configuringQuery === 'new' ? null : configuringQuery}
            onSave={onSaveQueryConfig}
            onClose={onCloseQueryConfig}
          />
        )}
      </AnimatePresence>
      <ConfirmDialog
        isOpen={pendingConfirm !== null}
        title={pendingConfirm?.title ?? ''}
        message={pendingConfirm?.message ?? ''}
        confirmLabel={t('actions.delete')}
        variant="danger"
        onConfirm={onConfirmPending}
        onClose={onClosePendingConfirm}
      />
    </>
  )
}
