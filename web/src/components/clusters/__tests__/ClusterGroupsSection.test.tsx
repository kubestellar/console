/**
 * ClusterGroupsSection Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ClusterGroup } from '../../../hooks/useGlobalFilters'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

describe('ClusterGroupsSection', () => {
  it('exports ClusterGroupsSection component', async () => {
    const mod = await import('../ClusterGroupsSection')
    expect(mod.ClusterGroupsSection).toBeDefined()
    expect(typeof mod.ClusterGroupsSection).toBe('function')
  })

  // Regression test for #8916 — clicking the trash icon on a cluster group
  // must show a confirmation dialog instead of deleting immediately.
  it('does not invoke deleteClusterGroup until the user confirms (#8916)', async () => {
    const { ClusterGroupsSection } = await import('../ClusterGroupsSection')
    const deleteClusterGroup = vi.fn()
    const groups: ClusterGroup[] = [
      { id: 'grp-1', name: 'production', clusters: ['c1', 'c2'] },
    ]

    render(
      <ClusterGroupsSection
        clusters={[]}
        clusterGroups={groups}
        addClusterGroup={vi.fn()}
        deleteClusterGroup={deleteClusterGroup}
        selectClusterGroup={vi.fn()}
      />
    )

    // Section is collapsed by default — expand it.
    fireEvent.click(screen.getByText('clusters.groups.title'))

    // Click the delete (trash) button. It should open the confirm dialog,
    // NOT call deleteClusterGroup directly.
    const deleteButton = screen.getByTitle('cluster.deleteGroup')
    fireEvent.click(deleteButton)
    expect(deleteClusterGroup).not.toHaveBeenCalled()

    // Dialog shows the group name and confirm label — confirming fires the delete.
    const confirmButton = screen.getByText('actions.delete')
    fireEvent.click(confirmButton)
    expect(deleteClusterGroup).toHaveBeenCalledTimes(1)
    expect(deleteClusterGroup).toHaveBeenCalledWith('grp-1')
  })

  it('cancelling the confirm dialog does not delete the group (#8916)', async () => {
    const { ClusterGroupsSection } = await import('../ClusterGroupsSection')
    const deleteClusterGroup = vi.fn()
    const groups: ClusterGroup[] = [
      { id: 'grp-2', name: 'staging', clusters: ['c3'] },
    ]

    render(
      <ClusterGroupsSection
        clusters={[]}
        clusterGroups={groups}
        addClusterGroup={vi.fn()}
        deleteClusterGroup={deleteClusterGroup}
        selectClusterGroup={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('clusters.groups.title'))
    fireEvent.click(screen.getByTitle('cluster.deleteGroup'))

    // Clicking Cancel should close the dialog without calling delete.
    fireEvent.click(screen.getByText('actions.cancel'))
    expect(deleteClusterGroup).not.toHaveBeenCalled()
  })
})
