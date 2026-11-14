import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

import { BuildpackHeader } from '../BuildpackHeader'
import { BuildpackAiPanel } from '../BuildpackAiPanel'
import { ImageDetailsPanel } from '../ImageDetailsPanel'
import { BuildStepsPanel } from '../BuildStepsPanel'
import type { KpackBuild, KpackImageStatus } from '../types'

const builds: KpackBuild[] = [
  { metadata: { name: 'older', creationTimestamp: '2026-01-01T12:00:00Z' }, status: { conditions: [{ type: 'Succeeded', status: 'True', reason: 'Completed' }] } },
  { metadata: { name: 'newer', creationTimestamp: '2026-01-03T12:00:00Z' }, status: { conditions: [{ type: 'Succeeded', status: 'False', reason: 'Failed to build' }] } },
  { metadata: { name: 'middle', creationTimestamp: '2026-01-02T12:00:00Z' } },
]

describe('BuildpackHeader', () => {
  it('shows the namespace and cluster and invokes the corresponding navigation callbacks', () => {
    const onDrillNamespace = vi.fn()
    const onDrillCluster = vi.fn()
    render(<BuildpackHeader cluster="provider/cluster-a" namespace="apps" status="building" statusStyle={{ bg: 'bg-blue', text: 'text-blue', border: 'border-blue' }} onDrillNamespace={onDrillNamespace} onDrillCluster={onDrillCluster} />)

    expect(screen.getByText('BUILDING')).toHaveClass('bg-blue', 'text-blue', 'border-blue')
    fireEvent.click(screen.getByRole('button', { name: /Namespace:\s*apps/ }))
    expect(onDrillNamespace).toHaveBeenCalledOnce()
    expect(onDrillCluster).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Cluster:\s*cluster-a/ }))
    expect(onDrillCluster).toHaveBeenCalledOnce()
  })
})

describe('BuildpackAiPanel', () => {
  it('disables analysis when disconnected, then enables it when the agent connects', () => {
    const onDiagnose = vi.fn()
    const { rerender } = render(<BuildpackAiPanel isAgentConnected={false} onDiagnose={onDiagnose} />)
    const button = screen.getByRole('button', { name: 'Analyze Buildpack' })
    expect(button).toBeDisabled()
    expect(screen.getByText('AI agent not connected')).toBeInTheDocument()
    fireEvent.click(button)
    expect(onDiagnose).not.toHaveBeenCalled()

    rerender(<BuildpackAiPanel isAgentConnected onDiagnose={onDiagnose} />)
    expect(screen.queryByText('AI agent not connected')).not.toBeInTheDocument()
    expect(screen.getByText('drilldown.buildpack.availableAIActions')).toBeInTheDocument()
    expect(screen.getByText('drilldown.buildpack.buildFailureDiagnosis')).toBeInTheDocument()
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onDiagnose).toHaveBeenCalledOnce()
  })
})

describe('ImageDetailsPanel', () => {
  const imageInfo: KpackImageStatus = {
    metadata: { creationTimestamp: '2026-01-01T12:00:00Z' },
    spec: { builder: { image: 'registry.example.com/builders/paketo:latest' } },
    status: { latestImage: 'registry.example.com/app@sha256:123', conditions: [{ type: 'Ready', status: 'True' }, { type: 'Healthy', status: 'False' }] },
  }
  const props = { name: 'my-app', status: 'failed' as const, imageInfo, builds, builder: 'fallback:base', copiedField: null, onCopy: vi.fn() }

  it('shows loading instead of image details until loading completes', () => {
    const { container, rerender } = render(<ImageDetailsPanel {...props} loading />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('my-app')).not.toBeInTheDocument()
    rerender(<ImageDetailsPanel {...props} loading={false} />)
    expect(screen.getByRole('heading', { name: 'my-app' })).toBeInTheDocument()
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
  })

  it('renders image details, counts, conditions and copies the image reference', () => {
    const onCopy = vi.fn()
    render(<ImageDetailsPanel {...props} onCopy={onCopy} loading={false} />)
    expect(screen.getByText('Builder: paketo')).toBeInTheDocument()
    expect(screen.getByText('Status: True')).toBeInTheDocument()
    expect(screen.getByText(`Created: ${new Date(imageInfo.metadata!.creationTimestamp!).toLocaleString()}`)).toBeInTheDocument()
    expect(screen.getByText('Total Builds').previousElementSibling).toHaveTextContent('3')
    expect(screen.getByText('Successful').previousElementSibling).toHaveTextContent('1')
    expect(screen.getByText('Conditions', { selector: 'div' }).previousElementSibling).toHaveTextContent('2')
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('registry.example.com/app@sha256:123')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'actions.copy' }))
    expect(onCopy).toHaveBeenCalledWith('image', 'registry.example.com/app@sha256:123')
  })

  it('uses fallback values and omits unavailable image and conditions', () => {
    render(<ImageDetailsPanel {...props} loading={false} imageInfo={null} builds={[]} />)
    expect(screen.getByText('Builder: fallback')).toBeInTheDocument()
    expect(screen.getByText('Status: failed')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Latest Image' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Conditions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'actions.copy' })).not.toBeInTheDocument()
  })
})

describe('BuildStepsPanel', () => {
  it('shows loading and empty states instead of build entries', () => {
    const { container, rerender } = render(<BuildStepsPanel buildsLoading builds={builds} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByText('newer')).not.toBeInTheDocument()
    rerender(<BuildStepsPanel buildsLoading={false} builds={[]} />)
    expect(screen.getByText('drilldown.buildpack.noBuilds')).toBeInTheDocument()
    expect(screen.getByText('drilldown.buildpack.connectAgentBuilds')).toBeInTheDocument()
  })

  it('orders builds newest first and shows each reason, status and date', () => {
    const { container } = render(<BuildStepsPanel buildsLoading={false} builds={builds} />)
    const rows = Array.from(container.firstElementChild!.children) as HTMLElement[]
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('newer')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Failed to build')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Failed')).toBeInTheDocument()
    expect(within(rows[0]).getByText(new Date(builds[1].metadata.creationTimestamp).toLocaleDateString())).toBeInTheDocument()
    expect(within(rows[1]).getByText('middle')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Build triggered')).toBeInTheDocument()
    expect(within(rows[2]).getByText('older')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Success')).toBeInTheDocument()
    expect(builds.map(build => build.metadata.name)).toEqual(['older', 'newer', 'middle'])
  })
})
