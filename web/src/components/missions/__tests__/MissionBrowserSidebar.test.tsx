import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'

const mockShowToast = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'actions.remove': 'Remove',
        'actions.cancel': 'Cancel',
        'missionBrowser.repoAddedToast': 'Repository "{{value}}" added',
        'missionBrowser.pathAddedToast': 'Path "{{value}}" added',
        'missionBrowser.repoPlaceholder': 'owner/repo (e.g., kubara-io/kubara or your-org/runbooks)',
        'missionBrowser.pathPlaceholder': '/path/to/missions',
        'missionBrowser.dropZone': 'Drop mission file (JSON, YAML, MD) or click to browse',
        'missionBrowser.removeWatchedRepoTitle': 'Remove watched repository?',
        'missionBrowser.removeWatchedRepoMessage': 'Remove {{path}} from your watched repositories?',
        'missionBrowser.removeWatchedPathTitle': 'Remove watched path?',
        'missionBrowser.removeWatchedPathMessage': 'Remove {{path}} from your watched paths?',
      }
      let value = map[key] ?? key
      for (const [name, replacement] of Object.entries(options ?? {})) {
        value = value.replace(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g'), String(replacement))
      }
      return value
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('../../ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../lib/modals', () => ({
  ConfirmDialog: ({
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onClose,
  }: {
    isOpen: boolean
    title: string
    message: string
    confirmLabel: string
    cancelLabel: string
    onConfirm: () => void
    onClose: () => void
  }) => isOpen ? (
    <div>
      <div>{title}</div>
      <div>{message}</div>
      <button onClick={onConfirm}>{confirmLabel}</button>
      <button onClick={onClose}>{cancelLabel}</button>
    </div>
  ) : null,
}))

vi.mock('../browser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../browser')>()
  return {
    ...actual,
    TreeNodeItem: ({
      node,
      onRemove,
    }: {
      node: { id: string; name: string; children?: Array<{ id: string; name: string; path: string; type: string }> }
      onRemove?: (node: { id: string; name: string; path: string; type: string }) => void
    }) => (
      <div data-testid={`tree-node-${node.id}`}>
        <div>{node.name}</div>
        {(node.children || []).map((child) => (
          <button key={child.id} onClick={() => onRemove?.(child)}>
            {`remove-${child.id}`}
          </button>
        ))}
      </div>
    ),
  }
})

import { MissionBrowserSidebar } from '../MissionBrowserSidebar'
import type { TreeNode } from '../browser'

const GITHUB_CHILD: TreeNode = {
  id: 'gh-repo',
  name: 'owner/repo',
  path: 'owner/repo',
  type: 'directory',
  source: 'github',
}

const LOCAL_CHILD: TreeNode = {
  id: 'local-path',
  name: '/home/user/missions',
  path: '/home/user/missions',
  type: 'directory',
  source: 'local',
}

const GITHUB_NODE: TreeNode = {
  id: 'github',
  name: 'GitHub Repos',
  path: 'github',
  type: 'directory',
  source: 'github',
  children: [GITHUB_CHILD],
}

const LOCAL_NODE: TreeNode = {
  id: 'local',
  name: 'Local Paths',
  path: 'local',
  type: 'directory',
  source: 'local',
  children: [LOCAL_CHILD],
}

function renderSidebar(
  overrides: Partial<ComponentProps<typeof MissionBrowserSidebar>> = {},
) {
  const props: ComponentProps<typeof MissionBrowserSidebar> = {
    treeNodes: [GITHUB_NODE, LOCAL_NODE],
    expandedNodes: new Set(),
    selectedPath: null,
    revealPath: null,
    revealNonce: 0,
    onToggleNode: vi.fn(),
    onSelectNode: vi.fn(),
    isDragging: false,
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onFileSelect: vi.fn(),
    watchedRepos: [],
    onRemoveRepo: vi.fn(),
    onRefreshNode: vi.fn(),
    watchedPaths: [],
    onRemovePath: vi.fn(),
    addingRepo: false,
    setAddingRepo: vi.fn(),
    newRepoValue: '',
    setNewRepoValue: vi.fn(),
    onAddRepo: vi.fn(),
    addingPath: false,
    setAddingPath: vi.fn(),
    newPathValue: '',
    setNewPathValue: vi.fn(),
    onAddPath: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<MissionBrowserSidebar {...props} />) }
}

