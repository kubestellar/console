import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider } from './Toast'
import { ErrorToastListener } from './ErrorToastListener'

describe('ErrorToastListener', () => {
  it('shows a toast when a stellar-error event is dispatched (#23188)', async () => {
    render(
      <ToastProvider>
        <ErrorToastListener />
      </ToastProvider>
    )

    act(() => {
      window.dispatchEvent(new CustomEvent('stellar-error', {
        detail: { operation: 'getState', error: 'network unreachable', timestamp: Date.now() },
      }))
    })

    expect(await screen.findByText(/Stellar getState failed: network unreachable/i)).toBeInTheDocument()
  })
})
