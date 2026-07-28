import { useRef, useEffect, type RefObject } from 'react'
import { useModalState } from '../../lib/modals'
import { useKeyboardNav } from '../../hooks/useKeyboardNav'
import { User, ChevronDown } from 'lucide-react'
import { ProfileCard } from './ProfileCard'

const PROFILE_MENUITEM_SELECTOR = '[role="menuitem"]:not([disabled])'

interface UserProfileDropdownProps {
  user: {
    github_login?: string
    email?: string
    avatar_url?: string
    role?: string
    slack_id?: string
  } | null
  onLogout: () => void
  onPreferences?: () => void
}

export function UserProfileDropdown({ user, onLogout, onPreferences }: UserProfileDropdownProps) {
  const { isOpen, close: closeDropdown, toggle: toggleDropdown } = useModalState()
  const triggerButtonRef = useRef<HTMLButtonElement>(null)
  const dropdownContainerRef = useRef<HTMLDivElement>(null)
  const {
    containerRef: menuRef,
    focusMatchingItem,
    handleKeyDown: handleMenuKeyDown,
  } = useKeyboardNav({
    selector: PROFILE_MENUITEM_SELECTOR,
    orientation: 'vertical',
    onEscape: closeDropdown,
  })

  useEffect(() => {
    if (isOpen) {
      focusMatchingItem({ fallbackSelector: PROFILE_MENUITEM_SELECTOR })
    }
  }, [focusMatchingItem, isOpen])

  useEffect(() => {
    if (!isOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [isOpen, closeDropdown])

  if (!user) return null
  const profileMenuStateLabel = `profile menu, ${isOpen ? 'close' : 'open'}`

  return (
    <div className="relative" ref={dropdownContainerRef}>
      <button
        ref={triggerButtonRef}
        type="button"
        data-testid="navbar-profile-btn"
        onClick={toggleDropdown}
        aria-label={`${user.github_login} ${profileMenuStateLabel}`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="profile-dropdown-menu"
        className="flex items-center gap-2 border-l border-border hover:bg-secondary rounded-lg px-3 py-1.5 h-9 transition-colors"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user?.github_login || 'User avatar'}
            className="w-6 h-6 rounded-full"
            loading="lazy"
            width={24}
            height={24}
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-purple-900 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-purple-400" />
          </div>
        )}
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium text-foreground">{user.github_login}</p>
        </div>
        <span className="sr-only">{profileMenuStateLabel}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <ProfileCard
        user={user}
        isOpen={isOpen}
        closeDropdown={closeDropdown}
        onPreferences={onPreferences}
        onLogout={onLogout}
        menuRef={menuRef as RefObject<HTMLDivElement | null>}
        onMenuKeyDown={handleMenuKeyDown}
        triggerButtonRef={triggerButtonRef}
      />
    </div>
  )
}
