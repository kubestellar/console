import { ChevronDown, ChevronUp, Loader2, Copy, Check, Pencil, Trash2, Plus, Save, X } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { Button } from '../../../ui/Button'
import { useTranslation } from 'react-i18next'

export interface PodLabelsTabProps {
  labels: Record<string, string> | null
  annotations: Record<string, string> | null
  describeLoading: boolean
  agentConnected: boolean
  copiedField: string | null
  // Label editing state
  showAllLabels: boolean
  setShowAllLabels: (v: boolean) => void
  editingLabels: boolean
  setEditingLabels: (v: boolean) => void
  pendingLabelChanges: Record<string, string | null>
  newLabelKey: string
  setNewLabelKey: (v: string) => void
  newLabelValue: string
  setNewLabelValue: (v: string) => void
  labelSaving: boolean
  labelError: string | null
  handleLabelChange: (key: string, value: string) => void
  handleLabelRemove: (key: string) => void
  undoLabelChange: (key: string) => void
  saveLabels: () => void
  cancelLabelEdit: () => void
  // Annotation editing state
  showAllAnnotations: boolean
  setShowAllAnnotations: (v: boolean) => void
  editingAnnotations: boolean
  setEditingAnnotations: (v: boolean) => void
  pendingAnnotationChanges: Record<string, string | null>
  newAnnotationKey: string
  setNewAnnotationKey: (v: string) => void
  newAnnotationValue: string
  setNewAnnotationValue: (v: string) => void
  annotationSaving: boolean
  annotationError: string | null
  handleAnnotationChange: (key: string, value: string) => void
  handleAnnotationRemove: (key: string) => void
  undoAnnotationChange: (key: string) => void
  saveAnnotations: () => void
  cancelAnnotationEdit: () => void
  handleCopy: (field: string, value: string) => void
}

