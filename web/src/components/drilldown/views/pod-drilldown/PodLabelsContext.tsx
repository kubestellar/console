import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { KeyValueDiffEntry } from './helpers'

export interface PodLabelsContextValue {
  describeLoading: boolean
  agentConnected: boolean
  copiedField: string | null
  showAllLabels: boolean
  setShowAllLabels: (value: boolean) => void
  editingLabels: boolean
  setEditingLabels: (value: boolean) => void
  pendingLabelChanges: Record<string, string | null>
  newLabelKey: string
  setNewLabelKey: (value: string) => void
  newLabelValue: string
  setNewLabelValue: (value: string) => void
  labelSaving: boolean
  labelError: string | null
  handleLabelChange: (key: string, value: string) => void
  handleLabelRemove: (key: string) => void
  undoLabelChange: (key: string) => void
  saveLabels: () => void
  cancelLabelEdit: () => void
  showAllAnnotations: boolean
  setShowAllAnnotations: (value: boolean) => void
  editingAnnotations: boolean
  setEditingAnnotations: (value: boolean) => void
  pendingAnnotationChanges: Record<string, string | null>
  newAnnotationKey: string
  setNewAnnotationKey: (value: string) => void
  newAnnotationValue: string
  setNewAnnotationValue: (value: string) => void
  annotationSaving: boolean
  annotationError: string | null
  handleAnnotationChange: (key: string, value: string) => void
  handleAnnotationRemove: (key: string) => void
  undoAnnotationChange: (key: string) => void
  saveAnnotations: () => void
  cancelAnnotationEdit: () => void
  handleCopy: (field: string, value: string) => void
  labelDiffByKey?: Record<string, KeyValueDiffEntry>
  annotationDiffByKey?: Record<string, KeyValueDiffEntry>
}

const PodLabelsContext = createContext<PodLabelsContextValue | null>(null)

interface PodLabelsProviderProps extends PodLabelsContextValue {
  children: ReactNode
}

export function PodLabelsProvider({ children, ...value }: PodLabelsProviderProps) {
  return (
    <PodLabelsContext.Provider value={value}>
      {children}
    </PodLabelsContext.Provider>
  )
}

export function usePodLabelsContext(): PodLabelsContextValue {
  const context = useContext(PodLabelsContext)
  if (!context) {
    throw new Error('usePodLabelsContext must be used within a PodLabelsProvider')
  }
  return context
}
