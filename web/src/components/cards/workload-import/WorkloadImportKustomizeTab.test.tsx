import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkloadImportKustomizeTab } from './WorkloadImportKustomizeTab'
import type { ParsedResource } from './workloadImportDialog.utils'

const baseProps = {
  url: '',
  setUrl: vi.fn(),
  preview: null as ParsedResource | null,
  errors: [] as string[],
  importSuccess: false,
  isDemoData: false,
  isLoading: false,
  onFieldChange: vi.fn(),
  onPreview: vi.fn(),
  onImport: vi.fn(),
}

describe('WorkloadImportKustomizeTab', () => {
  it('disables preview and import when the URL is empty', () => {
    render(<WorkloadImportKustomizeTab {...baseProps} />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
  })

  it('enables preview and import once a URL is present', () => {
    render(<WorkloadImportKustomizeTab {...baseProps} url="https://github.com/org/repo/overlays/prod" />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeEnabled()
  })

  it('disables import (but not preview) when already succeeded, demo data, or loading', () => {
    const { rerender } = render(
      <WorkloadImportKustomizeTab {...baseProps} url="https://github.com/org/repo" importSuccess />,
    )
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportKustomizeTab {...baseProps} url="https://github.com/org/repo" isDemoData />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportKustomizeTab {...baseProps} url="https://github.com/org/repo" isLoading />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
  })

  it('calls setUrl and onFieldChange when the URL input changes', () => {
    const setUrl = vi.fn()
    const onFieldChange = vi.fn()
    render(<WorkloadImportKustomizeTab {...baseProps} setUrl={setUrl} onFieldChange={onFieldChange} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/org/repo/tree/main/overlays/prod'), {
      target: { value: 'https://github.com/org/repo/overlays/staging' },
    })
    expect(setUrl).toHaveBeenCalledWith('https://github.com/org/repo/overlays/staging')
    expect(onFieldChange).toHaveBeenCalledTimes(1)
  })

  it('calls onPreview and onImport when their buttons are clicked', () => {
    const onPreview = vi.fn()
    const onImport = vi.fn()
    render(
      <WorkloadImportKustomizeTab
        {...baseProps}
        url="https://github.com/org/repo/overlays/prod"
        onPreview={onPreview}
        onImport={onImport}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /workloadImport.preview/ }))
    expect(onPreview).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /workloadImport.import/ }))
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('renders errors and preview when provided', () => {
    render(
      <WorkloadImportKustomizeTab
        {...baseProps}
        errors={['bad url']}
        preview={{ kind: 'Deployment', name: 'prod-kustomize', namespace: 'default', image: 'kustomize:...' }}
      />,
    )
    expect(screen.getByText('bad url')).toBeInTheDocument()
    expect(screen.getByText('prod-kustomize')).toBeInTheDocument()
  })
})
