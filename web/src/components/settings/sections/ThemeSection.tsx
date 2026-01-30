import { useState } from 'react'
import { Moon, Sun, Check, Palette, ChevronDown } from 'lucide-react'
import type { Theme } from '../../../lib/themes'
import { themeGroups } from '../../../lib/themes'

interface ThemeSectionProps {
  themeId: string
  setTheme: (id: string) => void
  themes: Theme[]
  currentTheme: Theme
}

export function ThemeSection({ themeId, setTheme, themes, currentTheme }: ThemeSectionProps) {
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false)

  return (
    <div className="glass rounded-xl p-6 overflow-visible relative z-30" style={{ isolation: 'isolate' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
          <Palette className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-foreground">Appearance</h2>
          <p className="text-sm text-muted-foreground">Choose your theme - inspired by oh-my-zsh</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Current Theme Display */}
        <div className="p-4 rounded-lg bg-secondary/30 border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{currentTheme.name}</p>
              <p className="text-xs text-muted-foreground">{currentTheme.description}</p>
            </div>
            <div className="flex items-center gap-2">
              {currentTheme.dark ? (
                <Moon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Sun className="w-4 h-4 text-yellow-400" />
              )}
              {/* Color preview dots */}
              <div className="flex gap-1">
                <div
                  className="w-3 h-3 rounded-full border border-border"
                  style={{ backgroundColor: currentTheme.colors.brandPrimary }}
                />
                <div
                  className="w-3 h-3 rounded-full border border-border"
                  style={{ backgroundColor: currentTheme.colors.brandSecondary }}
                />
                <div
                  className="w-3 h-3 rounded-full border border-border"
                  style={{ backgroundColor: currentTheme.colors.brandTertiary }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Theme Selector Dropdown */}
        <div className="relative z-20">
          <label className="block text-sm text-muted-foreground mb-2">Select Theme</label>
          <button
            onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-secondary border border-border text-foreground hover:bg-secondary/80 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentTheme.colors.brandPrimary }}
                />
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentTheme.colors.brandSecondary }}
                />
              </div>
              <span>{currentTheme.name}</span>
              {currentTheme.author && (
                <span className="text-xs text-muted-foreground">by {currentTheme.author}</span>
              )}
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {themeDropdownOpen && (
            <div className="absolute z-[9999] mt-2 w-full max-h-[400px] overflow-y-auto rounded-lg bg-card border border-border shadow-xl" style={{ transform: 'translateZ(0)' }}>
              {themeGroups.map((group) => (
                <div key={group.name}>
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-secondary/50 sticky top-0">
                    {group.name}
                  </div>
                  {group.themes.map((tid) => {
                    const t = themes.find((th) => th.id === tid)
                    if (!t) return null
                    const isSelected = themeId === tid
                    return (
                      <button
                        key={tid}
                        onClick={() => {
                          setTheme(tid)
                          setThemeDropdownOpen(false)
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors ${
                          isSelected ? 'bg-primary/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            <div
                              className="w-3 h-3 rounded-full border border-border/50"
                              style={{ backgroundColor: t.colors.brandPrimary }}
                            />
                            <div
                              className="w-3 h-3 rounded-full border border-border/50"
                              style={{ backgroundColor: t.colors.brandSecondary }}
                            />
                            <div
                              className="w-3 h-3 rounded-full border border-border/50"
                              style={{ backgroundColor: t.colors.brandTertiary }}
                            />
                          </div>
                          <div className="text-left">
                            <p className={`text-sm ${isSelected ? 'text-primary font-medium' : 'text-foreground'}`}>
                              {t.name}
                            </p>
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {t.dark ? (
                            <Moon className="w-3 h-3 text-muted-foreground" />
                          ) : (
                            <Sun className="w-3 h-3 text-yellow-400" />
                          )}
                          {isSelected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Theme Buttons */}
        <div>
          <label className="block text-sm text-muted-foreground mb-2">Quick Select</label>
          <div className="grid grid-cols-4 gap-2">
            {['kubestellar', 'batman', 'dracula', 'nord', 'tokyo-night', 'cyberpunk', 'matrix', 'kubestellar-light'].map((tid) => {
              const t = themes.find((th) => th.id === tid)
              if (!t) return null
              const isSelected = themeId === tid
              return (
                <button
                  key={tid}
                  onClick={() => setTheme(tid)}
                  title={t.description}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-secondary/30'
                  }`}
                >
                  <div className="flex gap-0.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: t.colors.brandPrimary }}
                    />
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: t.colors.brandSecondary }}
                    />
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: t.colors.brandTertiary }}
                    />
                  </div>
                  <span className={`text-xs ${isSelected ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    {t.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Theme Features */}
        <div className="flex flex-wrap gap-2 pt-2">
          {currentTheme.starField && (
            <span className="px-2 py-1 text-xs rounded bg-purple-500/20 text-purple-400">
              ✨ Star Field
            </span>
          )}
          {currentTheme.glowEffects && (
            <span className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400">
              💫 Glow Effects
            </span>
          )}
          {currentTheme.gradientAccents && (
            <span className="px-2 py-1 text-xs rounded bg-pink-500/20 text-pink-400">
              🌈 Gradients
            </span>
          )}
          <span className="px-2 py-1 text-xs rounded bg-secondary text-muted-foreground">
            Font: {currentTheme.font.family.split(',')[0].replace(/'/g, '')}
          </span>
        </div>
      </div>
    </div>
  )
}
