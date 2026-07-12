import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PayloadGrid } from './PayloadGrid'
import type { PayloadProject } from './types'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/', search: '' }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn() },
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const mockProjects: PayloadProject[] = [
  {
    name: 'prometheus',
    displayName: 'Prometheus',
    category: 'Observability',
    maturity: 'graduated',
    priority: 'required',
    reason: 'Metrics collection',
    dependencies: [],
  },
  {
    name: 'grafana',
    displayName: 'Grafana',
    category: 'Observability',
    maturity: 'graduated',
    priority: 'recommended',
    reason: 'Dashboards',
    dependencies: ['prometheus'],
  },
]

describe('PayloadGrid', () => {
  it('renders all projects', () => {
    const onUpdatePriority = vi.fn()
    const onRemoveProject = vi.fn()

    render(
      <PayloadGrid
        projects={mockProjects}
        onUpdatePriority={onUpdatePriority}
        onRemoveProject={onRemoveProject}
      />
    )

    expect(screen.getByText('Prometheus')).toBeInTheDocument()
    expect(screen.getByText('Grafana')).toBeInTheDocument()
  })

  it('renders empty state when no projects', () => {
    const onUpdatePriority = vi.fn()
    const onRemoveProject = vi.fn()

    const { container } = render(
      <PayloadGrid
        projects={[]}
        onUpdatePriority={onUpdatePriority}
        onRemoveProject={onRemoveProject}
      />
    )

    expect(container.textContent).toBeTruthy()
  })

  it('groups projects by category', () => {
    const onUpdatePriority = vi.fn()
    const onRemoveProject = vi.fn()

    render(
      <PayloadGrid
        projects={mockProjects}
        onUpdatePriority={onUpdatePriority}
        onRemoveProject={onRemoveProject}
      />
    )

    expect(screen.getAllByText('Observability')).toHaveLength(2)
  })

  it('renders project count', () => {
    const onUpdatePriority = vi.fn()
    const onRemoveProject = vi.fn()

    render(
      <PayloadGrid
        projects={mockProjects}
        onUpdatePriority={onUpdatePriority}
        onRemoveProject={onRemoveProject}
      />
    )

    expect(screen.getByText(/2/)).toBeInTheDocument()
  })
})
