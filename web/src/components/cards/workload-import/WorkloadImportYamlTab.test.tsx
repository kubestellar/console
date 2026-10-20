import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkloadImportYamlTab } from './WorkloadImportYamlTab'
import type { ParsedResource } from './workloadImportDialog.utils'

const baseProps = {
  text: '',
  preview: [] as ParsedResource[],
  errors: [] as string[],
  importSuccess: false,
  isDemoData: false,
  isLoading: false,
  onChange: vi.fn(),
  onPreview: vi.fn(),
  onImport: vi.fn(),
  onFileUpload: vi.fn(),
}

describe('WorkloadImportYamlTab', () => {
  it('disables preview and import buttons when the textarea is empty', () => {
    render(<WorkloadImportYamlTab {...baseProps} />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
  })

  it('enables preview and import once text is present', () => {
    render(<WorkloadImportYamlTab {...baseProps} text="kind: Deployment" />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeEnabled()
  })

  it('disables import (but not preview) when import already succeeded, is demo data, or is loading', () => {
    const { rerender } = render(
      <WorkloadImportYamlTab {...baseProps} text="kind: Deployment" importSuccess />,
    )
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeEnabled()

    rerender(<WorkloadImportYamlTab {...baseProps} text="kind: Deployment" isDemoData />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportYamlTab {...baseProps} text="kind: Deployment" isLoading />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
  })

  it('calls onChange when the textarea value changes', () => {
    const onChange = vi.fn()
    render(<WorkloadImportYamlTab {...baseProps} onChange={onChange} />)
    fireEvent.change(screen.getByPlaceholderText('workloadImport.yamlPlaceholder'), {
      target: { value: 'kind: Job' },
    })
    expect(onChange).toHaveBeenCalledWith('kind: Job')
  })

  it('calls onPreview and onImport when their buttons are clicked', () => {
    const onPreview = vi.fn()
    const onImport = vi.fn()
    render(
      <WorkloadImportYamlTab
        {...baseProps}
        text="kind: Deployment"
        onPreview={onPreview}
        onImport={onImport}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /workloadImport.preview/ }))
    fireEvent.click(screen.getByRole('button', { name: /workloadImport.import/ }))
    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('calls onFileUpload when a file is selected', () => {
    const onFileUpload = vi.fn()
    const { container } = render(<WorkloadImportYamlTab {...baseProps} onFileUpload={onFileUpload} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [] } })
    expect(onFileUpload).toHaveBeenCalledTimes(1)
  })

  it('renders error list and preview table passthrough', () => {
    render(
      <WorkloadImportYamlTab
        {...baseProps}
        errors={['bad yaml']}
        preview={[{ kind: 'Deployment', name: 'web', namespace: 'default', image: 'nginx' }]}
      />,
    )
    expect(screen.getByText('bad yaml')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
  })
})