export function PodLabelsTab({
  labels,
  annotations,
  describeLoading,
  agentConnected,
  copiedField,
  showAllLabels,
  setShowAllLabels,
  editingLabels,
  setEditingLabels,
  pendingLabelChanges,
  newLabelKey,
  setNewLabelKey,
  newLabelValue,
  setNewLabelValue,
  labelSaving,
  labelError,
  handleLabelChange,
  handleLabelRemove,
  undoLabelChange,
  saveLabels,
  cancelLabelEdit,
  showAllAnnotations,
  setShowAllAnnotations,
  editingAnnotations,
  setEditingAnnotations,
  pendingAnnotationChanges,
  newAnnotationKey,
  setNewAnnotationKey,
  newAnnotationValue,
  setNewAnnotationValue,
  annotationSaving,
  annotationError,
  handleAnnotationChange,
  handleAnnotationRemove,
  undoAnnotationChange,
  saveAnnotations,
  cancelAnnotationEdit,
  handleCopy,
}: PodLabelsTabProps) {
  const { t } = useTranslation()

  const labelEntries = Object.entries(labels || {})
  const annotationEntries = Object.entries(annotations || {})
  const displayedLabels = showAllLabels ? labelEntries : labelEntries.slice(0, 10)
  const displayedAnnotations = showAllAnnotations ? annotationEntries : annotationEntries.slice(0, 5)

  return (
    <div className="space-y-6">
      {describeLoading && !labels && !annotations ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">{t('drilldown.status.loadingLabels')}</span>
        </div>
      ) : (
        <>
          {/* Labels */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">
                Labels ({labelEntries.length})
              </h3>
              <div className="flex items-center gap-2">
                {labelEntries.length > 10 && !editingLabels && (
                  <button
                    onClick={() => setShowAllLabels(!showAllLabels)}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    {showAllLabels ? (
                      <>{t('drilldown.actions.showLess')} <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>{t('drilldown.actions.showAll')} <ChevronDown className="w-3 h-3" /></>
                    )}
                  </button>
                )}
                {agentConnected && !editingLabels && (
                  <button
                    onClick={() => { setEditingLabels(true); setShowAllLabels(true) }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 font-medium"
                  >
                    <Pencil className="w-3 h-3" />
                    {t('drilldown.actions.editLabels')}
                  </button>
                )}
              </div>
            </div>

            {/* Error message */}
            {labelError && (
              <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {labelError}
              </div>
            )}

            {editingLabels ? (
              <div className="space-y-3">
                {/* Existing labels - editable */}
                <div className="space-y-2">
                  {labelEntries.map(([key, value]) => {
                    const isRemoved = pendingLabelChanges[key] === null
                    const currentValue = pendingLabelChanges[key] !== undefined && pendingLabelChanges[key] !== null
                      ? pendingLabelChanges[key]
                      : value
                    const isModified = pendingLabelChanges[key] !== undefined

                    return (
                      <div
                        key={key}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg border',
                          isRemoved ? 'bg-red-500/10 border-red-500/20 opacity-50' : 'bg-card/50 border-border'
                        )}
                      >
                        <span className="text-xs text-primary font-mono shrink-0">{key}</span>
                        <span className="text-muted-foreground">=</span>
                        {isRemoved ? (
                          <span className="text-xs text-red-400 line-through flex-1">{value}</span>
                        ) : (
                          <input
                            type="text"
                            value={currentValue || ''}
                            onChange={(e) => handleLabelChange(key, e.target.value)}
                            className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground min-w-0"
                          />
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          {isModified && (
                            <button
                              onClick={() => undoLabelChange(key)}
                              className="p-1 rounded hover:bg-secondary/50 text-yellow-400"
                              title={t('drilldown.tooltips.undoChange')}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                          {!isRemoved && (
                            <button
                              onClick={() => handleLabelRemove(key)}
                              className="p-1 rounded hover:bg-red-500/20 text-red-400"
                              title={t('drilldown.tooltips.removeLabel')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add new label */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <Plus className="w-4 h-4 text-green-400 shrink-0" />
                  <input
                    type="text"
                    placeholder={t('common.key')}
                    value={newLabelKey}
                    onChange={(e) => setNewLabelKey(e.target.value)}
                    className="w-32 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground"
                  />
                  <span className="text-muted-foreground">=</span>
                  <input
                    type="text"
                    placeholder={t('common.value')}
                    value={newLabelValue}
                    onChange={(e) => setNewLabelValue(e.target.value)}
                    className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground min-w-0"
                  />
                </div>

                {/* Save/Cancel buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={saveLabels}
                    disabled={labelSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {labelSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {t('drilldown.actions.saveChanges')}
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={cancelLabelEdit}
                    disabled={labelSaving}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : labelEntries.length > 0 ? (
              <div className="space-y-2">
                {displayedLabels.map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-card/50 border border-border">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-primary font-mono">{key}</span>
                      <span className="text-muted-foreground mx-1">=</span>
                      <span className="text-xs text-foreground font-mono break-all">{value}</span>
                    </div>
                    <button
                      onClick={() => handleCopy(`label-${key}`, `${key}=${value}`)}
                      className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground shrink-0 ml-2"
                    >
                      {copiedField === `label-${key}` ? (
                        <Check className="w-3 h-3 text-green-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-card/50 border border-border text-muted-foreground text-center">
                {t('drilldown.empty.noLabels')}
                {agentConnected && (
                  <button
                    onClick={() => setEditingLabels(true)}
                    className="block mx-auto mt-2 text-xs text-primary hover:text-primary/80"
                  >
                    {t('drilldown.actions.addLabels')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Annotations */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-foreground">
                Annotations ({annotationEntries.length})
              </h3>
              <div className="flex items-center gap-2">
                {annotationEntries.length > 5 && !editingAnnotations && (
                  <button
                    onClick={() => setShowAllAnnotations(!showAllAnnotations)}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    {showAllAnnotations ? (
                      <>{t('drilldown.actions.showLess')} <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>{t('drilldown.actions.showAll')} <ChevronDown className="w-3 h-3" /></>
                    )}
                  </button>
                )}
                {agentConnected && !editingAnnotations && (
                  <button
                    onClick={() => { setEditingAnnotations(true); setShowAllAnnotations(true) }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 font-medium"
                  >
                    <Pencil className="w-3 h-3" />
                    {t('drilldown.actions.editAnnotations')}
                  </button>
                )}
              </div>
            </div>

            {/* Error message */}
            {annotationError && (
              <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                {annotationError}
              </div>
            )}

            {editingAnnotations ? (
              <div className="space-y-3">
                {/* Existing annotations - editable */}
                <div className="space-y-2">
                  {annotationEntries.map(([key, value]) => {
                    const isRemoved = pendingAnnotationChanges[key] === null
                    const currentValue = pendingAnnotationChanges[key] !== undefined && pendingAnnotationChanges[key] !== null
                      ? pendingAnnotationChanges[key]
                      : value
                    const isModified = pendingAnnotationChanges[key] !== undefined

                    return (
                      <div
                        key={key}
                        className={cn(
                          'p-2 rounded-lg border',
                          isRemoved ? 'bg-red-500/10 border-red-500/20 opacity-50' : 'bg-card/50 border-border'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-primary font-mono truncate">{key}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isModified && (
                              <button
                                onClick={() => undoAnnotationChange(key)}
                                className="p-1 rounded hover:bg-secondary/50 text-yellow-400"
                                title={t('drilldown.tooltips.undoChange')}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                            {!isRemoved && (
                              <button
                                onClick={() => handleAnnotationRemove(key)}
                                className="p-1 rounded hover:bg-red-500/20 text-red-400"
                                title={t('drilldown.tooltips.removeAnnotation')}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {isRemoved ? (
                          <span className="text-xs text-red-400 line-through font-mono break-all">{value}</span>
                        ) : (
                          <textarea
                            value={currentValue || ''}
                            onChange={(e) => handleAnnotationChange(key, e.target.value)}
                            rows={2}
                            className="w-full text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground resize-y"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Add new annotation */}
                <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Plus className="w-4 h-4 text-green-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="annotation-key"
                      value={newAnnotationKey}
                      onChange={(e) => setNewAnnotationKey(e.target.value)}
                      className="flex-1 text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground"
                    />
                  </div>
                  <textarea
                    placeholder="annotation value"
                    value={newAnnotationValue}
                    onChange={(e) => setNewAnnotationValue(e.target.value)}
                    rows={2}
                    className="w-full text-xs font-mono bg-secondary/50 border border-border rounded px-2 py-1 text-foreground resize-y"
                  />
                </div>

                {/* Save/Cancel buttons */}
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={saveAnnotations}
                    disabled={annotationSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                  >
                    {annotationSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {t('drilldown.actions.saveChanges')}
                  </button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={cancelAnnotationEdit}
                    disabled={annotationSaving}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : annotationEntries.length > 0 ? (
              <div className="space-y-2">
                {displayedAnnotations.map(([key, value]) => (
                  <div key={key} className="p-2 rounded-lg bg-card/50 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-primary font-mono truncate">{key}</span>
                      <button
                        onClick={() => handleCopy(`annot-${key}`, value)}
                        className="p-1 rounded hover:bg-secondary/50 text-muted-foreground hover:text-foreground shrink-0"
                      >
                        {copiedField === `annot-${key}` ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-foreground font-mono break-all">{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-card/50 border border-border text-muted-foreground text-center">
                {t('drilldown.empty.noAnnotations')}
                {agentConnected && (
                  <button
                    onClick={() => setEditingAnnotations(true)}
                    className="block mx-auto mt-2 text-xs text-primary hover:text-primary/80"
                  >
                    {t('drilldown.actions.addAnnotations')}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
