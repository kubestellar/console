import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { HighlightGrid, type HighlightFeature } from '../HighlightGrid'

const HIGHLIGHTS: HighlightFeature[] = [
  { icon: <span data-testid="icon-a">A</span>, title: 'Speed', description: 'Blazing fast' },
  { icon: <span data-testid="icon-b">B</span>, title: 'Safety', description: 'Built secure' },
  { icon: <span data-testid="icon-c">C</span>, title: 'Scale', description: 'Multi-cluster' },
]

describe('HighlightGrid', () => {
  it('renders title with accent span', () => {
    render(
      <HighlightGrid
        title="Why switch to"
        titleAccent="KubeStellar"
        subtitle="A subtitle"
        highlights={HIGHLIGHTS}
        accentColor="purple"
      />,
    )
    expect(screen.getByText('KubeStellar')).toBeTruthy()
    expect(screen.getByText(/Why switch to/)).toBeTruthy()
  })

  it('renders subtitle', () => {
    render(
      <HighlightGrid
        title="T"
        titleAccent="A"
        subtitle="Sub text here"
        highlights={HIGHLIGHTS}
        accentColor="purple"
      />,
    )
    expect(screen.getByText('Sub text here')).toBeTruthy()
  })

  it('renders all highlight items', () => {
    render(
      <HighlightGrid
        title="T"
        titleAccent="A"
        subtitle="S"
        highlights={HIGHLIGHTS}
        accentColor="purple"
      />,
    )
    expect(screen.getByText('Speed')).toBeTruthy()
    expect(screen.getByText('Safety')).toBeTruthy()
    expect(screen.getByText('Scale')).toBeTruthy()
    expect(screen.getByText('Blazing fast')).toBeTruthy()
  })

  it('renders custom icons', () => {
    render(
      <HighlightGrid
        title="T"
        titleAccent="A"
        subtitle="S"
        highlights={HIGHLIGHTS}
        accentColor="purple"
      />,
    )
    expect(screen.getByTestId('icon-a')).toBeTruthy()
  })

  it('renders holmes variant', () => {
    const { container } = render(
      <HighlightGrid
        title="Features"
        titleAccent=""
        subtitle="Overview"
        highlights={HIGHLIGHTS}
        accentColor="teal"
        variant="holmes"
      />,
    )
    expect(container.querySelector('section')).toBeTruthy()
    expect(screen.getByText('Speed')).toBeTruthy()
  })

  it('applies accent color class for purple', () => {
    const { container } = render(
      <HighlightGrid
        title="T"
        titleAccent="Accent"
        subtitle="S"
        highlights={HIGHLIGHTS}
        accentColor="purple"
      />,
    )
    expect(container.querySelector('.text-purple-400')).toBeTruthy()
  })

  it('applies accent color class for teal in standard variant', () => {
    const { container } = render(
      <HighlightGrid
        title="T"
        titleAccent="Accent"
        subtitle="S"
        highlights={HIGHLIGHTS}
        accentColor="teal"
      />,
    )
    expect(container.querySelector('.text-teal-400')).toBeTruthy()
  })

  it('renders empty highlights array without error', () => {
    const { container } = render(
      <HighlightGrid
        title="T"
        titleAccent="A"
        subtitle="S"
        highlights={[]}
        accentColor="purple"
      />,
    )
    expect(container.querySelector('section')).toBeTruthy()
  })
})
