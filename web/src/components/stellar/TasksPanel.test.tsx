import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TasksPanel } from './TasksPanel'
import type { StellarTask } from '../../types/stellar'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('./TaskCard', () => ({
  TaskCard: ({ task }: { task: StellarTask }) => (
    <div data-testid={`task-${task.id}`}>{task.title}</div>
  ),
}))

const baseTask: StellarTask = {
  id: 'task-1',
  sessionId: 'sess-1',
  userId: 'user-1',
  cluster: 'prod',
  title: 'Fix crashing pod',
  description: 'Pod keeps restarting',
  status: 'open',
  priority: 1,
  source: 'stellar',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('TasksPanel', () => {
  it('renders the panel toggle button with i18n title key', () => {
    render(
      <TasksPanel
        tasks={[baseTask]}
        expanded={false}
        onToggle={() => {}}
        onStatusChange={() => {}}
      />
    )
    expect(screen.getByText('stellar.tasks.title')).toBeInTheDocument()
  })

  it('shows open task count badge', () => {
    render(
      <TasksPanel
        tasks={[baseTask]}
        expanded={false}
        onToggle={() => {}}
        onStatusChange={() => {}}
      />
    )
    expect(screen.getByText('1 open')).toBeInTheDocument()
  })

  it('renders task cards when expanded', () => {
    render(
      <TasksPanel
        tasks={[baseTask]}
        expanded={true}
        onToggle={() => {}}
        onStatusChange={() => {}}
      />
    )
    expect(screen.getByTestId('task-task-1')).toBeInTheDocument()
    expect(screen.getByText('Fix crashing pod')).toBeInTheDocument()
  })

  it('hides task cards when collapsed', () => {
    render(
      <TasksPanel
        tasks={[baseTask]}
        expanded={false}
        onToggle={() => {}}
        onStatusChange={() => {}}
      />
    )
    expect(screen.queryByTestId('task-task-1')).not.toBeInTheDocument()
  })

  it('shows empty message when expanded with no tasks', () => {
    render(
      <TasksPanel
        tasks={[]}
        expanded={true}
        onToggle={() => {}}
        onStatusChange={() => {}}
      />
    )
    expect(screen.getByText('No open tasks.')).toBeInTheDocument()
  })

  it('calls onToggle when the button is clicked', () => {
    const onToggle = vi.fn()
    render(
      <TasksPanel
        tasks={[]}
        expanded={false}
        onToggle={onToggle}
        onStatusChange={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
