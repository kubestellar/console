import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock analytics to prevent side effects
vi.mock('../../lib/analytics', () => ({
  emitPageView: vi.fn(),
  emitWhiteLabelViewed: vi.fn(),
  emitWhiteLabelActioned: vi.fn(),
  emitWhiteLabelTabSwitch: vi.fn(),
  emitWhiteLabelCommandCopy: vi.fn(),
  emitInstallCommandCopied: vi.fn(),
}))

vi.mock('../../lib/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

import { FeatureInspektorGadget } from '../FeatureInspektorGadget'
import { FeatureKagent } from '../FeatureKagent'
import { WhiteLabel } from '../WhiteLabel'

// ---------------------------------------------------------------------------
// These tests verify that hardcoded slate color classes have been replaced
// with semantic design tokens (text-muted-foreground, border-border, bg-card,
// bg-secondary) for WCAG AA contrast compliance.
// ---------------------------------------------------------------------------

const BANNED_CLASSES = [
  'text-slate-300',
  'text-slate-400',
  'border-slate-600',
  'border-slate-700',
  'bg-slate-800',
  'bg-slate-900',
  'hover:bg-slate-800',
]

function getClassList(container: HTMLElement): string {
  const allElements = container.querySelectorAll('*')
  const classes: string[] = []
  allElements.forEach(el => {
    if (el.className && typeof el.className === 'string') {
      classes.push(el.className)
    }
  })
  return classes.join(' ')
}

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('Semantic color tokens — WCAG AA compliance', () => {
  describe('FeatureInspektorGadget', () => {
    it('does not use banned hardcoded slate color classes', () => {
      const { container } = renderInRouter(<FeatureInspektorGadget />)
      const allClasses = getClassList(container)

      for (const banned of BANNED_CLASSES) {
        expect(allClasses).not.toContain(banned)
      }
    })

    it('uses semantic text-muted-foreground class', () => {
      const { container } = renderInRouter(<FeatureInspektorGadget />)
      const muted = container.querySelectorAll('.text-muted-foreground')
      expect(muted.length).toBeGreaterThan(0)
    })

    it('uses semantic border-border class', () => {
      const { container } = renderInRouter(<FeatureInspektorGadget />)
      const allClasses = getClassList(container)
      expect(allClasses).toContain('border-border')
    })
  })

  describe('FeatureKagent', () => {
    it('does not use banned hardcoded slate color classes', () => {
      const { container } = renderInRouter(<FeatureKagent />)
      const allClasses = getClassList(container)

      for (const banned of BANNED_CLASSES) {
        expect(allClasses).not.toContain(banned)
      }
    })

    it('uses semantic text-muted-foreground class', () => {
      const { container } = renderInRouter(<FeatureKagent />)
      const muted = container.querySelectorAll('.text-muted-foreground')
      expect(muted.length).toBeGreaterThan(0)
    })

    it('uses semantic bg-card class for card backgrounds', () => {
      const { container } = renderInRouter(<FeatureKagent />)
      const allClasses = getClassList(container)
      expect(allClasses).toContain('bg-card')
    })
  })

  describe('WhiteLabel', () => {
    it('does not use banned hardcoded slate color classes', () => {
      const { container } = renderInRouter(<WhiteLabel />)
      const allClasses = getClassList(container)

      for (const banned of BANNED_CLASSES) {
        expect(allClasses).not.toContain(banned)
      }
    })

    it('uses semantic text-muted-foreground class', () => {
      const { container } = renderInRouter(<WhiteLabel />)
      const muted = container.querySelectorAll('.text-muted-foreground')
      expect(muted.length).toBeGreaterThan(0)
    })

    it('uses semantic bg-secondary class for table rows', () => {
      const { container } = renderInRouter(<WhiteLabel />)
      const allClasses = getClassList(container)
      expect(allClasses).toContain('bg-secondary')
    })
  })
})
