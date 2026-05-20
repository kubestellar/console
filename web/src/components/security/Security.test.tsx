import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Security } from './Security'

vi.mock('./SecurityPage', () => ({
  SecurityPage: () => <div>Security page shell</div>,
}))

describe('Security', () => {
  it('renders the security page shell', () => {
    render(<Security />)

    expect(screen.getByText('Security page shell')).toBeTruthy()
  })
})
