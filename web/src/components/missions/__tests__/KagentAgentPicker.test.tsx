import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string) => ({
      'kagentAgentPicker.noAgentsAvailable': 'No kagent agents available',
      'kagentAgentPicker.noAgentsGuidance': 'Install kagent and create Agent resources to make agents appear here.',
      'kagentAgentPicker.learnHowToAddAgents': 'Learn how to add agents',
      'kagentAgentPicker.selectAgent': 'Select agent...',
    }[key] ?? key),
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

import { KagentAgentPicker } from '../KagentAgentPicker'

describe('KagentAgentPicker', () => {
  it('renders guidance and docs link when no agents are available', () => {
    render(<KagentAgentPicker agents={[]} selectedAgent={null} onSelect={vi.fn()} />)

    expect(screen.getByText('No kagent agents available')).toBeInTheDocument()
    expect(screen.getByText('Install kagent and create Agent resources to make agents appear here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /learn how to add agents/i })).toHaveAttribute('href', 'https://kagent.dev/docs')
  })
})
