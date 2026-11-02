import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkloadImportHelmTab } from './WorkloadImportHelmTab'
import type { ParsedResource } from './workloadImportDialog.utils'

const baseProps = {
  repoUrl: '',
  setRepoUrl: vi.fn(),
  chartName: '',
  setChartName: vi.fn(),
  releaseName: '',
  setReleaseName: vi.fn(),
  namespace: 'default',
  setNamespace: vi.fn(),
  values: '',
  setValues: vi.fn(),
  preview: null as ParsedResource | null,
  errors: [] as string[],
  importSuccess: false,
  isDemoData: false,
  isLoading: false,
  onFieldChange: vi.fn(),
  onPreview: vi.fn(),
  onImport: vi.fn(),
}

describe('WorkloadImportHelmTab', () => {
  it('disables preview and import until repoUrl, chartName and releaseName are all set', () => {
    const { rerender } = render(<WorkloadImportHelmTab {...baseProps} />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportHelmTab {...baseProps} repoUrl="https://charts.example.com" chartName="chart" />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeDisabled()

    rerender(
      <WorkloadImportHelmTab
        {...baseProps}
        repoUrl="https://charts.example.com"
        chartName="chart"
        releaseName="release"
      />,
    )
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeEnabled()
  })

  it('treats whitespace-only required fields as unset', () => {
    render(<WorkloadImportHelmTab {...baseProps} repoUrl=" " chartName=" " releaseName=" " />)
    expect(screen.getByRole('button', { name: /workloadImport.preview/ })).toBeDisabled()
  })

  it('disables import (but not preview) when already succeeded, demo data, or loading', () => {
    const complete = { repoUrl: 'https://charts.example.com', chartName: 'chart', releaseName: 'release' }
    const { rerender } = render(<WorkloadImportHelmTab {...baseProps} {...complete} importSuccess />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportHelmTab {...baseProps} {...complete} isDemoData />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()

    rerender(<WorkloadImportHelmTab {...baseProps} {...complete} isLoading />)
    expect(screen.getByRole('button', { name: /workloadImport.import/ })).toBeDisabled()
  })

  it('calls the matching setter and onFieldChange for each field', () => {
    const setRepoUrl = vi.fn()
    const setChartName = vi.fn()
    const setReleaseName = vi.fn()
    const setNamespace = vi.fn()
    const setValues = vi.fn()
    const onFieldChange = vi.fn()
    render(
      <WorkloadImportHelmTab
        {...baseProps}
        setRepoUrl={setRepoUrl}
        setChartName={setChartName}
        setReleaseName={setReleaseName}
        setNamespace={setNamespace}
        setValues={setValues}
        onFieldChange={onFieldChange}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('https://charts.example.com'), { target: { value: 'repo' } })
    fireEvent.change(screen.getByPlaceholderText('my-chart'), { target: { value: 'chart' } })
    fireEvent.change(screen.getByPlaceholderText('my-release'), { target: { value: 'release' } })
    fireEvent.change(screen.getByPlaceholderText('default'), { target: { value: 'ns' } })
    fireEvent.change(screen.getByPlaceholderText('workloadImport.helmValuesPlaceholder'), {
      target: { value: 'key: value' },
    })

    expect(setRepoUrl).toHaveBeenCalledWith('repo')
    expect(setChartName).toHaveBeenCalledWith('chart')
    expect(setReleaseName).toHaveBeenCalledWith('release')
    expect(setNamespace).toHaveBeenCalledWith('ns')
    expect(setValues).toHaveBeenCalledWith('key: value')
    expect(onFieldChange).toHaveBeenCalledTimes(5)
  })

  it('calls onPreview and onImport when their buttons are clicked', () => {
    const onPreview = vi.fn()
    const onImport = vi.fn()
    render(
      <WorkloadImportHelmTab
        {...baseProps}
        repoUrl="https://charts.example.com"
        chartName="chart"
        releaseName="release"
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
      <WorkloadImportHelmTab
        {...baseProps}
        errors={['missing release name']}
        preview={{ kind: 'Deployment', name: 'my-release', namespace: 'default', image: 'chart:latest' }}
      />,
    )
    expect(screen.getByText('missing release name')).toBeInTheDocument()
    expect(screen.getByText('my-release')).toBeInTheDocument()
  })
})
