/**
 * DirectoryListing unit tests
 *
 * Covers: list/grid view modes, file/directory rendering, and interaction callbacks.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DirectoryListing } from '../DirectoryListing'
import type { BrowseEntry } from '../../../../lib/missions/types'

const mockEntries: BrowseEntry[] = [
  {
    name: 'configs',
    path: '/root/configs',
    type: 'directory',
  },
  {
    name: 'mission.yaml',
    path: '/root/mission.yaml',
    type: 'file',
    size: 1024,
  },
  {
    name: 'README.md',
    path: '/root/README.md',
    type: 'file',
    size: 512,
    description: 'Documentation file',
  },
]

describe('DirectoryListing', () => {
  it('renders entries in list view mode', () => {
    const onSelect = vi.fn()

    render(
      <DirectoryListing
        entries={mockEntries}
        viewMode="list"
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('configs')).toBeInTheDocument()
    expect(screen.getByText('mission.yaml')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('renders entries in grid view mode', () => {
    const onSelect = vi.fn()

    render(
      <DirectoryListing
        entries={mockEntries}
        viewMode="grid"
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('configs')).toBeInTheDocument()
    expect(screen.getByText('mission.yaml')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('calls onSelect when an entry is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <DirectoryListing
        entries={mockEntries}
        viewMode="list"
        onSelect={onSelect}
      />
    )

    const entry = screen.getByText('mission.yaml')
    await user.click(entry)

    expect(onSelect).toHaveBeenCalledWith(mockEntries[1])
  })

  it('displays file sizes when provided', () => {
    const onSelect = vi.fn()

    render(
      <DirectoryListing
        entries={mockEntries}
        viewMode="list"
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('1.00 KB')).toBeInTheDocument()
    expect(screen.getByText('512 B')).toBeInTheDocument()
  })

  it('displays file descriptions when provided', () => {
    const onSelect = vi.fn()

    render(
      <DirectoryListing
        entries={mockEntries}
        viewMode="list"
        onSelect={onSelect}
      />
    )

    expect(screen.getByText('Documentation file')).toBeInTheDocument()
  })

  it('renders import button for files when onImport is provided', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <DirectoryListing
        entries={mockEntries}
        viewMode="list"
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    const importButtons = screen.getAllByTitle('Import mission')
    expect(importButtons).toHaveLength(2) // Two files in mockEntries
  })

  it('calls onImport when import button is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <DirectoryListing
        entries={mockEntries}
        viewMode="list"
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    const importButtons = screen.getAllByTitle('Import mission')
    await user.click(importButtons[0])

    expect(onImport).toHaveBeenCalledWith(mockEntries[1])
    expect(onSelect).not.toHaveBeenCalled() // Stop propagation works
  })

  it('does not render import button for directories', () => {
    const onSelect = vi.fn()
    const onImport = vi.fn()

    render(
      <DirectoryListing
        entries={[mockEntries[0]]} // Only directory
        viewMode="list"
        onSelect={onSelect}
        onImport={onImport}
      />
    )

    expect(screen.queryByTitle('Import mission')).not.toBeInTheDocument()
  })
})
