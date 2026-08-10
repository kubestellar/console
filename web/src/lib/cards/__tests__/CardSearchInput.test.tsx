import React from 'react'
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock useCardType to avoid requiring CardWrapper context
vi.mock('../../../components/cards/CardWrapper', () => ({
  useCardType: () => 'test-card',
}))

// Mock analytics to observe emitCardSearchUsed calls
const emitCardSearchUsed = vi.fn()
vi.mock('../../analytics', () => ({
  emitCardSearchUsed: (...args: unknown[]) => emitCardSearchUsed(...args),
}))

import { CardSearchInput } from '../CardSearchInput'

describe('CardSearchInput', () => {
  beforeEach(() => {
    emitCardSearchUsed.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders with default placeholder and reflects the controlled value', () => {
    render(<CardSearchInput value="pods" onChange={() => {}} />)

    const input = screen.getByPlaceholderText('Search...') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('pods')
  })

  it('respects a custom placeholder', () => {
    render(<CardSearchInput value="" onChange={() => {}} placeholder="Find alerts" />)

    expect(screen.getByPlaceholderText('Find alerts')).toBeInTheDocument()
  })

  it('fires onChange synchronously when debounceMs is not set', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} />)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'a' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('debounces onChange when debounceMs is provided', () => {
    const onChange = vi.fn()
    render(<CardSearchInput value="" onChange={onChange} debounceMs={200} />)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'a' } })
    fireEvent.change(input, { target: { value: 'ab' } })
    fireEvent.change(input, { target: { value: 'abc' } })

    // Local value updates immediately, but onChange must not have fired yet
    expect((input as HTMLInputElement).value).toBe('abc')
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('abc')
  })

  it('syncs internal state when the external controlled value changes', () => {
    const { rerender } = render(<CardSearchInput value="one" onChange={() => {}} debounceMs={100} />)

    const input = screen.getByPlaceholderText('Search...') as HTMLInputElement
    expect(input.value).toBe('one')

    rerender(<CardSearchInput value="two" onChange={() => {}} debounceMs={100} />)
    expect(input.value).toBe('two')
  })

  it('emits analytics on blur only when a search term is present', () => {
    render(<CardSearchInput value="mycluster" onChange={() => {}} />)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.blur(input)

    expect(emitCardSearchUsed).toHaveBeenCalledTimes(1)
    expect(emitCardSearchUsed).toHaveBeenCalledWith('mycluster'.length, 'test-card')
  })

  it('does not emit analytics on blur when the search term is empty', () => {
    render(<CardSearchInput value="" onChange={() => {}} />)

    fireEvent.blur(screen.getByPlaceholderText('Search...'))

    expect(emitCardSearchUsed).not.toHaveBeenCalled()
  })

  it('uses the local (debounced) value length when emitting analytics', () => {
    render(<CardSearchInput value="" onChange={() => {}} debounceMs={200} />)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'longer' } })
    fireEvent.blur(input)

    expect(emitCardSearchUsed).toHaveBeenCalledWith('longer'.length, 'test-card')
  })

  it('merges the wrapper className with the canonical layout classes', () => {
    const { container } = render(
      <CardSearchInput value="" onChange={() => {}} className="max-w-sm" />
    )

    const wrapper = container.querySelector('div') as HTMLElement
    expect(wrapper.className).toContain('relative')
    expect(wrapper.className).toContain('mb-4')
    expect(wrapper.className).toContain('flex-1')
    expect(wrapper.className).toContain('max-w-sm')
  })

  it('clears a pending debounced onChange when unmounted', () => {
    const onChange = vi.fn()
    const { unmount } = render(
      <CardSearchInput value="" onChange={onChange} debounceMs={300} />
    )

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'pending' },
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onChange).not.toHaveBeenCalled()
  })
})
