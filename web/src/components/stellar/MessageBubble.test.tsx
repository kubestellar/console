import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from './MessageBubble'

describe('MessageBubble markdown sanitization', () => {
  it('blocks javascript links in stellar markdown content', async () => {
    render(
      <MessageBubble
        msg={{
          id: '1',
          role: 'stellar',
          content: '[bad](javascript:alert(1)) [ok](https://example.com)',
        }}
      />,
    )

    expect(screen.queryByRole('link', { name: 'bad' })).not.toBeInTheDocument()

    const safeLink = await screen.findByRole('link', { name: 'ok' })
    expect(safeLink).toHaveAttribute('href', 'https://example.com')
  })
})
