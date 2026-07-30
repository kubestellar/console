import { ChevronDown, ChevronUp, Loader2, Copy, Check, Pencil, Trash2, Plus, Save, X } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { Button } from '../../../ui/Button'
import { Input } from '../../../ui/Input'
import { TextArea } from '../../../ui/TextArea'
import { useTranslation } from 'react-i18next'
import { usePodLabelsContext } from './PodLabelsContext'

interface AnnotationsSectionProps {
  annotations: Record<string, string> | null
}

export function AnnotationsSection({ annotations }: AnnotationsSectionProps) {
  const { t } = useTranslation()
  const {
    agentConnected,
    copiedField,
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
    annotationDiffByKey,
  } = usePodLabelsContext()

  const annotationEntries = Object.entries(annotations || {})
  const displayedAnnotations = showAllAnnotations ? annotationEntries : annotationEntries.slice(0, 5)

  return (
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

      {annotationError && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {annotationError}
        </div>
      )}

      {editingAnnotations ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {annotationEntries.map(([key, value]) => {
              const diff = annotationDiffByKey?.[key] ?? {
                currentValue:
                  pendingAnnotationChanges[key] !== undefined && pendingAnnotationChanges[key] !== null
                    ? pendingAnnotationChanges[key]!
                    : value,
                isRemoved: pendingAnnotationChanges[key] === null,
                isModified: pendingAnnotationChanges[key] !== undefined,
              }
              const { currentValue, isRemoved, isModified } = diff

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
                    <TextArea
                      value={currentValue || ''}
                      onChange={(e) => handleAnnotationChange(key, e.target.value)}
                      rows={2}
                      resizable
                      textAreaSize="sm"
                      className="font-mono bg-secondary/50"
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="w-4 h-4 text-green-400 shrink-0" />
              <Input
                type="text"
                placeholder="annotation-key"
                value={newAnnotationKey}
                onChange={(e) => setNewAnnotationKey(e.target.value)}
                inputSize="sm"
                className="flex-1 font-mono bg-secondary/50"
              />
            </div>
            <TextArea
              placeholder="annotation value"
              value={newAnnotationValue}
              onChange={(e) => setNewAnnotationValue(e.target.value)}
              rows={2}
              resizable
              textAreaSize="sm"
              className="font-mono bg-secondary/50"
            />
          </div>

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
  )
}
