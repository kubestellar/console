import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PodLabelsProvider, usePodLabelsContext, type PodLabelsContextValue } from '../PodLabelsContext'

const value: PodLabelsContextValue = { describeLoading: false, agentConnected: true, copiedField: null, showAllLabels: false, setShowAllLabels: vi.fn(), editingLabels: false, setEditingLabels: vi.fn(), pendingLabelChanges: {}, newLabelKey: '', setNewLabelKey: vi.fn(), newLabelValue: '', setNewLabelValue: vi.fn(), labelSaving: false, labelError: null, handleLabelChange: vi.fn(), handleLabelRemove: vi.fn(), undoLabelChange: vi.fn(), saveLabels: vi.fn(), cancelLabelEdit: vi.fn(), showAllAnnotations: false, setShowAllAnnotations: vi.fn(), editingAnnotations: false, setEditingAnnotations: vi.fn(), pendingAnnotationChanges: {}, newAnnotationKey: '', setNewAnnotationKey: vi.fn(), newAnnotationValue: '', setNewAnnotationValue: vi.fn(), annotationSaving: false, annotationError: null, handleAnnotationChange: vi.fn(), handleAnnotationRemove: vi.fn(), undoAnnotationChange: vi.fn(), saveAnnotations: vi.fn(), cancelAnnotationEdit: vi.fn(), handleCopy: vi.fn() }

function Consumer() {
  const context = usePodLabelsContext()
  return <span>{context.agentConnected ? 'connected' : 'disconnected'}</span>
}

describe('PodLabelsContext', () => {
  it('provides the current context value', () => {
    render(<PodLabelsProvider {...value}><Consumer /></PodLabelsProvider>)
    expect(screen.getByText('connected')).toBeInTheDocument()
  })

  it('throws without a provider', () => {
    expect(() => render(<Consumer />)).toThrow('usePodLabelsContext must be used within a PodLabelsProvider')
  })
})
