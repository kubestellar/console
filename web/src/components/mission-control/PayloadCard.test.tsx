import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PayloadCard } from './PayloadCard'
import type { PayloadProject } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const mockProject: PayloadProject = {
  name: 'prometheus',
  displayName: 'Prometheus',
  category: 'Observability',
  maturity: 'graduated',
  priority: 'required',
  reason: 'Metrics collection',
  dependencies: [],
}

describe('PayloadCard', () => {
  it('renders project name and reason', () => {
    const onRemove = vi.fn()
    const onUpdatePriority = vi.fn()

    render(
      <PayloadCard
        project={mockProject}
        onRemove={onRemove}
        onUpdatePriority={onUpdatePriority}
      />
    )

    expect(screen.getByText('Prometheus')).toBeInTheDocument()
    expect(screen.getByText('Metrics collection')).toBeInTheDocument()
  })

  it('calls onRemove when remove button clicked', () => {
    const onRemove = vi.fn()
    const onUpdatePriority = vi.fn()

    const { container } = render(
      <PayloadCard
        project={mockProject}
        onRemove={onRemove}
        onUpdatePriority={onUpdatePriority}
      />
    )

    const removeBtn = container.querySelector('[title="Remove"]')
    expect(removeBtn).toBeInTheDocument()
    fireEvent.click(removeBtn!)

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('displays category badge', () => {
    const onRemove = vi.fn()
    const onUpdatePriority = vi.fn()

    render(
      <PayloadCard
        project={mockProject}
        onRemove={onRemove}
        onUpdatePriority={onUpdatePriority}
      />
    )

    expect(screen.getByText('Observability')).toBeInTheDocument()
  })

  it('shows priority with correct styling', () => {
    const onRemove = vi.fn()
    const onUpdatePriority = vi.fn()

    render(
      <PayloadCard
        project={mockProject}
        onRemove={onRemove}
        onUpdatePriority={onUpdatePriority}
      />
    )

    expect(screen.getByText('required')).toBeInTheDocument()
  })

  it('displays dependencies count when present', () => {
    const onRemove = vi.fn()
    const onUpdatePriority = vi.fn()
    const projectWithDeps: PayloadProject = {
      ...mockProject,
      dependencies: ['etcd', 'coredns'],
    }

    render(
      <PayloadCard
        project={projectWithDeps}
        onRemove={onRemove}
        onUpdatePriority={onUpdatePriority}
      />
    )

    expect(screen.getByText(/\+2 deps/)).toBeInTheDocument()
  })

  it('shows installed badge when installed prop is true', () => {
    const onRemove = vi.fn()
    const onUpdatePriority = vi.fn()

    render(
      <PayloadCard
        project={mockProject}
        onRemove={onRemove}
        onUpdatePriority={onUpdatePriority}
        installed={true}
      />
    )

    expect(screen.getByText('Installed')).toBeInTheDocument()
  })

  it('shows needs deploy badge when installed prop is false', () => {
    const onRemove = vi.fn()
    const onUpdatePriority = vi.fn()

    render(
      <PayloadCard
        project={mockProject}
        onRemove={onRemove}
        onUpdatePriority={onUpdatePriority}
        installed={false}
      />
    )

    expect(screen.getByText('Needs deploy')).toBeInTheDocument()
  })
})
