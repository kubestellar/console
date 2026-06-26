import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ClusterSelect } from './ClusterSelect'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('ClusterSelect', () => {
  it('exports ClusterSelect component', () => {
    expect(ClusterSelect).toBeDefined()
    expect(typeof ClusterSelect).toBe('function')
  })

  it('supports keyboard navigation through options', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <ClusterSelect
        clusters={[{ name: 'alpha' }, { name: 'beta' }]}
        value=""
        onChange={onChange}
        placeholder="Select cluster..."
      />
    )

    const trigger = screen.getByRole('button', { name: /select cluster/i })
    trigger.focus()
    await user.keyboard('{ArrowDown}')

    expect(await screen.findByRole('option', { name: /select cluster/i })).toHaveFocus()

    await user.keyboard('{End}')
    expect(screen.getByRole('option', { name: /beta/i })).toHaveFocus()

    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('beta')
    })
  })
})
