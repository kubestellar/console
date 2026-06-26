import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SidebarResizeHandle } from '../SidebarResizeHandle'
import {
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  TABLET_BREAKPOINT_PX,
} from '../useSidebarResize'

describe('SidebarResizeHandle', () => {
  it('renders a separator with the provided label', () => {
    render(
      <SidebarResizeHandle onResizeStart={vi.fn()} label="Resize sidebar" />
    )

    const separator = screen.getByRole('separator')
    expect(separator).toBeInTheDocument()
    expect(separator).toHaveAttribute('aria-label', 'Resize sidebar')
    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
  })

  it('calls onResizeStart on mousedown', () => {
    const onResizeStart = vi.fn()
    render(
      <SidebarResizeHandle onResizeStart={onResizeStart} label="Resize" />
    )

    fireEvent.mouseDown(screen.getByRole('separator'))
    expect(onResizeStart).toHaveBeenCalledTimes(1)
  })
})

describe('useSidebarResize constants', () => {
  it('SIDEBAR_MIN_WIDTH is less than SIDEBAR_MAX_WIDTH', () => {
    expect(SIDEBAR_MIN_WIDTH).toBeLessThan(SIDEBAR_MAX_WIDTH)
  })

  it('SIDEBAR_DEFAULT_WIDTH is between min and max', () => {
    expect(SIDEBAR_DEFAULT_WIDTH).toBeGreaterThanOrEqual(SIDEBAR_MIN_WIDTH)
    expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH)
  })

  it('TABLET_BREAKPOINT_PX is a reasonable viewport width', () => {
    expect(TABLET_BREAKPOINT_PX).toBeGreaterThan(0)
    expect(TABLET_BREAKPOINT_PX).toBeLessThan(2000)
  })
})
