import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HStack } from '../HStack'

describe('HStack', () => {
  it('renders children with default gap', () => {
    render(
      <HStack>
        <div>First</div>
        <div>Second</div>
      </HStack>
    )
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })

  it('applies custom gap size', () => {
    const { container } = render(
      <HStack gap="4">
        <div>Content</div>
      </HStack>
    )
    const element = container.firstChild
    expect(element).toHaveClass('gap-4')
  })

  it('supports custom justify', () => {
    const { container } = render(
      <HStack justify="between">
        <div>Content</div>
      </HStack>
    )
    const element = container.firstChild
    expect(element).toHaveClass('justify-between')
  })

  it('supports wrap', () => {
    const { container } = render(
      <HStack wrap>
        <div>Content</div>
      </HStack>
    )
    const element = container.firstChild
    expect(element).toHaveClass('flex-wrap')
  })

  it('can disable centering', () => {
    const { container } = render(
      <HStack center={false}>
        <div>Content</div>
      </HStack>
    )
    const element = container.firstChild
    expect(element).not.toHaveClass('items-center')
  })
})
