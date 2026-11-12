import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImageDetailsPanel } from './ImageDetailsPanel'
import type { KpackBuild, KpackImageStatus } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const builds: KpackBuild[] = [
  { metadata: { name: 'b1', creationTimestamp: '2024-01-01T00:00:00Z' }, status: { conditions: [{ type: 'Succeeded', status: 'True' }] } },
  { metadata: { name: 'b2', creationTimestamp: '2024-01-02T00:00:00Z' }, status: { conditions: [{ type: 'Succeeded', status: 'False' }] } },
  { metadata: { name: 'b3', creationTimestamp: '2024-01-03T00:00:00Z' } },
]

const imageInfo: KpackImageStatus = {
  metadata: { creationTimestamp: '2024-01-01T00:00:00Z' },
  spec: { builder: { image: 'registry.io/paketo/builder:base' } },
  status: {
    latestImage: 'registry.io/app@sha256:abc',
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'BuilderReady', status: 'False' },
      { type: 'Other', status: 'Unknown' },
    ],
  },
}

const baseProps = { name: 'my-image', status: 'succeeded' as const, builder: 'fallback/builder:1', copiedField: null, onCopy: vi.fn() }

describe('ImageDetailsPanel', () => {
  it('renders a spinner while loading', () => {
    const { container } = render(<ImageDetailsPanel {...baseProps} loading imageInfo={null} builds={[]} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('my-image')).not.toBeInTheDocument()
  })

  it('renders details, counts and conditions', () => {
    render(<ImageDetailsPanel {...baseProps} loading={false} imageInfo={imageInfo} builds={builds} />)
    expect(screen.getByText('my-image')).toBeInTheDocument()
    expect(screen.getByText('Builder: builder')).toBeInTheDocument()
    expect(screen.getByText('Status: True')).toBeInTheDocument()
    expect(screen.getByText(/Created:/)).toBeInTheDocument()
    expect(screen.getByText('Total Builds').previousSibling).toHaveTextContent('3')
    expect(screen.getByText('Successful').previousSibling).toHaveTextContent('1')
    expect(screen.getByText('BuilderReady')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('registry.io/app@sha256:abc')).toBeInTheDocument()
  })

  it('falls back to props when image info is missing and hides optional sections', () => {
    render(<ImageDetailsPanel {...baseProps} loading={false} imageInfo={null} builds={[]} />)
    expect(screen.getByText('Builder: builder')).toBeInTheDocument()
    expect(screen.getByText('Status: succeeded')).toBeInTheDocument()
    expect(screen.queryByText(/Created:/)).not.toBeInTheDocument()
    expect(screen.queryByText('Latest Image')).not.toBeInTheDocument()
    expect(screen.queryByText('BuilderReady')).not.toBeInTheDocument()
  })

  it('copies the latest image and shows copied state', async () => {
    const onCopy = vi.fn()
    const { rerender } = render(
      <ImageDetailsPanel {...baseProps} onCopy={onCopy} loading={false} imageInfo={imageInfo} builds={builds} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'actions.copy' }))
    expect(onCopy).toHaveBeenCalledWith('image', 'registry.io/app@sha256:abc')
    rerender(<ImageDetailsPanel {...baseProps} onCopy={onCopy} copiedField="image" loading={false} imageInfo={imageInfo} builds={builds} />)
    expect(screen.getByRole('button', { name: 'actions.copy' }).querySelector('.text-green-400')).toBeInTheDocument()
  })
})
