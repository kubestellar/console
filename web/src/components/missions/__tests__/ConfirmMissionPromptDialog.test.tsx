import type React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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

vi.mock('../../../hooks/useLocalAgent', () => ({
  useLocalAgent: () => ({ status: 'connected' }),
}))

const runToolPreflightCheckMock = vi.fn()
vi.mock('../../../lib/missions/preflightCheck', () => ({
  resolveRequiredTools: (missionType?: string) => missionType === 'deploy' ? ['kubectl', 'helm'] : [],
  runToolPreflightCheck: (...args: unknown[]) => runToolPreflightCheckMock(...args),
}))

vi.mock('../../../hooks/mcp/agentFetch', () => ({
  agentFetch: vi.fn(),
}))

import { ConfirmMissionPromptDialog } from '../ConfirmMissionPromptDialog'

describe('ConfirmMissionPromptDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a ready notice and keeps Run mission enabled when tools are present', async () => {
    runToolPreflightCheckMock.mockResolvedValue({
      ok: true,
      tools: [
        { name: 'kubectl', installed: true, version: 'v1.31.0' },
        { name: 'helm', installed: true, version: 'v3.16.0' },
      ],
    })

    render(
      <ConfirmMissionPromptDialog
        open
        missionTitle="Install live data"
        missionDescription="Install live data components"
        initialPrompt="Install the missing components"
        missionType="deploy"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Local tools ready')).toBeInTheDocument()
    })

    expect(screen.getByText('Required local tools detected: kubectl, helm.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run mission' })).toBeEnabled()
  })

  it('disables Run mission and shows install guidance when required tools are missing', async () => {
    runToolPreflightCheckMock.mockResolvedValue({
      ok: false,
      error: {
        code: 'MISSING_TOOLS',
        message: 'Required tools not found: kubectl, helm',
        details: { missingTools: ['kubectl', 'helm'] },
      },
    })

    render(
      <ConfirmMissionPromptDialog
        open
        missionTitle="Install live data"
        missionDescription="Install live data components"
        initialPrompt="Install the missing components"
        missionType="deploy"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('Checking for required local tools…')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Install local tools before running')).toBeInTheDocument()
    })

    expect(screen.getByText('This mission requires kubectl, helm to be installed locally before it can run.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run mission' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Install kubectl' })).toHaveAttribute('href', 'https://kubernetes.io/docs/tasks/tools/')
    expect(screen.getByRole('link', { name: 'Install helm' })).toHaveAttribute('href', 'https://helm.sh/docs/intro/install/')
  })

  it('keeps Run mission enabled when missing tools are warnings only', async () => {
    runToolPreflightCheckMock.mockResolvedValue({
      ok: false,
      error: {
        code: 'MISSING_TOOLS',
        message: 'Required tools not found: kubectl',
        details: { missingTools: ['kubectl'] },
      },
    })

    render(
      <ConfirmMissionPromptDialog
        open
        missionTitle="Create cluster"
        missionDescription="Bootstrap a cluster"
        initialPrompt="Create a cluster"
        missionType="deploy"
        missionContext={{ allowMissingLocalTools: true }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Local tools recommended')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Run mission' })).toBeEnabled()
  })
})
