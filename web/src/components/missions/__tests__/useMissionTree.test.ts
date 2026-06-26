import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { TreeNode } from '../browser'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockFetchTreeChildren, mockGetKubaraConfig, mockIsDemoMode } = vi.hoisted(() => ({
  mockFetchTreeChildren: vi.fn<() => Promise<TreeNode[]>>(),
  mockGetKubaraConfig: vi.fn(),
  mockIsDemoMode: vi.fn(() => false),
}))

vi.mock('../../../lib/demoMode', () => ({
  isDemoMode: mockIsDemoMode,
}))

// Full mock — avoids loading React components (VirtualizedMissionGrid / TreeNodeItem)
// that import @tanstack/react-virtual, causing OOM in jsdom.
// Inline pure tree helpers so state mutations work correctly.
vi.mock('../browser', () => {
  function updateNodeInTree(nodes: TreeNode[], nodeId: string, updates: Partial<TreeNode>): TreeNode[] {
    return nodes.map((node) => {
      if (node.id === nodeId) return { ...node, ...updates }
      if (node.children) return { ...node, children: updateNodeInTree(node.children, nodeId, updates) }
      return node
    })
  }
  function removeNodeFromTree(nodes: TreeNode[], nodeId: string): TreeNode[] {
    return nodes
      .filter((n) => n.id !== nodeId)
      .map((n) => n.children ? { ...n, children: removeNodeFromTree(n.children, nodeId) } : n)
  }
  return {
    updateNodeInTree,
    removeNodeFromTree,
    fetchTreeChildren: mockFetchTreeChildren,
    getKubaraConfig: mockGetKubaraConfig,
  }
})

import { useMissionTree } from '../useMissionTree'

const KUBARA_CFG = {
  repoOwner: 'kubara-io',
  repoName: 'kubara',
  catalogPath: 'go-binary/templates/embedded/managed-service-catalog/helm',
}

const DEFAULT_PROPS = {
  isOpen: true,
  isAuthenticated: false,
  user: null as unknown,
  watchedRepos: [] as string[],
  watchedPaths: [] as string[],
}

const CHILD_NODE: TreeNode = {
  id: 'community/fixes/dns',
  name: 'dns',
  path: 'fixes/dns',
  type: 'directory',
  source: 'community',
  loaded: false,
}

async function renderTree(props = DEFAULT_PROPS) {
  const rendered = renderHook(() => useMissionTree(props))
  // Flush all microtasks (effects + getKubaraConfig().then()) to avoid act() warnings
  await act(async () => {})
  return rendered
}

