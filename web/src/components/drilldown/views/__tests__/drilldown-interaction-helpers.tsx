/**
 * Shared RTL helpers for drill-down interaction tests (#15406).
 */
import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { vi } from 'vitest'
import { DrillDownProvider } from '../../../../hooks/useDrillDown'

export const mockDrillToNamespace = vi.fn()
export const mockDrillToCluster = vi.fn()
export const mockDrillToPod = vi.fn()
export const mockDrillToDeployment = vi.fn()
export const mockDrillToService = vi.fn()
export const mockDrillDownClose = vi.fn()
export const mockStartMission = vi.fn()
export const mockRunKubectl = vi.fn()
export const mockRunHelm = vi.fn()

type TranslationOptions = { defaultValue?: string; [key: string]: unknown }

/** Standard i18n mock — keys by default; honors i18next positional or object defaults. */
export function mockUseTranslation() {
  return {
    t: (key: string, options?: string | TranslationOptions) => {
      if (typeof options === 'string') return options
      if (options && typeof options.defaultValue === 'string') return options.defaultValue
      return key
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }
}

export function renderWithDrillDown(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return <DrillDownProvider>{children}</DrillDownProvider>
  }
  return render(ui, { wrapper: Wrapper, ...options })
}
