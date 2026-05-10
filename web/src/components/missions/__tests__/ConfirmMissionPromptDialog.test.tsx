import type React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown> | string) => {
      if (typeof opts === 'string') return opts
      if (opts && typeof opts.defaultValue === 'string') {
        let value = opts.defaultValue
        for (const [name, replacement] of Object.entries(opts)) {
          if (name !== 'defaultValue') {
            value = value.replace(`{{${name}}}`, String(replacement))
          }
        }
        return value
      }
      return key
    },
  }),
}))

vi.mock('../../../lib/modals/BaseModal', () => ({
  BaseModal: Object.assign(
    ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    {
      Header: ({ title, description, onClose }: { title: string; description?: string; onClose?: () => void }) => (
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
          {onClose && <button onClick={onClose}>close</button>}
        </div>
      ),
      Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      Footer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    },
  ),
}))

vi.mock('../../ui/Button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

vi.mock('../../ui/TextArea', () => ({
  TextArea: ({ children, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props}>{children}</textarea>,
}))

import { ConfirmMissionPromptDialog } from '../ConfirmMissionPromptDialog'

describe('ConfirmMissionPromptDialog', () => {
  it('shows the review copy, mission details, and editable prompt', () => {
    render(
      <ConfirmMissionPromptDialog
        open
        missionTitle="Install live data"
        missionDescription="Install live data components"
        initialPrompt="Install the missing components"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Review AI mission prompt')).toBeInTheDocument()
    expect(screen.getByText('Install live data')).toBeInTheDocument()
    expect(screen.getByText('Install live data components')).toBeInTheDocument()
    expect(screen.getByLabelText('Prompt sent to the AI agent')).toHaveValue('Install the missing components')
    expect(screen.getByRole('button', { name: 'Run mission' })).toBeEnabled()
  })

  it('disables Run mission and shows validation when the prompt is blank', () => {
    render(
      <ConfirmMissionPromptDialog
        open
        missionTitle="Create cluster"
        initialPrompt="Create a cluster"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Prompt sent to the AI agent'), {
      target: { value: '   ' },
    })

    expect(screen.getByText('Prompt cannot be empty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run mission' })).toBeDisabled()
  })

  it('submits the edited prompt when Run mission is clicked', () => {
    const onConfirm = vi.fn()

    render(
      <ConfirmMissionPromptDialog
        open
        missionTitle="Create cluster"
        initialPrompt="Create a cluster"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.change(screen.getByLabelText('Prompt sent to the AI agent'), {
      target: { value: 'Create a production cluster' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run mission' }))

    expect(onConfirm).toHaveBeenCalledWith('Create a production cluster')
  })
})