describe('useMissionTree', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetKubaraConfig.mockResolvedValue(KUBARA_CFG)
    mockFetchTreeChildren.mockResolvedValue([])
  })

  // ── Initial state (isOpen=false) ───────────────────────────────────────────

  it('starts with null selectedPath', async () => {
    const { result } = await renderTree({ ...DEFAULT_PROPS, isOpen: false })
    expect(result.current.selectedPath).toBeNull()
  })

  it('starts with empty expandedNodes set', async () => {
    const { result } = await renderTree({ ...DEFAULT_PROPS, isOpen: false })
    expect(result.current.expandedNodes.size).toBe(0)
  })

  it('selectedTreeNode is null when selectedPath is null', async () => {
    const { result } = await renderTree({ ...DEFAULT_PROPS, isOpen: false })
    expect(result.current.selectedTreeNode).toBeNull()
  })

  it('does not build tree when isOpen=false', async () => {
    const { result } = await renderTree({ ...DEFAULT_PROPS, isOpen: false })
    expect(result.current.treeNodes).toHaveLength(0)
  })

  // ── Tree initialization ────────────────────────────────────────────────────

  it('creates community root node when isOpen=true', async () => {
    const { result } = await renderTree()
    expect(result.current.treeNodes.map((n) => n.id)).toContain('community')
  })

  it('creates kubara root node when isOpen=true', async () => {
    const { result } = await renderTree()
    expect(result.current.treeNodes.map((n) => n.id)).toContain('kubara')
  })

  it('creates local root node when isOpen=true', async () => {
    const { result } = await renderTree()
    expect(result.current.treeNodes.map((n) => n.id)).toContain('local')
  })

  it('does NOT create github node when not authenticated', async () => {
    const { result } = await renderTree({ ...DEFAULT_PROPS, isAuthenticated: false })
    expect(result.current.treeNodes.map((n) => n.id)).not.toContain('github')
  })

  it('creates github node when authenticated with a user', async () => {
    const { result } = await renderTree({
      ...DEFAULT_PROPS,
      isAuthenticated: true,
      user: { login: 'testuser' },
      watchedRepos: ['org/repo'],
    })
    expect(result.current.treeNodes.map((n) => n.id)).toContain('github')
  })

  it('populates github children from watchedRepos', async () => {
    const { result } = await renderTree({
      ...DEFAULT_PROPS,
      isAuthenticated: true,
      user: { login: 'testuser' },
      watchedRepos: ['org/repo-a', 'org/repo-b'],
    })
    const github = result.current.treeNodes.find((n) => n.id === 'github')
    expect(github?.children).toHaveLength(2)
  })

  it('populates local children from watchedPaths', async () => {
    const { result } = await renderTree({
      ...DEFAULT_PROPS,
      watchedPaths: ['/tmp/missions', '/home/user/missions'],
    })
    const local = result.current.treeNodes.find((n) => n.id === 'local')
    expect(local?.children).toHaveLength(2)
  })

  it('re-initializes tree when isOpen transitions from false to true', async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useMissionTree({ ...DEFAULT_PROPS, isOpen: open }),
      { initialProps: { open: false } },
    )
    expect(result.current.treeNodes).toHaveLength(0)
    await act(async () => { rerender({ open: true }) })
    expect(result.current.treeNodes.length).toBeGreaterThan(0)
  })

  // ── getKubaraConfig ────────────────────────────────────────────────────────

  it('calls getKubaraConfig when isOpen=true', async () => {
    await renderTree()
    expect(mockGetKubaraConfig).toHaveBeenCalledTimes(1)
  })

  it('updates kubara node path from getKubaraConfig result', async () => {
    mockGetKubaraConfig.mockResolvedValue({ ...KUBARA_CFG, catalogPath: 'charts/helm' })
    const { result } = await renderTree()
    const kubara = result.current.treeNodes.find((n) => n.id === 'kubara')
    expect(kubara?.path).toBe('charts/helm')
  })

  // ── toggleNode ─────────────────────────────────────────────────────────────

  it('toggleNode adds node to expandedNodes', async () => {
    mockFetchTreeChildren.mockResolvedValue([CHILD_NODE])
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })

    expect(result.current.expandedNodes.has('community')).toBe(true)
  })

  it('toggleNode collapses an already-expanded node', async () => {
    mockFetchTreeChildren.mockResolvedValue([CHILD_NODE])
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })
    await act(async () => { await result.current.toggleNode(community) })

    expect(result.current.expandedNodes.has('community')).toBe(false)
  })

  it('calls fetchTreeChildren when expanding unloaded node', async () => {
    mockFetchTreeChildren.mockResolvedValue([CHILD_NODE])
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })

    expect(mockFetchTreeChildren).toHaveBeenCalledWith(community)
  })

  it('does not re-fetch on second expand (node already loaded)', async () => {
    mockFetchTreeChildren.mockResolvedValue([CHILD_NODE])
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })
    await act(async () => { await result.current.toggleNode(community) })
    const reloaded = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(reloaded) })

    expect(mockFetchTreeChildren).toHaveBeenCalledTimes(1)
  })

  it('node gets children and loaded=true after successful fetchTreeChildren', async () => {
    mockFetchTreeChildren.mockResolvedValue([CHILD_NODE])
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })

    const updated = result.current.treeNodes.find((n) => n.id === 'community')
    expect(updated?.children).toHaveLength(1)
    expect(updated?.loaded).toBe(true)
  })

  // ── expandNode error handling ───────────────────────────────────────────────

  it('sets error description on node when fetchTreeChildren throws', async () => {
    mockFetchTreeChildren.mockRejectedValue(new Error('network error'))
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })

    const updated = result.current.treeNodes.find((n) => n.id === 'community')
    expect(updated?.description).toContain('Failed to load')
    expect(updated?.loaded).toBe(true)
  })

  // ── refreshNode ────────────────────────────────────────────────────────────

  it('refreshNode resets node to unloaded state', async () => {
    mockFetchTreeChildren.mockResolvedValue([CHILD_NODE])
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })
    expect(result.current.treeNodes.find((n) => n.id === 'community')?.loaded).toBe(true)

    act(() => {
      result.current.refreshNode(result.current.treeNodes.find((n) => n.id === 'community')!)
    })

    expect(result.current.treeNodes.find((n) => n.id === 'community')?.loaded).toBe(false)
  })

  it('refreshNode removes node from expandedNodes', async () => {
    mockFetchTreeChildren.mockResolvedValue([CHILD_NODE])
    const { result } = await renderTree()

    const community = result.current.treeNodes.find((n) => n.id === 'community')!
    await act(async () => { await result.current.toggleNode(community) })
    expect(result.current.expandedNodes.has('community')).toBe(true)

    act(() => {
      result.current.refreshNode(result.current.treeNodes.find((n) => n.id === 'community')!)
    })

    expect(result.current.expandedNodes.has('community')).toBe(false)
  })

  // ── addLocalNode ───────────────────────────────────────────────────────────

  it('addLocalNode adds node to the local tree children', async () => {
    const { result } = await renderTree()

    const newNode: TreeNode = {
      id: 'local/custom', name: 'custom', path: '/tmp/custom',
      type: 'directory', source: 'local', loaded: true,
    }
    act(() => { result.current.addLocalNode(newNode) })

    const local = result.current.treeNodes.find((n) => n.id === 'local')
    expect(local?.children?.some((c) => c.id === 'local/custom')).toBe(true)
  })

  it('addLocalNode expands the local root node', async () => {
    const { result } = await renderTree()

    const newNode: TreeNode = {
      id: 'local/custom', name: 'custom', path: '/tmp/custom',
      type: 'directory', source: 'local', loaded: true,
    }
    act(() => { result.current.addLocalNode(newNode) })

    expect(result.current.expandedNodes.has('local')).toBe(true)
  })

  it('addLocalNode sets selectedPath to the new node id', async () => {
    const { result } = await renderTree()

    const newNode: TreeNode = {
      id: 'local/custom', name: 'custom', path: '/tmp/custom',
      type: 'directory', source: 'local', loaded: true,
    }
    act(() => { result.current.addLocalNode(newNode) })

    expect(result.current.selectedPath).toBe('local/custom')
  })

  it('addLocalNode deduplicates — same id added twice results in one entry', async () => {
    const { result } = await renderTree()

    const node: TreeNode = {
      id: 'local/dup', name: 'dup', path: '/tmp/dup',
      type: 'directory', source: 'local', loaded: true,
    }
    act(() => { result.current.addLocalNode(node) })
    act(() => { result.current.addLocalNode(node) })

    const local = result.current.treeNodes.find((n) => n.id === 'local')
    const dups = local?.children?.filter((c) => c.id === 'local/dup') ?? []
    expect(dups).toHaveLength(1)
  })

  // ── selectedTreeNode ────────────────────────────────────────────────────────

  it('selectedTreeNode is null when selectedPath is null', async () => {
    const { result } = await renderTree()
    expect(result.current.selectedTreeNode).toBeNull()
  })

  it('selectedTreeNode returns the node matching selectedPath', async () => {
    const { result } = await renderTree()
    act(() => { result.current.setSelectedPath('community') })
    expect(result.current.selectedTreeNode?.id).toBe('community')
  })

  it('setSelectedPath updates selectedPath state', async () => {
    const { result } = await renderTree()
    act(() => { result.current.setSelectedPath('kubara') })
    expect(result.current.selectedPath).toBe('kubara')
  })
})
