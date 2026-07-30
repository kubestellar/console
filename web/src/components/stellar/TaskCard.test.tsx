import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskCard } from './TaskCard'
import type { StellarTask } from '../../types/stellar'

const baseTask: StellarTask = {
  id: 'task-1',
  sessionId: 'session-1',
  userId: 'user-1',
  cluster: 'prod',
  title: 'Investigate pod crashes',
  description: 'Check why pods keep crashing',
  status: 'open',
  priority: 1,
  source: 'user',
  createdAt: '2026-06-10T10:00:00Z',
  updatedAt: '2026-06-10T10:00:00Z',
}

describe('TaskCard', () => {
  it('renders the task title', () => {
    render(<TaskCard task={baseTask} onStatusChange={vi.fn()} />)
    expect(screen.getByText('Investigate pod crashes')).toBeInTheDocument()
  })

  it('calls onStatusChange with "done" when open task checkbox is clicked', () => {
    const onStatusChange = vi.fn()
    render(<TaskCard task={baseTask} onStatusChange={onStatusChange} />)
    fireEvent.click(screen.getByTitle('Mark done'))
    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'done')
  })

  it('calls onStatusChange with "open" when done task checkbox is clicked', () => {
    const onStatusChange = vi.fn()
    const doneTask = { ...baseTask, status: 'done' }
    render(<TaskCard task={doneTask} onStatusChange={onStatusChange} />)
    fireEvent.click(screen.getByTitle('Mark open'))
    expect(onStatusChange).toHaveBeenCalledWith('task-1', 'open')
  })

  it('renders with line-through style when task is done', () => {
    const doneTask = { ...baseTask, status: 'done' }
    render(<TaskCard task={doneTask} onStatusChange={vi.fn()} />)
    const title = screen.getByText('Investigate pod crashes')
    expect(title).toHaveStyle({ textDecoration: 'line-through' })
  })

  it('shows stellar badge when source is stellar', () => {
    const stellarTask = { ...baseTask, source: 'stellar' }
    render(<TaskCard task={stellarTask} onStatusChange={vi.fn()} />)
    expect(screen.getByText('stellar')).toBeInTheDocument()
  })

  it('does not show stellar badge when source is user', () => {
    render(<TaskCard task={baseTask} onStatusChange={vi.fn()} />)
    expect(screen.queryByText('stellar')).not.toBeInTheDocument()
  })
})
