import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PipelineFilterProvider, usePipelineFilter } from '../PipelineFilterContext'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../../hooks/useGitHubPipelines', () => ({
  getPipelineRepos: () => ['kubestellar/console', 'kubestellar/docs'],
}))

vi.mock('../../../../lib/utils/localStorage', () => ({
  safeGetJSON: vi.fn(() => null),
  safeSetJSON: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helper component — exposes PipelineFilterState in the DOM for assertions
// ---------------------------------------------------------------------------

function FilterInspector() {
  const state = usePipelineFilter()
  if (!state) return <div data-testid="no-context">no context</div>
  return (
    <div>
      <div data-testid="repos">{state.repos.join(',')}</div>
      <div data-testid="server-repos">{state.serverRepos.join(',')}</div>
      <div data-testid="selected-repos">{[...state.selectedRepos].join(',')}</div>
      <div data-testid="repo-filter">{state.repoFilter ?? 'null'}</div>
      <div data-testid="has-customization">{String(state.hasCustomization)}</div>
      <div data-testid="hidden-repos">{state.hiddenRepos.join(',')}</div>
      <button data-testid="toggle-console" onClick={() => state.toggleRepo('kubestellar/console')}>
        toggle console
      </button>
      <button data-testid="select-all" onClick={() => state.selectAll()}>
        select all
      </button>
      <button data-testid="add-custom" onClick={() => state.addRepo('custom/repo')}>
        add custom
      </button>
      <button data-testid="remove-console" onClick={() => state.removeRepo('kubestellar/console')}>
        remove console
      </button>
      <button data-testid="restore-console" onClick={() => state.restoreRepo('kubestellar/console')}>
        restore console
      </button>
      <button data-testid="reset" onClick={() => state.resetToDefaults()}>
        reset
      </button>
      <button
        data-testid="set-repo-filter"
        onClick={() => state.setRepoFilter('kubestellar/docs')}
      >
        set repo filter
      </button>
    </div>
  )
}

function Wrapper({ children }: { children?: React.ReactNode }) {
  return <PipelineFilterProvider>{children}</PipelineFilterProvider>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineFilterProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children without crashing', () => {
    render(
      <Wrapper>
        <span data-testid="child">hello</span>
      </Wrapper>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('provides the list of server repos from getPipelineRepos()', () => {
    render(<Wrapper><FilterInspector /></Wrapper>)
    expect(screen.getByTestId('server-repos').textContent).toBe(
      'kubestellar/console,kubestellar/docs',
    )
  })

  it('starts with no selection (all repos)', () => {
    render(<Wrapper><FilterInspector /></Wrapper>)
    expect(screen.getByTestId('selected-repos').textContent).toBe('')
    expect(screen.getByTestId('repo-filter').textContent).toBe('null')
  })

  it('initializes with a specific repo when initialRepo is provided', () => {
    render(
      <PipelineFilterProvider initialRepo="kubestellar/console">
        <FilterInspector />
      </PipelineFilterProvider>,
    )
    expect(screen.getByTestId('selected-repos').textContent).toBe('kubestellar/console')
  })
})

describe('usePipelineFilter – returns null outside provider', () => {
  it('returns null when no provider is present', () => {
    render(<FilterInspector />)
    expect(screen.getByTestId('no-context')).toBeInTheDocument()
  })
})

describe('usePipelineFilter – toggleRepo', () => {
  it('adds a repo to the selection', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('toggle-console'))
    expect(screen.getByTestId('selected-repos').textContent).toBe('kubestellar/console')
  })

  it('removes a repo when toggled twice', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('toggle-console'))
    await user.click(screen.getByTestId('toggle-console'))
    expect(screen.getByTestId('selected-repos').textContent).toBe('')
  })

  it('sets repoFilter to the selected repo when exactly one is selected', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('toggle-console'))
    expect(screen.getByTestId('repo-filter').textContent).toBe('kubestellar/console')
  })
})

describe('usePipelineFilter – selectAll', () => {
  it('clears the selection', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('toggle-console'))
    expect(screen.getByTestId('selected-repos').textContent).not.toBe('')
    await user.click(screen.getByTestId('select-all'))
    expect(screen.getByTestId('selected-repos').textContent).toBe('')
  })
})

describe('usePipelineFilter – addRepo', () => {
  it('adds a custom repo to the visible list', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('add-custom'))
    expect(screen.getByTestId('repos').textContent).toContain('custom/repo')
  })

  it('sets hasCustomization to true after adding a repo', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    expect(screen.getByTestId('has-customization').textContent).toBe('false')
    await user.click(screen.getByTestId('add-custom'))
    expect(screen.getByTestId('has-customization').textContent).toBe('true')
  })
})

describe('usePipelineFilter – removeRepo / restoreRepo', () => {
  it('hides a server-default repo when removed', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('remove-console'))
    expect(screen.getByTestId('repos').textContent).not.toContain('kubestellar/console')
    expect(screen.getByTestId('hidden-repos').textContent).toContain('kubestellar/console')
  })

  it('restores a hidden server-default repo', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('remove-console'))
    expect(screen.getByTestId('repos').textContent).not.toContain('kubestellar/console')
    await user.click(screen.getByTestId('restore-console'))
    expect(screen.getByTestId('repos').textContent).toContain('kubestellar/console')
  })
})

describe('usePipelineFilter – setRepoFilter', () => {
  it('sets selection to exactly one repo', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('set-repo-filter'))
    expect(screen.getByTestId('selected-repos').textContent).toBe('kubestellar/docs')
    expect(screen.getByTestId('repo-filter').textContent).toBe('kubestellar/docs')
  })
})

describe('usePipelineFilter – resetToDefaults', () => {
  it('clears all customization and selection', async () => {
    const user = userEvent.setup()
    render(<Wrapper><FilterInspector /></Wrapper>)
    await user.click(screen.getByTestId('add-custom'))
    await user.click(screen.getByTestId('toggle-console'))
    expect(screen.getByTestId('has-customization').textContent).toBe('true')
    await user.click(screen.getByTestId('reset'))
    expect(screen.getByTestId('has-customization').textContent).toBe('false')
    expect(screen.getByTestId('selected-repos').textContent).toBe('')
  })
})
