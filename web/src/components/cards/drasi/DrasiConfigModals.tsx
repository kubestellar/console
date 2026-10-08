/**
 * Create / edit modals for Drasi Sources and ContinuousQueries.
 *
 * Exports:
 *   SourceConfigModal — create / edit a Drasi Source
 *   QueryConfigModal  — create / edit a Drasi ContinuousQuery
 */
import { useState } from 'react'
import { X, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { dump } from 'js-yaml'
import { StreamLanguage } from '@codemirror/language'
import { cypher } from '@codemirror/legacy-modes/mode/cypher'
import { oneDark } from '@codemirror/theme-one-dark'
import { LazyCodeMirror } from './LazyCodeMirror'
import { ModalShell } from './DrasiModalShell'
import { downloadText } from '../../../lib/download'
import type { DrasiSource, DrasiQuery, SourceConfig, QueryConfig, SourceKind } from './DrasiTypes'
import { CODEMIRROR_EDITOR_HEIGHT_PX } from './DrasiConstants'

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
    downloadText(`${source.name}.yaml`, dump(doc), 'text/yaml')
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
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.sourceTypeLabel')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
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
    downloadText(`${query.name}.yaml`, dump(doc), 'text/yaml')
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
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.nameLabel')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          />
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryTypeLabel')}</label>
          {/* eslint-disable-next-line no-restricted-syntax -- moved verbatim from DrasiModals.tsx */}
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded text-white focus:border-cyan-500 focus:outline-hidden"
          >
            {QUERY_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{t('drasi.queryLabel')}</label>
          <div className="rounded border border-slate-700 overflow-hidden text-xs">
            <LazyCodeMirror
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
