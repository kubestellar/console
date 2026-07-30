import { useState, useCallback, useMemo } from 'react'
import type { GPUReservation } from '../../hooks/useGPUReservations'
import type { CalendarBar } from './GPUCalendarTab'

export function useGPUCalendarState(filteredReservations: GPUReservation[]) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDay = firstDay.getDay()
    return { daysInMonth, startingDay }
  }

  const { daysInMonth, startingDay } = getDaysInMonth(currentMonth)

  // Get the start/end day index (0-based from month start) for a reservation within the visible month.
  const getReservationDayRange = useCallback((r: GPUReservation) => {
    if (!r.start_date) return null
    const MS_PER_HOUR = 3_600_000
    const DEFAULT_DURATION_HOURS = 24

    const originalStart = new Date(r.start_date)
    const durationHours = r.duration_hours || DEFAULT_DURATION_HOURS
    const exactEnd = new Date(originalStart.getTime() + durationHours * MS_PER_HOUR)

    const start = new Date(originalStart)
    start.setHours(0, 0, 0, 0)
    const end = new Date(exactEnd)
    end.setHours(23, 59, 59, 999)

    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    monthStart.setHours(0, 0, 0, 0)
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
    monthEnd.setHours(23, 59, 59, 999)

    if (end < monthStart || start > monthEnd) return null

    const clampedStart = start < monthStart ? 1 : start.getDate()
    const clampedEnd = end > monthEnd ? daysInMonth : end.getDate()
    return { startDay: clampedStart, endDay: clampedEnd }
  }, [currentMonth, daysInMonth])

  // Compute spanning reservation rows per calendar week
  const calendarWeeks = useMemo(() => {
    const totalCells = startingDay + daysInMonth
    const numWeeks = Math.ceil(totalCells / 7)
    const weeks: { days: (number | null)[]; bars: CalendarBar[] }[] = []

    for (let w = 0; w < numWeeks; w++) {
      const days: (number | null)[] = []
      for (let col = 0; col < 7; col++) {
        const cellIndex = w * 7 + col
        const day = cellIndex - startingDay + 1
        days.push(day >= 1 && day <= daysInMonth ? day : null)
      }
      weeks.push({ days, bars: [] })
    }

    const rowOccupancy: (string | null)[][] = weeks.map(() => [])

    const sortedReservations = [...filteredReservations]
      .map(r => ({ r, range: getReservationDayRange(r) }))
      .filter((x): x is { r: GPUReservation; range: { startDay: number; endDay: number } } => x.range !== null)
      .sort((a, b) => a.range.startDay - b.range.startDay || (b.range.endDay - b.range.startDay) - (a.range.endDay - a.range.startDay))

    for (const { r, range } of sortedReservations) {
      for (let w = 0; w < weeks.length; w++) {
        const weekStartDay = weeks[w].days.find(d => d !== null) ?? 1
        const weekEndDay = [...weeks[w].days].reverse().find(d => d !== null) ?? daysInMonth

        if (range.startDay > weekEndDay || range.endDay < weekStartDay) continue

        const barStartDay = Math.max(range.startDay, weekStartDay)
        const barEndDay = Math.min(range.endDay, weekEndDay)
        const startCol = weeks[w].days.indexOf(barStartDay)
        const endCol = weeks[w].days.indexOf(barEndDay)
        if (startCol === -1 || endCol === -1) continue

        let row = 0
        while (true) {
          if (!rowOccupancy[w][row]) break
          if (rowOccupancy[w][row] !== r.id) {
            let conflict = false
            for (const bar of weeks[w].bars) {
              if (bar.row === row) {
                const barEnd = bar.startCol + bar.spanCols - 1
                if (!(endCol < bar.startCol || startCol > barEnd)) {
                  conflict = true
                  break
                }
              }
            }
            if (!conflict) break
          }
          row++
        }
        rowOccupancy[w][row] = r.id

        weeks[w].bars.push({
          reservation: r,
          startCol,
          spanCols: endCol - startCol + 1,
          row,
          isStart: barStartDay === range.startDay,
          isEnd: barEndDay === range.endDay,
        })
      }
    }

    return weeks
  }, [filteredReservations, startingDay, daysInMonth, getReservationDayRange])

  const getGPUCountForDay = (day: number) => {
    const MS_PER_HOUR = 3_600_000
    const DEFAULT_DURATION_HOURS = 24
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
    date.setHours(0, 0, 0, 0)
    let total = 0
    for (const r of filteredReservations) {
      if (!r.start_date) continue
      const originalStart = new Date(r.start_date)
      const durationHours = r.duration_hours || DEFAULT_DURATION_HOURS
      const exactEnd = new Date(originalStart.getTime() + durationHours * MS_PER_HOUR)
      const start = new Date(originalStart)
      start.setHours(0, 0, 0, 0)
      const end = new Date(exactEnd)
      end.setHours(23, 59, 59, 999)
      if (date >= start && date <= end) {
        total += r.gpu_count
      }
    }
    return total
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  return {
    currentMonth,
    calendarWeeks,
    getGPUCountForDay,
    prevMonth,
    nextMonth,
  }
}
