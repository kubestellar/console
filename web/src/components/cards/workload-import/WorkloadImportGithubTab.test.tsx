import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkloadImportGithubTab } from './WorkloadImportGithubTab'
import type { ParsedResource } from './workloadImportDialog.utils'

const baseProps = {
  url: '',
  setUrl: vi.fn(),
  path: '',
  setPath: vi.fn(),
  preview: null as ParsedResource | null,
  errors: [] as string[],
  importSuccess: false,
  isDemoData: false,
  isLoading: false,
  onFieldChange: vi.fn(),
  onPreview: vi.fn(),
  onImport: vi.fn(),
}

describe('WorkloadImportGithubTab', () => {
  it('disables preview and import when the repo URL is empty', () => {
    render(<WorkloadImportGithubTab {...baseProps} />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
  })

  it('enables preview and import once a repo URL is present', () => {
    render(<WorkloadImportGithubTab {...baseProps} url="https://github.com/org/repo" />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeEnabled()
  })

  it('disables import (but not preview) when already succeeded, demo data, or loading', () => {
    const { rerender } = render(
      <WorkloadImportGithubTab {...baseProps} url="https://github.com/org/repo" importSuccess />,
    )
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportGithubTab {...baseProps} url="https://github.com/org/repo" isDemoData />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportGithubTab {...baseProps} url="https://github.com/org/repo" isLoading />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
  })

  it('calls setUrl/setPath and onFieldChange when inputs change', () => {
    const setUrl = vi.fn()
    const setPath = vi.fn()
    const onFieldChange = vi.fn()
    render(<WorkloadImportGithubTab {...baseProps} setUrl={setUrl} setPath={setPath} onFieldChange={onFieldChange} />)

    fireEvent.change(screen.getByPlaceholderText('https://github.com/org/repo'), {
      target: { value: 'https://github.com/org/other' },
    })
    expect(setUrl).toHaveBeenCalledWith('https://github.com/org/other')

    fireEvent.change(screen.getByPlaceholderText('k8s/ or deploy/manifests/'), {
      target: { value: 'manifests/' },
    })
    expect(setPath).toHaveBeenCalledWith('manifests/')
    expect(onFieldChange).toHaveBeenCalledTimes(2)
  })

  it('calls onPreview and onImport when their buttons are clicked', () => {
    const onPreview = vi.fn()
    const onImport = vi.fn()
    render(
      <WorkloadImportGithubTab
        {...baseProps}
        url="https://github.com/org/repo"
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
      <WorkloadImportGithubTab
        {...baseProps}
        errors={['bad url']}
        preview={{ kind: 'Deployment', name: 'repo-manifests', namespace: 'default', image: 'github:...' }}
      />,
    )
    expect(screen.getByText('bad url')).toBeInTheDocument()
    expect(screen.getByText('repo-manifests')).toBeInTheDocument()
  })
})
