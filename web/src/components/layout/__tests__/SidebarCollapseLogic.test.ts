import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSidebarCollapseLogic } from '../SidebarCollapseLogic'

describe('useSidebarCollapseLogic', () => {
  it('tracks section open state by id', () => {
    const { result } = renderHook(() => useSidebarCollapseLogic())

    expect(result.current.isSectionOpen('primary')).toBe(true)

    act(() => {
      result.current.toggleSection('primary')
    })

    expect(result.current.isSectionOpen('primary')).toBe(false)
    expect(result.current.isSectionOpen('secondary')).toBe(true)

    act(() => {
      result.current.toggleSection('primary')
    })

    expect(result.current.isSectionOpen('primary')).toBe(true)
  })
})
