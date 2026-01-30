import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Check } from 'lucide-react'
import { languages } from '../../../lib/i18n'
import { cn } from '../../../lib/cn'

export function LanguageSelector() {
  const { i18n } = useTranslation()
  const [showLanguageMenu, setShowLanguageMenu] = useState(false)
  const languageRef = useRef<HTMLDivElement>(null)

  const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0]

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode)
    setShowLanguageMenu(false)
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageRef.current && !languageRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={languageRef}>
      <button
        onClick={() => setShowLanguageMenu(!showLanguageMenu)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
        title={currentLanguage.name}
      >
        <Globe className="w-4 h-4" />
        <span className="text-xs font-medium hidden sm:inline">{currentLanguage.flag}</span>
      </button>

      {/* Language dropdown */}
      {showLanguageMenu && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-lg shadow-xl py-1 z-50">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                i18n.language === lang.code
                  ? 'bg-purple-500/20 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              )}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="text-sm">{lang.name}</span>
              {i18n.language === lang.code && (
                <Check className="w-4 h-4 ml-auto text-purple-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
