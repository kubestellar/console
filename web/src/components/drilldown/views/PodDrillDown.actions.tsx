import { type Dispatch, type SetStateAction } from 'react'
import {
  usePodDeleteRepairActions,
  usePodMetadataActions,
  usePodRelatedResources,
  type UsePodActionsProps,
} from './pod-drilldown/actions'

export function usePodActions({
  cluster,
  namespace,
  podName,
  status,
  restarts,
  issues,
  agentConnected,
  backendActionUnavailable,
  backendUnavailableMessage,
  labels,
  annotations,
  ownerChain,
  openTrackedWs,
  parseWsMessage,
}: UsePodActionsProps) {
  const deleteRepair = usePodDeleteRepairActions({
    cluster,
    namespace,
    podName,
    status,
    restarts,
    issues,
    agentConnected,
    backendActionUnavailable,
    backendUnavailableMessage,
    ownerChain,
    openTrackedWs,
    parseWsMessage,
  })

  const metadata = usePodMetadataActions({
    cluster,
    namespace,
    podName,
    agentConnected,
    labels,
    annotations,
    openTrackedWs,
    parseWsMessage,
  })

  const related = usePodRelatedResources({
    cluster,
    namespace,
    podName,
    agentConnected,
    openTrackedWs,
    parseWsMessage,
  })

  const saveLabels = async (setLabels: Dispatch<SetStateAction<Record<string, string> | null>>) => {
    await metadata.saveLabels(setLabels)
  }

  const saveAnnotations = async (setAnnotations: Dispatch<SetStateAction<Record<string, string> | null>>) => {
    await metadata.saveAnnotations(setAnnotations)
  }

  return {
    canDeletePod: deleteRepair.canDeletePod,
    deletingPod: deleteRepair.deletingPod,
    deleteError: deleteRepair.deleteError,
    showDeletePodConfirm: deleteRepair.showDeletePodConfirm,
    setShowDeletePodConfirm: deleteRepair.setShowDeletePodConfirm,
    handleDeletePod: deleteRepair.handleDeletePod,
    isManagedPod: deleteRepair.isManagedPod,
    handleRepairPod: deleteRepair.handleRepairPod,
    editingLabels: metadata.editingLabels,
    setEditingLabels: metadata.setEditingLabels,
    pendingLabelChanges: metadata.pendingLabelChanges,
    newLabelKey: metadata.newLabelKey,
    setNewLabelKey: metadata.setNewLabelKey,
    newLabelValue: metadata.newLabelValue,
    setNewLabelValue: metadata.setNewLabelValue,
    labelSaving: metadata.labelSaving,
    labelError: metadata.labelError,
    saveLabels,
    handleLabelChange: metadata.handleLabelChange,
    handleLabelRemove: metadata.handleLabelRemove,
    undoLabelChange: metadata.undoLabelChange,
    cancelLabelEdit: metadata.cancelLabelEdit,
    editingAnnotations: metadata.editingAnnotations,
    setEditingAnnotations: metadata.setEditingAnnotations,
    pendingAnnotationChanges: metadata.pendingAnnotationChanges,
    newAnnotationKey: metadata.newAnnotationKey,
    setNewAnnotationKey: metadata.setNewAnnotationKey,
    newAnnotationValue: metadata.newAnnotationValue,
    setNewAnnotationValue: metadata.setNewAnnotationValue,
    annotationSaving: metadata.annotationSaving,
    annotationError: metadata.annotationError,
    saveAnnotations,
    handleAnnotationChange: metadata.handleAnnotationChange,
    handleAnnotationRemove: metadata.handleAnnotationRemove,
    undoAnnotationChange: metadata.undoAnnotationChange,
    cancelAnnotationEdit: metadata.cancelAnnotationEdit,
    relatedResources: related.relatedResources,
    relatedLoading: related.relatedLoading,
    configMaps: related.configMaps,
    secrets: related.secrets,
    pvcs: related.pvcs,
    serviceAccount: related.serviceAccount,
    fetchRelatedResources: related.fetchRelatedResources,
  }
}
