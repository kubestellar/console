import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SecretDataTab } from './SecretDataTab.parts'

const MASK = '••••••••••••••••'
const MANY_KEYS = 7

type Props = Parameters<typeof SecretDataTab>[0]

function renderTab(overrides: Partial<Props> = {}) {
  const entries: [string, string][] = [['user', 'admin'], ['pass', 's3cret']]
  const props: Props = {
    dataEntries: entries,
    displayedData: entries,
    revealedKeys: new Set<string>(),
    copiedField: null,
    showAllData: false,
    onToggleReveal: vi.fn(),
    onCopy: vi.fn(),
    onToggleShowAll: vi.fn(),
    ...overrides,
  }
  render(<SecretDataTab {...props} />)
  return props
}

describe('SecretDataTab', () => {
  it('masks values by default', () => {
    renderTab()
    expect(screen.getAllByText(MASK)).toHaveLength(2)
    expect(screen.queryByText('admin')).not.toBeInTheDocument()
  })

  it('reveals only revealed keys', () => {
    renderTab({ revealedKeys: new Set(['user']) })
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.queryByText('s3cret')).not.toBeInTheDocument()
  })

  it('invokes reveal and copy handlers', () => {
    const props = renderTab()
    const [reveal, copy] = screen.getAllByRole('button')
    fireEvent.click(reveal)
    fireEvent.click(copy)
    expect(props.onToggleReveal).toHaveBeenCalledWith('user')
    expect(props.onCopy).toHaveBeenCalledWith('data-user', 'admin')
  })

  it('renders the empty state', () => {
    renderTab({ dataEntries: [], displayedData: [] })
    expect(screen.getByText('No data in this Secret')).toBeInTheDocument()
  })

  it('hides the show-all toggle for few keys', () => {
    renderTab()
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument()
  })

  it('toggles show all / show less for many keys', () => {
    const many: [string, string][] = Array.from({ length: MANY_KEYS }, (_, i) => [`k${i}`, `v${i}`])
    const props = renderTab({ dataEntries: many, displayedData: many })
    fireEvent.click(screen.getByText(`Show all ${MANY_KEYS} keys`))
    expect(props.onToggleShowAll).toHaveBeenCalled()
  })

  it('shows "Show less" when expanded', () => {
    const many: [string, string][] = Array.from({ length: MANY_KEYS }, (_, i) => [`k${i}`, `v${i}`])
    renderTab({ dataEntries: many, displayedData: many, showAllData: true })
    expect(screen.getByText('Show less')).toBeInTheDocument()
  })
})
