import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ImportErrorList, ImportPreviewTable, ImportSinglePreview } from './WorkloadImportShared'
import type { ParsedResource } from './workloadImportDialog.utils'

const resource: ParsedResource = {
  kind: 'Deployment',
  name: 'web',
  namespace: 'default',
  image: 'nginx:1.25',
}

describe('ImportErrorList', () => {
  it('renders nothing when there are no errors', () => {
    const { container } = render(<ImportErrorList errors={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders every error message', () => {
    render(<ImportErrorList errors={['bad yaml', 'missing kind']} />)
    expect(screen.getByText('bad yaml')).toBeInTheDocument()
    expect(screen.getByText('missing kind')).toBeInTheDocument()
  })
})

describe('ImportPreviewTable', () => {
  it('renders nothing when there are no resources', () => {
    const { container } = render(<ImportPreviewTable resources={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a row per resource with kind/name/namespace/image', () => {
    render(<ImportPreviewTable resources={[resource]} />)
    expect(screen.getByText('Deployment')).toBeInTheDocument()
    expect(screen.getByText('web')).toBeInTheDocument()
    expect(screen.getByText('default')).toBeInTheDocument()
    expect(screen.getByText('nginx:1.25')).toBeInTheDocument()
  })

  it('renders one row for each of several resources', () => {
    const second: ParsedResource = { ...resource, name: 'worker', kind: 'Job' }
    render(<ImportPreviewTable resources={[resource, second]} />)
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 data rows
  })
})

describe('ImportSinglePreview', () => {
  it('renders nothing when resource is null', () => {
    const { container } = render(<ImportSinglePreview resource={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('delegates to ImportPreviewTable with a single-item list', () => {
    render(<ImportSinglePreview resource={resource} />)
    expect(screen.getByText('Deployment')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(2) // header + 1 data row
  })
})
