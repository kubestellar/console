import { useEffect, useState } from 'react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { languages } from '../../lib/i18n'

interface OrgSwitcherProps {
  activeLanguageCode: string
  currentLanguage: (typeof languages)[number]
  onLanguageChange: (langCode: string) => void
  isOpen: boolean
  languageLabel: string
}

export function OrgSwitcher({
  activeLanguageCode,
  currentLanguage,
  onLanguageChange,
  isOpen,
  languageLabel,
}: OrgSwitcherProps) {
  const [showLanguageSubmenu, setShowLanguageSubmenu] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setShowLanguageSubmenu(false)
    }
  }, [isOpen])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowLanguageSubmenu(!showLanguageSubmenu)}
        className="w-full flex items-center gap-3 px-2 py-1.5 text-sm hover:bg-secondary rounded-lg transition-colors"
      >
        <Globe className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">{languageLabel}</span>
        <span className="text-foreground flex items-center gap-1.5">
          <span>{currentLanguage.flag}</span>
          <span>{currentLanguage.name}</span>
        </span>
        <ChevronDown className={`w-3 h-3 ml-auto text-muted-foreground transition-transform ${showLanguageSubmenu ? 'rotate-180' : ''}`} />
      </button>
      {showLanguageSubmenu && (
        <div className="mt-1 ml-6 space-y-0.5 border-l-2 border-border pl-3">
          {languages.map((lang) => (
            <button
              type="button"
              role="menuitem"
              key={lang.code}
              onClick={() => onLanguageChange(lang.code)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg transition-colors ${
                activeLanguageCode === lang.code
                  ? 'bg-purple-900 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
              {activeLanguageCode === lang.code && (
                <Check className="w-3 h-3 ml-auto text-purple-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
