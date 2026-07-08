import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import { InstallStepCard, type InstallStep } from './InstallStepCard'

function makeStep(readTitle: () => void): InstallStep {
  return {
    step: 1,
    get title() {
      readTitle()
      return 'Install and run'
    },
    commands: ['echo hello'],
    description: 'Downloads the console',
  } as InstallStep
}

describe('InstallStepCard', () => {
  it('skips rerendering when parent updates with identical props', () => {
    const readTitle = vi.fn()
    const step = makeStep(readTitle)
    const onCopy = vi.fn()

    const { rerender } = render(
      <InstallStepCard
        step={step}
        copyKey="step-1"
        isCopied={false}
        onCopy={onCopy}
        accentColor="purple"
        variant="linear"
      />,
    )

    expect(readTitle).toHaveBeenCalledTimes(1)

    rerender(
      <InstallStepCard
        step={step}
        copyKey="step-1"
        isCopied={false}
        onCopy={onCopy}
        accentColor="purple"
        variant="linear"
      />,
    )

    expect(readTitle).toHaveBeenCalledTimes(1)
  })

  it('rerenders when copied state changes so feedback can update', () => {
    const readTitle = vi.fn()
    const step = makeStep(readTitle)
    const onCopy = vi.fn()

    const { rerender, container } = render(
      <InstallStepCard
        step={step}
        copyKey="step-1"
        isCopied={false}
        onCopy={onCopy}
        accentColor="purple"
        variant="linear"
      />,
    )

    expect(readTitle).toHaveBeenCalledTimes(1)
    expect(container.querySelector('svg.text-green-400')).toBeNull()

    rerender(
      <InstallStepCard
        step={step}
        copyKey="step-1"
        isCopied
        onCopy={onCopy}
        accentColor="purple"
        variant="linear"
      />,
    )

    expect(readTitle).toHaveBeenCalledTimes(2)
    expect(container.querySelector('svg.text-green-400')).not.toBeNull()
  })
})
