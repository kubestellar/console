import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { InstallStepCard, type InstallStep } from '../InstallStepCard'

const STEP: InstallStep = {
  step: 1,
  title: 'Install CLI',
  commands: ['curl -sL https://example.com | bash', 'ks version'],
  note: 'Requires bash 4+',
  description: 'Downloads and installs the KubeStellar CLI.',
}

const STEP_NO_CMD: InstallStep = {
  step: 2,
  title: 'Configure',
  description: 'Edit your config file.',
}

describe('InstallStepCard', () => {
  const defaultProps = {
    step: STEP,
    copyKey: 'localhost-1',
    isCopied: false,
    onCopy: vi.fn(),
    accentColor: 'purple' as const,
  }

  it('renders step number and title', () => {
    render(<InstallStepCard {...defaultProps} />)
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('Install CLI')).toBeTruthy()
  })

  it('renders commands in a pre block', () => {
    const { container } = render(<InstallStepCard {...defaultProps} />)
    expect(container.querySelector('pre')).toBeTruthy()
  })

  it('renders note', () => {
    render(<InstallStepCard {...defaultProps} />)
    expect(screen.getByText('Requires bash 4+')).toBeTruthy()
  })

  it('renders description', () => {
    render(<InstallStepCard {...defaultProps} />)
    expect(screen.getByText('Downloads and installs the KubeStellar CLI.')).toBeTruthy()
  })

  it('calls onCopy with commands and step number when copy clicked', () => {
    const onCopy = vi.fn()
    const { container } = render(
      <InstallStepCard {...defaultProps} onCopy={onCopy} />,
    )
    const copyBtn = container.querySelector('button')
    expect(copyBtn).toBeTruthy()
    fireEvent.click(copyBtn!)
    expect(onCopy).toHaveBeenCalledWith(STEP.commands, 1)
  })

  it('shows check icon when isCopied is true', () => {
    const { container } = render(
      <InstallStepCard {...defaultProps} isCopied={true} />,
    )
    // Check icon has a different className than Copy icon
    expect(container.querySelector('.text-green-400')).toBeTruthy()
  })

  it('renders without commands gracefully', () => {
    const { container } = render(
      <InstallStepCard {...defaultProps} step={STEP_NO_CMD} />,
    )
    expect(container.querySelector('pre')).toBeNull()
    expect(screen.getByText('Edit your config file.')).toBeTruthy()
  })

  it('renders linear variant', () => {
    const { container } = render(
      <InstallStepCard {...defaultProps} variant="linear" />,
    )
    expect(container.querySelector('pre')).toBeTruthy()
    expect(screen.getByText('Install CLI')).toBeTruthy()
  })

  it('renders linear variant without commands', () => {
    const { container } = render(
      <InstallStepCard {...defaultProps} step={STEP_NO_CMD} variant="linear" />,
    )
    expect(container.querySelector('pre')).toBeNull()
  })

  it('applies teal accent classes', () => {
    const { container } = render(
      <InstallStepCard {...defaultProps} accentColor="teal" />,
    )
    expect(container.innerHTML).toContain('teal')
  })
})
