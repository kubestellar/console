import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AutonomousBanner } from '../AutonomousBanner'
import { STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED } from '../../../lib/constants/storage'

describe('AutonomousBanner', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders live links for desktop and mobile viewers', () => {
    render(<AutonomousBanner onDismiss={vi.fn()} />)

    const links = screen.getAllByRole('link')

    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', 'https://kubestellar.io/live/hive')
    expect(links[1]).toHaveAttribute('href', 'https://kubestellar.io/live/hive')
  })

  it('dismisses the banner and persists the dismissal flag', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<AutonomousBanner onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'buttons.dismissBanner' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(STORAGE_KEY_AUTONOMOUS_BANNER_DISMISSED)).toBe('true')
  })
})
