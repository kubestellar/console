import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePodLabelsContext } from './PodLabelsContext'
import { LabelsSection, AnnotationsSection } from './PodLabelsTab.parts'

export interface PodLabelsTabProps {
  labels: Record<string, string> | null
  annotations: Record<string, string> | null
}

export function PodLabelsTab({ labels, annotations }: PodLabelsTabProps) {
  const { t } = useTranslation()
  const {
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
    labelDiffByKey,
    annotationDiffByKey,
  } = usePodLabelsContext()

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
          <LabelsSection
            labelEntries={labelEntries}
            displayedLabels={displayedLabels}
            showAllLabels={showAllLabels}
            setShowAllLabels={setShowAllLabels}
            editingLabels={editingLabels}
            setEditingLabels={setEditingLabels}
            agentConnected={agentConnected}
            labelError={labelError}
            pendingLabelChanges={pendingLabelChanges}
            labelDiffByKey={labelDiffByKey}
            handleLabelChange={handleLabelChange}
            handleLabelRemove={handleLabelRemove}
            undoLabelChange={undoLabelChange}
            newLabelKey={newLabelKey}
            setNewLabelKey={setNewLabelKey}
            newLabelValue={newLabelValue}
            setNewLabelValue={setNewLabelValue}
            labelSaving={labelSaving}
            saveLabels={saveLabels}
            cancelLabelEdit={cancelLabelEdit}
            copiedField={copiedField}
            handleCopy={handleCopy}
          />

          <AnnotationsSection
            annotationEntries={annotationEntries}
            displayedAnnotations={displayedAnnotations}
            showAllAnnotations={showAllAnnotations}
            setShowAllAnnotations={setShowAllAnnotations}
            editingAnnotations={editingAnnotations}
            setEditingAnnotations={setEditingAnnotations}
            agentConnected={agentConnected}
            annotationError={annotationError}
            pendingAnnotationChanges={pendingAnnotationChanges}
            annotationDiffByKey={annotationDiffByKey}
            handleAnnotationChange={handleAnnotationChange}
            handleAnnotationRemove={handleAnnotationRemove}
            undoAnnotationChange={undoAnnotationChange}
            newAnnotationKey={newAnnotationKey}
            setNewAnnotationKey={setNewAnnotationKey}
            newAnnotationValue={newAnnotationValue}
            setNewAnnotationValue={setNewAnnotationValue}
            annotationSaving={annotationSaving}
            saveAnnotations={saveAnnotations}
            cancelAnnotationEdit={cancelAnnotationEdit}
            copiedField={copiedField}
            handleCopy={handleCopy}
          />
        </>
      )}
    </div>
  )
}
