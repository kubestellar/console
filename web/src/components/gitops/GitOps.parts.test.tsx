import React from 'react'
/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TFunction } from 'i18next'

import { GitOpsIntegrationInfo } from './GitOps.parts'

// #22394/#22398: The integration panel previously rendered no-op <button>
// elements for "Configure ArgoCD" / "Configure Flux" with no onClick handler,
// which tripped the Auto-QA button/action consistency check. They must be
// real links to the official docs instead.
const translations: Record<string, string> = {
  'gitops.integrationTitle': 'GitOps Integration',
  'gitops.integrationDescription': 'GitOps integration description',
  'gitops.configureArgoCD': 'Configure ArgoCD',
  'gitops.configureFlux': 'Configure Flux',
}

const t = ((key: string) => translations[key] ?? key) as TFunction

describe('GitOpsIntegrationInfo', () => {
  it('renders ArgoCD and Flux actions as external links, not buttons', () => {
    render(<GitOpsIntegrationInfo t={t} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    const argoLink = screen.getByRole('link', { name: /Configure ArgoCD/i })
    expect(argoLink).toHaveAttribute('href', 'https://argo-cd.readthedocs.io/en/stable/')
    expect(argoLink).toHaveAttribute('target', '_blank')
    expect(argoLink).toHaveAttribute('rel', 'noopener noreferrer')

    const fluxLink = screen.getByRole('link', { name: /Configure Flux/i })
    expect(fluxLink).toHaveAttribute('href', 'https://fluxcd.io/flux/')
    expect(fluxLink).toHaveAttribute('target', '_blank')
    expect(fluxLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
