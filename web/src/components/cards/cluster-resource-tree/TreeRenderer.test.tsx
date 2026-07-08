import React from 'react'
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Server } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { TreeNode } from './TreeRenderer'

describe('TreeNode', () => {
  it('renders and expands a tree node', () => {
    const toggleNode = vi.fn()
    const onClick = vi.fn()

    render(
      <TreeNode
        id="cluster-a"
        label="Cluster A"
        icon={Server}
        iconColor="text-blue-400"
        count={2}
        expandedNodes={new Set(['cluster-a'])}
        toggleNode={toggleNode}
        onClick={onClick}
      >
        <div>Child resource</div>
      </TreeNode>
    )

    expect(screen.getByText('Cluster A')).toBeInTheDocument()
    expect(screen.getByText('Child resource')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button')[0])
    expect(toggleNode).toHaveBeenCalledWith('cluster-a')
  })
})
