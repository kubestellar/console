import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardSearch } from './CardSearch'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('CardSearch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not restore a pending search after clearing it', () => {
    const onChange = vi.fn()
    render(<CardSearch value="" onChange={onChange} defaultExpanded />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gpu' } })
    fireEvent.click(screen.getByTitle('common.clearSearch'))
    act(() => vi.runAllTimers())

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('does not apply a pending search after an external reset', () => {
    const onChange = vi.fn()
    const { rerender } = render(<CardSearch value="old" onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gpu' } })
    rerender(<CardSearch value="" onChange={onChange} />)
    act(() => vi.runAllTimers())

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('cancels pending searches on unmount', () => {
    const onChange = vi.fn()
    const { unmount } = render(<CardSearch value="" onChange={onChange} defaultExpanded />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'gpu' } })
    unmount()
    act(() => vi.runAllTimers())

    expect(onChange).not.toHaveBeenCalled()
  })
})
