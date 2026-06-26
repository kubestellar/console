import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ComparisonTable, type ComparisonRow } from '../ComparisonTable'

const ROWS: ComparisonRow[] = [
  { feature: 'Multi-cluster', competitor: false, console: true },
  { feature: 'License', competitor: 'Proprietary', console: 'Apache 2.0' },
  { feature: 'Plugin system', competitor: true, console: true, consoleNote: 'cards' },
]

describe('ComparisonTable', () => {
  it('renders all feature rows', () => {
    render(
      <ComparisonTable
        rows={ROWS}
        competitorName="Lens"
        accentColor="purple"
      />,
    )
    expect(screen.getByText('Multi-cluster')).toBeTruthy()
    expect(screen.getByText('License')).toBeTruthy()
    expect(screen.getByText('Plugin system')).toBeTruthy()
  })

  it('renders competitor name in header', () => {
    render(
      <ComparisonTable
        rows={ROWS}
        competitorName="Lens"
        accentColor="purple"
      />,
    )
    expect(screen.getByText('Lens')).toBeTruthy()
    expect(screen.getByText('KubeStellar Console')).toBeTruthy()
  })

  it('uses default title', () => {
    render(
      <ComparisonTable rows={ROWS} competitorName="Lens" accentColor="purple" />,
    )
    expect(screen.getByText('Side-by-side comparison')).toBeTruthy()
  })

  it('accepts custom title and subtitle', () => {
    render(
      <ComparisonTable
        rows={ROWS}
        competitorName="Lens"
        accentColor="purple"
        title="Custom Title"
        subtitle="Custom subtitle text"
      />,
    )
    expect(screen.getByText('Custom Title')).toBeTruthy()
    expect(screen.getByText('Custom subtitle text')).toBeTruthy()
  })

  it('renders competitor subtitle when provided', () => {
    render(
      <ComparisonTable
        rows={ROWS}
        competitorName="Lens"
        competitorSubtitle="v2024"
        accentColor="purple"
      />,
    )
    expect(screen.getByText('v2024')).toBeTruthy()
  })

  it('renders boolean cells with sr-only labels', () => {
    const { container } = render(
      <ComparisonTable rows={ROWS} competitorName="Lens" accentColor="purple" />,
    )
    const srLabels = container.querySelectorAll('.sr-only')
    expect(srLabels.length).toBeGreaterThan(0)
  })

  it('renders string cell values', () => {
    render(
      <ComparisonTable rows={ROWS} competitorName="Lens" accentColor="purple" />,
    )
    expect(screen.getByText('Proprietary')).toBeTruthy()
    expect(screen.getByText('Apache 2.0')).toBeTruthy()
  })

  it('renders notes when present', () => {
    render(
      <ComparisonTable rows={ROWS} competitorName="Lens" accentColor="purple" />,
    )
    expect(screen.getByText('cards')).toBeTruthy()
  })

  it('renders holmes variant without crashing', () => {
    const { container } = render(
      <ComparisonTable
        rows={ROWS}
        competitorName="HolmesGPT"
        accentColor="teal"
        variant="holmes"
      />,
    )
    expect(container.querySelector('table')).toBeTruthy()
  })

  it('uses teal accent highlight style', () => {
    const { container } = render(
      <ComparisonTable
        rows={[{ feature: 'AI', competitor: 'Basic', console: 'Advanced' }]}
        competitorName="Other"
        accentColor="teal"
      />,
    )
    expect(container.querySelector('.text-teal-400')).toBeTruthy()
  })

  it('uses green highlight style for purple accent', () => {
    const { container } = render(
      <ComparisonTable
        rows={[{ feature: 'AI', competitor: 'No', console: 'Yes' }]}
        competitorName="Other"
        accentColor="purple"
      />,
    )
    expect(container.querySelector('.text-green-400')).toBeTruthy()
  })

  it('renders empty rows array without error', () => {
    const { container } = render(
      <ComparisonTable rows={[]} competitorName="Lens" accentColor="purple" />,
    )
    expect(container.querySelector('table')).toBeTruthy()
  })
})
