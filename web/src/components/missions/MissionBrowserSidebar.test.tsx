import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MissionBrowserSidebar } from './MissionBrowserSidebar'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const defaultProps = {
  treeNodes: [],
  expandedNodes: new Set<string>(),
  selectedPath: null as string | null,
  revealPath: null as string | null,
  revealNonce: 0,
  onToggleNode: vi.fn(),
  onSelectNode: vi.fn(),
  isDragging: false,
  onDragOver: vi.fn(),
  onDragLeave: vi.fn(),
  onDrop: vi.fn(),
  onFileSelect: vi.fn(),
  watchedRepos: [] as string[],
  onRemoveRepo: vi.fn(),
  onRefreshNode: vi.fn(),
  watchedPaths: [] as string[],
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
}

describe('MissionBrowserSidebar', () => {
  it('renders without errors', () => {
    const { container } = render(<MissionBrowserSidebar {...defaultProps} />)
    expect(container).toBeTruthy()
  })

  it('accepts selectedPath prop', () => {
    const { container } = render(
      <MissionBrowserSidebar {...defaultProps} selectedPath="missions/install" />,
    )
    expect(container).toBeTruthy()
  })

  it('does not call onSelectNode on initial render', () => {
    const onSelectNode = vi.fn()
    render(<MissionBrowserSidebar {...defaultProps} onSelectNode={onSelectNode} />)
    expect(onSelectNode).not.toHaveBeenCalled()
  })
})
