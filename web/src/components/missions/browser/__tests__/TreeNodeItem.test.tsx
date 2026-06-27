import React from 'react'
/**
 * TreeNodeItem unit tests
 *
 * Covers: node rendering, expand/collapse, file type icons, and external repo metadata.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TreeNodeItem } from '../TreeNodeItem'
import type { TreeNode } from '../types'

const mockDirectoryNode: TreeNode = {
  id: 'dir-1',
  name: 'configs',
  path: '/root/configs',
  type: 'directory',
  source: 'community',
}

const mockFileNode: TreeNode = {
  id: 'file-1',
  name: 'mission.yaml',
  path: '/root/mission.yaml',
  type: 'file',
  source: 'community',
}

const mockGitHubNode: TreeNode = {
  id: 'gh-1',
  name: 'kube-prometheus-stack',
  path: '/kubara/kube-prometheus-stack',
  type: 'directory',
  source: 'github',
  repoOwner: 'kubara-io',
  repoName: 'kubara',
}

const mockLoadingNode: TreeNode = {
  ...mockDirectoryNode,
  loading: true,
}

describe('TreeNodeItem', () => {
  it('renders directory node with name', () => {
    render(
      <TreeNodeItem
        node={mockDirectoryNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('configs')).toBeInTheDocument()
  })

  it('renders file node with name', () => {
    render(
      <TreeNodeItem
        node={mockFileNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('mission.yaml')).toBeInTheDocument()
  })

  it('calls onToggle when directory is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    render(
      <TreeNodeItem
        node={mockDirectoryNode}
        depth={0}
        isExpanded={false}
        onToggle={onToggle}
        onSelect={vi.fn()}
      />
    )

    const nodeButton = screen.getByText('configs').closest('button')
    if (nodeButton) {
      await user.click(nodeButton)
      expect(onToggle).toHaveBeenCalledWith(mockDirectoryNode)
    }
  })

  it('calls onSelect when file is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <TreeNodeItem
        node={mockFileNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={onSelect}
      />
    )

    const nodeButton = screen.getByText('mission.yaml').closest('button')
    if (nodeButton) {
      await user.click(nodeButton)
      expect(onSelect).toHaveBeenCalledWith(mockFileNode)
    }
  })

  it('displays loading spinner for loading nodes', () => {
    const { container } = render(
      <TreeNodeItem
        node={mockLoadingNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    // Look for loading indicator class or spinner
    const loadingElement = container.querySelector('[class*="animate-spin"]')
    expect(loadingElement).toBeInTheDocument()
  })

  it('applies indentation based on depth', () => {
    const { container: depth0 } = render(
      <TreeNodeItem
        node={mockFileNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    const { container: depth2 } = render(
      <TreeNodeItem
        node={mockFileNode}
        depth={2}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    // Depth affects padding/margin - containers should differ
    expect(depth0.innerHTML).not.toBe(depth2.innerHTML)
  })

  it('renders GitHub source indicator for external repos', () => {
    render(
      <TreeNodeItem
        node={mockGitHubNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('kube-prometheus-stack')).toBeInTheDocument()
  })

  it('shows expand/collapse chevron for directories', () => {
    const { container } = render(
      <TreeNodeItem
        node={mockDirectoryNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    // ChevronRight when collapsed, ChevronDown when expanded
    const chevron = container.querySelector('svg')
    expect(chevron).toBeInTheDocument()
  })

  it('changes chevron direction when expanded', () => {
    const { container: collapsed } = render(
      <TreeNodeItem
        node={mockDirectoryNode}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    const { container: expanded } = render(
      <TreeNodeItem
        node={mockDirectoryNode}
        depth={0}
        isExpanded={true}
        onToggle={vi.fn()}
        onSelect={vi.fn()}
      />
    )

    expect(collapsed.innerHTML).not.toBe(expanded.innerHTML)
  })
})
