/**
 * ThemeSection Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render} from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('../../../../components/ui/StatusBadge', () => ({
  StatusBadge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../../../../lib/themes', () => ({
  themeGroups: [],
  getCustomThemes: () => [],
  removeCustomTheme: vi.fn(),
}))

vi.mock('../../../../lib/modals', () => ({
  ConfirmDialog: () => null,
}))

describe('ThemeSection', () => {
  it('exports ThemeSection', async () => {
    const mod = await import('../ThemeSection')
    expect(mod.ThemeSection).toBeDefined()
  })

  it('renders with props', async () => {
    const { ThemeSection } = await import('../ThemeSection')
    const theme = {
      id: 'dark',
      name: 'Dark',
      description: 'Dark mode',
      colors: {} as never,
      font: { family: "'Inter', sans-serif", size: '14px' },
    }
    const { container } = render(
      <ThemeSection
        themeId="dark"
        setTheme={vi.fn()}
        themes={[theme as never]}
        currentTheme={theme as never}
      />
    )
    expect(container).toBeTruthy()
  })
})
