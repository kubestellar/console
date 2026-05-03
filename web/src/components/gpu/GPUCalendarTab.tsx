import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { GPUReservation } from '../../hooks/useGPUReservations'

export interface CalendarBar {
  reservation: GPUReservation
  startCol: number // 0-6 column in this week
  spanCols: number // number of columns it spans
  row: number // row index within the week
  isStart: boolean // does the bar start in this week?
  isEnd: boolean // does the bar end in this week?
}

export interface CalendarWeek {
  days: (number | null)[]
  bars: CalendarBar[]
}

export interface GPUCalendarTabProps {
  currentMonth: Date
  calendarWeeks: CalendarWeek[]
  effectiveDemoMode: boolean
  expandedReservationId: string | null
  onSetExpandedReservationId: (id: string | null) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onAddReservation: (dateStr: string) => void
  getGPUCountForDay: (day: number) => number
}

const MAX_VISIBLE_ROWS = 4

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function GPUCalendarTab({
  currentMonth,
  calendarWeeks,
  effectiveDemoMode,
  expandedReservationId,
  onSetExpandedReservationId,
  onPrevMonth,
  onNextMonth,
  onAddReservation,
  getGPUCountForDay,
}: GPUCalendarTabProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="space-y-6">
      <div className={cn('glass p-4 rounded-lg', effectiveDemoMode && 'border-2 border-yellow-500/50')}>
        <div className="flex items-center justify-center gap-4 mb-4">
          {(['prev', 'heading', 'next'] as const).map(item => {
            if (item === 'heading') return (
              <h3 key="heading" className="text-lg font-medium text-foreground min-w-[180px] text-center">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h3>
            )
            const isNext = item === 'next'
            return (
              <button key={item} onClick={isNext ? onNextMonth : onPrevMonth}
                className="p-2 min-h-11 min-w-11 rounded-lg hover:bg-secondary transition-colors"
                aria-label={isNext ? 'Next month' : 'Previous month'}>
                {isNext ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
              </button>
            )
          })}
        </div>
        <div className="border border-border/50 rounded-lg overflow-x-auto" style={{ minWidth: 0 }}>
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 border-b border-border/50">
            {([
              'gpuReservations.calendar.days.sun',
              'gpuReservations.calendar.days.mon',
              'gpuReservations.calendar.days.tue',
              'gpuReservations.calendar.days.wed',
              'gpuReservations.calendar.days.thu',
              'gpuReservations.calendar.days.fri',
              'gpuReservations.calendar.days.sat',
            ] as const).map(key => (
              <div key={key} className="px-2 py-2 text-center text-sm font-medium text-muted-foreground border-r border-border/30 last:border-r-0">{t(key)}</div>
            ))}
          </div>

          {/* Week rows */}
          {calendarWeeks.map((week, weekIdx) => {
            const maxRow = Math.max(0, ...week.bars.map(b => b.row))
            const barAreaHeight = Math.max(MAX_VISIBLE_ROWS, maxRow + 1)

            return (
              <div key={weekIdx} className="border-b border-border/30 last:border-b-0">
                {/* Day number row + GPU counts */}
                <div className="grid grid-cols-7">
                  {week.days.map((day, col) => {
                    if (day === null) return <div key={col} className="px-2 py-1.5 border-r border-border/30 last:border-r-0 bg-secondary/20" />
                    const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toDateString()
                    const gpuCount = getGPUCountForDay(day)
                    return (
                      <div key={col} className={cn(
                        'px-2 py-1.5 border-r border-border/30 last:border-r-0',
                        isToday && 'bg-purple-500/10'
                      )}>
                        <div className="flex items-center justify-between">
                          <span className={cn('text-sm font-medium', isToday ? 'text-purple-400' : 'text-foreground')}>{day}</span>
                          {gpuCount > 0 && (
                            <span className="text-2xs font-medium text-muted-foreground">{t('gpuReservations.calendar.gpusCount', { count: gpuCount })}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Reservation bars area */}
                <div className="group/bars relative grid grid-cols-7" style={{ minHeight: `${barAreaHeight * 24 + 8}px` }}>
                  {/* Column borders */}
                  {week.days.map((_, col) => (
                    <div key={col} className="border-r border-border/30 last:border-r-0" />
                  ))}

                  {/* "+" button per day - bottom right */}
                  {week.days.map((day, col) => {
                    if (day === null) return null
                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    return (
                      <button
                        key={`add-${day}`}
                        onClick={() => onAddReservation(dateStr)}
                        className="absolute w-5 h-5 flex items-center justify-center rounded bg-purple-500/20 text-purple-400 opacity-0 group-hover/bars:opacity-60 hover:opacity-100! hover:bg-purple-500/40 transition-all z-10 bottom-1"
                        style={{
                          left: `calc(${((col + 1) / 7) * 100}% - 24px)`,
                        }}
                        aria-label={`Add reservation on ${dateStr}`}
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )
                  })}

                  {/* Spanning bars */}
                  {week.bars.map((bar, barIdx) => {
                    const isActive = bar.reservation.status === 'active'
                    const isPending = bar.reservation.status === 'pending'
                    const isInactive = bar.reservation.status === 'completed' || bar.reservation.status === 'cancelled'

                    return (
                      <button
                        key={`${bar.reservation.id}-${weekIdx}-${barIdx}`}
                        onClick={() => onSetExpandedReservationId(expandedReservationId === bar.reservation.id ? null : bar.reservation.id)}
                        className={cn(
                          'absolute flex items-center gap-1.5 px-2 text-xs font-medium truncate cursor-pointer transition-opacity hover:opacity-90',
                          'h-[20px]',
                          isInactive
                            ? 'bg-secondary/80 text-muted-foreground'
                            : isActive
                              ? 'bg-purple-500/30 text-purple-300'
                              : 'bg-yellow-500/20 text-yellow-300',
                          bar.isStart ? 'rounded-l-md' : '',
                          bar.isEnd ? 'rounded-r-md' : '',
                        )}
                        style={{
                          left: `calc(${(bar.startCol / 7) * 100}% + 2px)`,
                          width: `calc(${(bar.spanCols / 7) * 100}% - 4px)`,
                          top: `${bar.row * 24 + 4}px`,
                        }}
                        title={`${bar.reservation.title} (${bar.reservation.gpu_count} GPUs, ${bar.reservation.status})`}
                        aria-label={`${bar.reservation.title}: ${bar.reservation.gpu_count} GPUs, ${bar.reservation.status}`}
                      >
                        {bar.isStart && (
                          <>
                            {isActive && <span className="inline-block w-2 h-2 rounded-full bg-green-400 shrink-0" />}
                            {isPending && <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shrink-0" />}
                          </>
                        )}
                        {bar.isStart ? bar.reservation.title : ''}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
