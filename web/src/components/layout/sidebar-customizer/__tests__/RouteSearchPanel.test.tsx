import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { KnownRoute } from '../RouteSearchPanel'
import { RouteSearchPanel } from '../RouteSearchPanel'

const routes: KnownRoute[] = [
  {
    href: '/deploy',
    name: 'Deployments',
    description: 'Manage rollout health',
    icon: 'Rocket',
    category: 'Operations',
  },
  {
    href: '/alerts',
    name: 'Alerts',
    description: 'Review triggered incidents',
    icon: 'Bell',
    category: 'Operations',
  },
]

describe('RouteSearchPanel', () => {
  it('filters routes by the current search string', () => {
    render(
      <RouteSearchPanel
        availableRoutes={routes}
        routeSearch="rollout"
        onSearchChange={vi.fn()}
        onAdd={vi.fn()}
        renderIcon={(iconName) => <span data-testid={`icon-${iconName}`} />}
      />
    )

    expect(screen.getByRole('button', { name: /Deployments/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Alerts/i })).not.toBeInTheDocument()
  })

  it('notifies callers when the search query changes', () => {
    const onSearchChange = vi.fn()

    render(
      <RouteSearchPanel
        availableRoutes={routes}
        routeSearch=""
        onSearchChange={onSearchChange}
        onAdd={vi.fn()}
        renderIcon={(iconName) => <span data-testid={`icon-${iconName}`} />}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('sidebar.customizer.searchPlaceholder'), {
      target: { value: 'alerts' },
    })

    expect(onSearchChange).toHaveBeenCalledWith('alerts')
  })

  it('adds a selected route when its action button is clicked', () => {
    const onAdd = vi.fn()

    render(
      <RouteSearchPanel
        availableRoutes={routes}
        routeSearch=""
        onSearchChange={vi.fn()}
        onAdd={onAdd}
        renderIcon={(iconName) => <span data-testid={`icon-${iconName}`} />}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Deployments/i }))

    expect(onAdd).toHaveBeenCalledWith(routes[0])
  })
})
