import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GPUCalendarTab } from '../GPUCalendarTab'
import type { CalendarWeek } from '../GPUCalendarTab'

const noop = vi.fn()

const JANUARY_2024 = new Date(2024, 0, 1) // January 2024

const EMPTY_WEEKS: CalendarWeek[] = []

const SINGLE_WEEK: CalendarWeek[] = [
  {
    days: [1, 2, 3, 4, 5, 6, 7],
    bars: [],
  },
]

function renderCalendar(overrides: Partial<React.ComponentProps<typeof GPUCalendarTab>> = {}) {
  const defaults: React.ComponentProps<typeof GPUCalendarTab> = {
    currentMonth: JANUARY_2024,
    calendarWeeks: EMPTY_WEEKS,
    effectiveDemoMode: false,
    expandedReservationId: null,
    onSetExpandedReservationId: noop,
    onPrevMonth: noop,
    onNextMonth: noop,
    onAddReservation: noop,
    getGPUCountForDay: () => 0,
  }
  return render(<GPUCalendarTab {...defaults} {...overrides} />)
}

describe('GPUCalendarTab', () => {
  it('renders the current month name and year', () => {
    renderCalendar()
    expect(screen.getByText('January 2024')).toBeTruthy()
  })

  it('renders a different month when currentMonth changes', () => {
    renderCalendar({ currentMonth: new Date(2024, 5, 1) }) // June 2024
    expect(screen.getByText('June 2024')).toBeTruthy()
  })

  it('calls onPrevMonth when the previous month button is clicked', () => {
    const onPrevMonth = vi.fn()
    renderCalendar({ onPrevMonth })
    fireEvent.click(screen.getByLabelText('Previous month'))
    expect(onPrevMonth).toHaveBeenCalledTimes(1)
  })

  it('calls onNextMonth when the next month button is clicked', () => {
    const onNextMonth = vi.fn()
    renderCalendar({ onNextMonth })
    fireEvent.click(screen.getByLabelText('Next month'))
    expect(onNextMonth).toHaveBeenCalledTimes(1)
  })

  it('renders day numbers from the calendar weeks', () => {
    renderCalendar({ calendarWeeks: SINGLE_WEEK })
    // Days 1-7 should all be visible
    for (let d = 1; d <= 7; d++) {
      expect(screen.getAllByText(String(d)).length).toBeGreaterThan(0)
    }
  })

  it('calls onAddReservation with the correct date string when the add button is clicked', () => {
    const onAddReservation = vi.fn()
    renderCalendar({ calendarWeeks: SINGLE_WEEK, onAddReservation })
    const addButtons = screen.getAllByLabelText(/Add reservation on/)
    fireEvent.click(addButtons[0])
    expect(onAddReservation).toHaveBeenCalledWith(expect.stringMatching(/^2024-01-\d{2}$/))
  })

  it('applies demo mode border when effectiveDemoMode is true', () => {
    const { container } = renderCalendar({ effectiveDemoMode: true })
    const demoEl = container.querySelector('.border-yellow-500\\/50')
    expect(demoEl).not.toBeNull()
  })
})