describe('MissionBrowserSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the mission-tree container', () => {
    renderSidebar()
    expect(screen.getByTestId('mission-tree')).toBeInTheDocument()
  })

  it('renders all tree nodes', () => {
    renderSidebar()
    expect(screen.getByTestId('tree-node-github')).toBeInTheDocument()
    expect(screen.getByTestId('tree-node-local')).toBeInTheDocument()
  })

  it('renders drop zone with upload text', () => {
    renderSidebar()
    expect(
      screen.getByText(/drop mission file|click to browse/i),
    ).toBeInTheDocument()
  })

  it('shows add-repo form when addingRepo is true', () => {
    renderSidebar({ addingRepo: true, newRepoValue: '' })
    expect(
      screen.getByPlaceholderText(/owner\/repo/i),
    ).toBeInTheDocument()
  })

  it('hides add-repo form when addingRepo is false', () => {
    renderSidebar({ addingRepo: false })
    expect(screen.queryByPlaceholderText(/owner\/repo/i)).not.toBeInTheDocument()
  })

  it('calls onAddRepo and showToast on repo confirm click', async () => {
    const user = userEvent.setup()
    const { props } = renderSidebar({
      addingRepo: true,
      newRepoValue: 'my-org/my-repo',
    })
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    const actionRow = input.parentElement
    const confirmButton = actionRow?.querySelectorAll('button')[0] as HTMLButtonElement
    await user.click(confirmButton)
    expect(props.onAddRepo).toHaveBeenCalledWith('my-org/my-repo')
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('my-org/my-repo'),
      'success',
    )
  })

  it('does not call onAddRepo when repo value is empty', async () => {
    const { props } = renderSidebar({ addingRepo: true, newRepoValue: '' })
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    const actionRow = input.parentElement
    const confirmButton = actionRow?.querySelectorAll('button')[0] as HTMLButtonElement
    fireEvent.click(confirmButton)
    expect(props.onAddRepo).not.toHaveBeenCalled()
  })

  it('does not call onAddRepo for a duplicate repo', async () => {
    const { props } = renderSidebar({
      addingRepo: true,
      newRepoValue: 'existing/repo',
      watchedRepos: ['existing/repo'],
    })
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    const actionRow = input.parentElement
    const confirmButton = actionRow?.querySelectorAll('button')[0] as HTMLButtonElement
    fireEvent.click(confirmButton)
    expect(props.onAddRepo).not.toHaveBeenCalled()
  })

  it('cancel button in add-repo form calls setAddingRepo(false)', async () => {
    const user = userEvent.setup()
    const { props } = renderSidebar({ addingRepo: true, newRepoValue: '' })
    const cancelBtns = screen.getAllByRole('button')
    const cancelBtn = cancelBtns.find(
      (b) => b.querySelector('svg') && b.getAttribute('type') === 'button',
    )
    await user.click(cancelBtn!)
    expect(props.setAddingRepo).toHaveBeenCalledWith(false)
  })

  it('Escape key in add-repo input calls setAddingRepo(false)', async () => {
    const user = userEvent.setup()
    const { props } = renderSidebar({ addingRepo: true, newRepoValue: '' })
    const input = screen.getByPlaceholderText(/owner\/repo/i)
    await user.type(input, '{Escape}')
    expect(props.setAddingRepo).toHaveBeenCalledWith(false)
  })

  it('shows add-path form when addingPath is true', () => {
    renderSidebar({ addingPath: true, newPathValue: '' })
    expect(
      screen.getByPlaceholderText('/path/to/missions'),
    ).toBeInTheDocument()
  })

  it('hides add-path form when addingPath is false', () => {
    renderSidebar({ addingPath: false })
    expect(
      screen.queryByPlaceholderText('/path/to/missions'),
    ).not.toBeInTheDocument()
  })

  it('calls onAddPath and showToast on path confirm click', async () => {
    const { props } = renderSidebar({
      addingPath: true,
      newPathValue: '/home/user/missions',
    })
    const input = screen.getByPlaceholderText('/path/to/missions')
    const actionRow = input.parentElement
    const confirmButton = actionRow?.querySelectorAll('button')[0] as HTMLButtonElement
    fireEvent.click(confirmButton)
    expect(props.onAddPath).toHaveBeenCalledWith('/home/user/missions')
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('/home/user/missions'),
      'success',
    )
  })

  it('does not call onAddPath when path value is empty', async () => {
    const { props } = renderSidebar({ addingPath: true, newPathValue: '' })
    const input = screen.getByPlaceholderText('/path/to/missions')
    const actionRow = input.parentElement
    const confirmButton = actionRow?.querySelectorAll('button')[0] as HTMLButtonElement
    fireEvent.click(confirmButton)
    expect(props.onAddPath).not.toHaveBeenCalled()
  })

  it('Escape key in add-path input calls setAddingPath(false)', async () => {
    const user = userEvent.setup()
    const { props } = renderSidebar({ addingPath: true, newPathValue: '' })
    const input = screen.getByPlaceholderText('/path/to/missions')
    await user.type(input, '{Escape}')
    expect(props.setAddingPath).toHaveBeenCalledWith(false)
  })

  it('confirms repo removal before invoking callback', async () => {
    const user = userEvent.setup()
    const { props } = renderSidebar()

    await user.click(screen.getByRole('button', { name: /remove-gh-repo/i }))
    expect(props.onRemoveRepo).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^Remove$/i }))
    expect(props.onRemoveRepo).toHaveBeenCalledWith('owner/repo')
  })

  it('confirms path removal before invoking callback', async () => {
    const user = userEvent.setup()
    const { props } = renderSidebar()

    await user.click(screen.getByRole('button', { name: /remove-local-path/i }))
    expect(props.onRemovePath).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^Remove$/i }))
    expect(props.onRemovePath).toHaveBeenCalledWith('/home/user/missions')
  })

  it('calls onDragOver when dragging over the drop zone', () => {
    const { props } = renderSidebar()
    const dropZone = screen.getByText(/drop mission file/i).closest('div')!
    fireEvent.dragOver(dropZone, { preventDefault: vi.fn() })
    expect(props.onDragOver).toHaveBeenCalled()
  })

  it('calls onDragLeave when leaving the drop zone', () => {
    const { props } = renderSidebar()
    const dropZone = screen.getByText(/drop mission file/i).closest('div')!
    fireEvent.dragLeave(dropZone)
    expect(props.onDragLeave).toHaveBeenCalled()
  })

  it('calls onDrop when a file is dropped', () => {
    const { props } = renderSidebar()
    const dropZone = screen.getByText(/drop mission file/i).closest('div')!
    fireEvent.drop(dropZone)
    expect(props.onDrop).toHaveBeenCalled()
  })

  it('applies dragging styles when isDragging is true', () => {
    renderSidebar({ isDragging: true })
    const dropZone = screen.getByText(/drop mission file/i).closest('div')!
    expect(dropZone.className).toContain('border-purple-400')
  })

  it('applies default styles when isDragging is false', () => {
    renderSidebar({ isDragging: false })
    const dropZone = screen.getByText(/drop mission file/i).closest('div')!
    expect(dropZone.className).not.toContain('border-purple-400')
  })
})
