import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnstructuredFilePreview } from './UnstructuredFilePreview'
import type { UnstructuredPreview } from '../../lib/missions/fileParser'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'layout.missionSidebar.kubaraBadge': 'Kubara Chart',
        'layout.missionSidebar.useInMissionControl': 'Use in Mission Control',
        'layout.missionSidebar.useInMissionControlDescription': 'Add this chart to Mission Control',
      }
      return map[key] ?? key
    },
  }),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(() => Promise.resolve(true)),
}))

const mockPreview: UnstructuredPreview = {
  totalLines: 100,
  detectedApiGroups: [],
  detectedSections: ['Installation', 'Configuration'],
  detectedCommands: ['kubectl apply -f manifest.yaml'],
  detectedYamlBlocks: 2,
  detectedTitle: 'Deploy Application',
}

describe('UnstructuredFilePreview', () => {
  it('renders the file name', () => {
    render(
      <UnstructuredFilePreview
        content="test: value"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText('test.yaml')).toBeInTheDocument()
  })

  it('renders the format and line count', () => {
    render(
      <UnstructuredFilePreview
        content="test: value"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText(/YAML file/)).toBeInTheDocument()
    expect(screen.getByText(/100 lines/)).toBeInTheDocument()
  })

  it('renders content analysis section', () => {
    render(
      <UnstructuredFilePreview
        content="test: value"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText('Content Analysis')).toBeInTheDocument()
    expect(screen.getByText(/2 section\(s\)/)).toBeInTheDocument()
    expect(screen.getByText(/1 command\(s\)/)).toBeInTheDocument()
  })

  it('renders the import as mission button', () => {
    render(
      <UnstructuredFilePreview
        content="test: value"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText('Import as Mission')).toBeInTheDocument()
  })

  it('renders the copy button', () => {
    render(
      <UnstructuredFilePreview
        content="test: value"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText('Copy')).toBeInTheDocument()
  })

  it('renders raw content preview', () => {
    render(
      <UnstructuredFilePreview
        content="test: value\nfoo: bar"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={vi.fn()}
      />
    )
    expect(screen.getByText(/test: value/)).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    render(
      <UnstructuredFilePreview
        content="test: value"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={onBack}
      />
    )
    screen.getByTitle('Back').click()
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('renders Kubara CTA when chart name is provided', () => {
    render(
      <UnstructuredFilePreview
        content="test: value"
        format="yaml"
        preview={mockPreview}
        detectedProjects={[]}
        fileName="test.yaml"
        onConvert={vi.fn()}
        onBack={vi.fn()}
        kubaraChartName="my-chart"
        onUseInMissionControl={vi.fn()}
      />
    )
    expect(screen.getByText(/my-chart/)).toBeInTheDocument()
    expect(screen.getByText('Use in Mission Control')).toBeInTheDocument()
  })
})
