import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageBubble } from './MessageBubble'

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))

vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('rehype-sanitize', () => ({ default: () => {} }))

describe('MessageBubble', () => {
  it('renders user message content', () => {
    render(
      <MessageBubble
        msg={{ id: 'msg-1', role: 'user', content: 'Hello Stellar' }}
      />
    )
    expect(screen.getByText('Hello Stellar')).toBeInTheDocument()
  })

  it('renders user label for user messages', () => {
    render(
      <MessageBubble
        msg={{ id: 'msg-2', role: 'user', content: 'Hi' }}
      />
    )
    expect(screen.getByText('you')).toBeInTheDocument()
  })

  it('renders stellar label for stellar messages', () => {
    render(
      <MessageBubble
        msg={{ id: 'msg-3', role: 'stellar', content: 'Hello!' }}
      />
    )
    expect(screen.getByText('\u25cf stellar')).toBeInTheDocument()
  })

  it('renders loading dots when loading is true', () => {
    const { container } = render(
      <MessageBubble
        msg={{ id: 'msg-4', role: 'stellar', content: '', loading: true }}
      />
    )
    const dots = container.querySelectorAll('[style*="border-radius: 50%"]')
    expect(dots.length).toBeGreaterThanOrEqual(3)
  })

  it('renders watch created indicator when watchCreated is true', () => {
    render(
      <MessageBubble
        msg={{ id: 'msg-5', role: 'stellar', content: 'Watching now', watchCreated: true }}
      />
    )
    expect(screen.getByText(/Stellar is watching this/)).toBeInTheDocument()
  })

  it('renders meta info when provided', () => {
    render(
      <MessageBubble
        msg={{
          id: 'msg-6',
          role: 'stellar',
          content: 'Response',
          meta: { model: 'gpt-4o', tokens: 120, provider: 'openai', durationMs: 450 },
        }}
      />
    )
    expect(screen.getByText('openai \u00b7 gpt-4o \u00b7 120 tok \u00b7 450ms')).toBeInTheDocument()
  })
})
