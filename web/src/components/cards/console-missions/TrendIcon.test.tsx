import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrendIcon } from './TrendIcon'

describe('TrendIcon', () => {
  it('renders the stable (Minus) icon when trend is undefined', () => {
    render(<TrendIcon />)
    const wrapper = screen.getByTitle('Stable')
    expect(wrapper).toBeInTheDocument()
    // lucide-react icons render as <svg> elements
    expect(wrapper.querySelector('svg')).toBeInTheDocument()
  })

  it('renders the stable (Minus) icon when trend is "stable"', () => {
    render(<TrendIcon trend="stable" />)
    expect(screen.getByTitle('Stable')).toBeInTheDocument()
  })

  it('renders the worsening (TrendingUp) icon when trend is "worsening"', () => {
    render(<TrendIcon trend="worsening" />)
    const wrapper = screen.getByTitle('Worsening')
    expect(wrapper).toBeInTheDocument()
    const svg = wrapper.querySelector('svg')
    expect(svg).toBeInTheDocument()
    // Worsening uses orange styling
    expect(svg?.getAttribute('class') ?? '').toContain('text-orange-400')
  })

  it('renders the improving (TrendingDown) icon when trend is "improving"', () => {
    render(<TrendIcon trend="improving" />)
    const wrapper = screen.getByTitle('Improving')
    expect(wrapper).toBeInTheDocument()
    const svg = wrapper.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('class') ?? '').toContain('text-green-400')
  })

  it('applies base size classes to the stable icon', () => {
    render(<TrendIcon trend="stable" />)
    const svg = screen.getByTitle('Stable').querySelector('svg')
    const cls = svg?.getAttribute('class') ?? ''
    expect(cls).toContain('w-3')
    expect(cls).toContain('h-3')
  })

  it('merges a custom className into the underlying icon', () => {
    render(<TrendIcon trend="improving" className="custom-class" />)
    const svg = screen.getByTitle('Improving').querySelector('svg')
    expect(svg?.getAttribute('class') ?? '').toContain('custom-class')
  })

  it('merges a custom className for the worsening variant too', () => {
    render(<TrendIcon trend="worsening" className="ml-2" />)
    const svg = screen.getByTitle('Worsening').querySelector('svg')
    expect(svg?.getAttribute('class') ?? '').toContain('ml-2')
  })

  it('merges a custom className for the stable variant', () => {
    render(<TrendIcon className="ml-4" />)
    const svg = screen.getByTitle('Stable').querySelector('svg')
    expect(svg?.getAttribute('class') ?? '').toContain('ml-4')
  })
})
