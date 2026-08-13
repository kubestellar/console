/**
 * StandaloneOrbitDialog -- Create an orbit mission without a prior install mission.
 *
 * Allows users to pick an orbit template, cadence, auto-run toggle,
 * target clusters, and per-cluster resource scope (namespaced or cluster-scoped
 * Kubernetes objects), then saves the mission to the library.
 *
 * All state and persistence logic lives in `useStandaloneOrbit.ts`.
 */

import { useTranslation } from 'react-i18next'
import { Satellite, Orbit, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { ConfirmDialog } from '../../lib/modals'
import { CADENCE_OPTIONS, type StandaloneOrbitDialogProps } from './StandaloneOrbitDialog.helpers'
import { ClusterScopeSection } from './StandaloneOrbitDialog.parts'
import { useStandaloneOrbit } from './useStandaloneOrbit'

export function StandaloneOrbitDialog({ onClose, prefill }: StandaloneOrbitDialogProps) {
  const { t } = useTranslation()
  const {
    templates,
    clusters,
    clustersLoading,
    selectedOrbit,
    setSelectedOrbit,
    cadence,
    setCadence,
    autoRun,
    setAutoRun,
    selectedClusters,
    resourceFilters,
    showClusterPicker,
    setShowClusterPicker,
    showSetupDialog,
    setShowSetupDialog,
    isCreating,
    showAllClustersConfirm,
    setShowAllClustersConfirm,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    handleScopeChange,
    handleCreate,
    handleConfirmAllClusters,
  } = useStandaloneOrbit({ onClose, prefill })

  return (
    <>
    <div
      className="fixed inset-0 z-500 flex items-center justify-center bg-black/50 backdrop-blur-xs"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <div className="w-full max-w-2xl mx-4 rounded-xl border border-purple-500/30 bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-semibold text-foreground">
              {t('orbit.standaloneTitle')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary transition-colors"
            title={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Orbit type selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              {t('orbit.standaloneSelectType')}
            </label>
            <div className="space-y-1.5">
              {templates.map(template => (
                <label
                  key={template.orbitType}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors border',
                    selectedOrbit === template.orbitType
                      ? 'bg-purple-500/10 border-purple-500/30'
                      : 'border-transparent hover:bg-secondary/50',
                  )}
                >
                  <input
                    type="radio"
                    name="orbit-type"
                    checked={selectedOrbit === template.orbitType}
                    onChange={() => setSelectedOrbit(template.orbitType)}
                    className="mt-0.5 accent-purple-500"
                  />
                  <div>
                    <div className="text-xs font-medium text-foreground">{template.title}</div>
                    <div className="text-[10px] text-muted-foreground">{template.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Cadence selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              {t('orbit.standaloneCadence')}
            </label>
            <div className="flex gap-1">
              {CADENCE_OPTIONS.map(option => (
                <button
                  key={option}
                  onClick={() => setCadence(option)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    cadence === option
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'text-muted-foreground hover:bg-secondary/50 border border-transparent',
                  )}
                >
                  {t(`orbit.cadence${option.charAt(0).toUpperCase() + option.slice(1)}` as 'orbit.cadenceDaily')}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-run toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={e => setAutoRun(e.target.checked)}
              className="accent-purple-500"
            />
            <Orbit className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">{t('orbit.autoRunDescription')}</span>
          </label>

          {/* Target clusters + per-cluster scope */}
          <div>
            <button
              onClick={() => setShowClusterPicker(!showClusterPicker)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {t('orbit.standaloneTargetClusters')}
              </span>
              {selectedClusters.size > 0 && (
                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">
                  {selectedClusters.size}
                </span>
              )}
              {showClusterPicker ? (
                <ChevronUp className="w-3 h-3 text-muted-foreground ml-auto" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
              )}
            </button>

            {showClusterPicker && (
              <div className="mt-2 space-y-1 max-h-96 overflow-y-auto rounded-lg border border-border p-2">
                {clustersLoading ? (
                  <p className="text-[10px] text-muted-foreground py-2 text-center">
                    {t('orbit.standaloneClustersLoading')}
                  </p>
                ) : clusters.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2 text-center">
                    {t('orbit.standaloneNoClusters')}
                  </p>
                ) : (
                  <>
                    <div className="flex justify-end gap-2 mb-1">
                      <button
                        onClick={selectAllClusters}
                        className="text-[10px] text-purple-400 hover:underline"
                      >
                        {t('orbit.standaloneSelectAll')}
                      </button>
                      <button
                        onClick={deselectAllClusters}
                        className="text-[10px] text-muted-foreground hover:underline"
                      >
                        {t('orbit.standaloneDeselectAll')}
                      </button>
                    </div>
                    {clusters.map(c => (
                      <div key={c.name}>
                        <label
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                            selectedClusters.has(c.name)
                              ? 'bg-purple-500/10'
                              : 'hover:bg-secondary/50',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedClusters.has(c.name)}
                            onChange={() => toggleCluster(c.name)}
                            className="accent-purple-500"
                          />
                          <span className="text-xs text-foreground truncate">{c.name}</span>
                          <span className={cn(
                            'ml-auto text-[10px] shrink-0',
                            c.healthy ? 'text-status-success' : 'text-status-error',
                          )}>
                            {c.healthy ? 'Healthy' : 'Unhealthy'}
                          </span>
                        </label>

                        {/* Per-cluster resource scope — only when cluster is selected */}
                        {selectedClusters.has(c.name) && (
                          <ClusterScopeSection
                            clusterName={c.name}
                            value={resourceFilters[c.name] ?? []}
                            onChange={handleScopeChange}
                          />
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedOrbit || isCreating}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors',
              selectedOrbit
                ? isCreating
                  ? 'bg-purple-500 text-white cursor-not-allowed'
                  : 'bg-purple-500 text-white hover:bg-purple-600'
                : 'bg-secondary text-muted-foreground cursor-not-allowed',
            )}
          >
            {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
            {t('orbit.standaloneCreate')}
          </button>
        </div>
      </div>
    </div>
    {showSetupDialog && (
      <SetupInstructionsDialog isOpen={showSetupDialog} onClose={() => setShowSetupDialog(false)} />
    )}
    {/* Issue 9373: Empty cluster selection fallback confirmation. */}
    <ConfirmDialog
      isOpen={showAllClustersConfirm}
      onClose={() => setShowAllClustersConfirm(false)}
      onConfirm={handleConfirmAllClusters}
      title={t('orbit.confirmAllClustersTitle')}
      message={t('orbit.confirmAllClustersMessage', { count: clusters.length })}
      confirmLabel={t('orbit.confirmAllClustersContinue')}
      cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
      variant="warning"
      isLoading={isCreating}
    />
    </>
  )
}
