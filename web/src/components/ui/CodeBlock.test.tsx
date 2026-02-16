import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CodeBlock } from './CodeBlock'

describe('CodeBlock Component', () => {
  it('renders code block with content', () => {
    const { container } = render(<CodeBlock>console.log('hello')</CodeBlock>)
    expect(container.querySelector('pre')).toBeTruthy()
  })

  it('displays code content', () => {
    const code = 'const x = 42'
    const { container } = render(<CodeBlock>{code}</CodeBlock>)
    expect(container.textContent).toContain(code)
  })

  it('shows copy button on hover', () => {
    const { container } = render(<CodeBlock>test</CodeBlock>)
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    expect(button?.getAttribute('title')).toContain('Copy')
  })
})
