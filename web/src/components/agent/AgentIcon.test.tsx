import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AgentIcon, AgentBadge } from './AgentIcon'

describe('AgentIcon Component', () => {
  it('renders anthropic icon', () => {
    const { container } = render(<AgentIcon provider="anthropic" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders openai icon', () => {
    const { container } = render(<AgentIcon provider="openai" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders google icon', () => {
    const { container } = render(<AgentIcon provider="google" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders bob icon', () => {
    const { container } = render(<AgentIcon provider="bob" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders anthropic-local icon', () => {
    const { container } = render(<AgentIcon provider="anthropic-local" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('renders default icon for unknown provider', () => {
    const { container } = render(<AgentIcon provider="unknown" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(<AgentIcon provider="anthropic" className="custom-class" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg).toHaveClass('custom-class')
  })
})

describe('AgentBadge Component', () => {
  it('renders with icon and name', () => {
    const { container, getByText } = render(
      <AgentBadge provider="anthropic" name="Claude" />
    )
    expect(container.querySelector('svg')).toBeTruthy()
    expect(getByText('Claude')).toBeTruthy()
  })

  it('applies custom className', () => {
    const { container } = render(
      <AgentBadge provider="openai" name="GPT-4" className="custom-badge" />
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('custom-badge')
  })
})
