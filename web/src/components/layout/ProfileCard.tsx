import { useState, Suspense, type KeyboardEvent, type RefObject } from 'react'
import { safeLazy } from '../../lib/safeLazy'
import { useModalState } from '../../lib/modals'
import { useTranslation } from 'react-i18next'
import { useRewards } from '../../hooks/useRewards'
import { getContributorLevel } from '../../types/rewards'
import { isDemoModeForced } from '../../lib/demoMode'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { DeveloperSetupDialog } from '../setup/DeveloperSetupDialog'
import { ConfirmDialog } from '../../lib/modals/ConfirmDialog'
import {
  useOAuthStatus,
  ProfileAvatarBlock,
  ProfileStatRows,
  ProfileDevPanel,
  ProfileActionMenu,
} from './ProfileCard.parts'

const FeatureRequestModal = safeLazy(() => import('../feedback/FeatureRequestModal'), 'FeatureRequestModal')

interface ProfileCardProps {
  user: {
    github_login?: string
    email?: string
    avatar_url?: string
    role?: string
    slack_id?: string
  }
  isOpen: boolean
  closeDropdown: () => void
  onPreferences?: () => void
  onLogout: () => void
  menuRef: RefObject<HTMLDivElement | null>
  onMenuKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  triggerButtonRef: RefObject<HTMLButtonElement | null>
}

export function ProfileCard({
  user,
  isOpen,
  closeDropdown,
  onPreferences,
  onLogout,
  menuRef,
  onMenuKeyDown,
  triggerButtonRef,
}: ProfileCardProps) {
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [showDevSetupDialog, setShowDevSetupDialog] = useState(false)
  const [showRewards, setShowRewards] = useState(false)
  const { isOpen: showFeedbackModal, open: openFeedbackModal, close: closeFeedbackModal } = useModalState()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const { totalCoins, githubPoints, localCoins, bonusPoints, awardCoins } = useRewards()
  const { t } = useTranslation()
  const oauthStatus = useOAuthStatus(isOpen)

  const contributorLevel = getContributorLevel(totalCoins).current

  return (
    <>
      {isOpen && (
        <div
          ref={menuRef}
          id="profile-dropdown-menu"
          data-testid="navbar-profile-dropdown"
          role="menu"
          onKeyDown={(event) => {
            onMenuKeyDown(event)
            if (event.key === 'Escape') {
              triggerButtonRef.current?.focus()
            }
          }}
          className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-5rem)] bg-card border border-border rounded-xl shadow-2xl overflow-hidden overflow-y-auto z-toast"
        >
          <ProfileAvatarBlock user={user} />

          <ProfileStatRows
            user={user}
            totalCoins={totalCoins}
            localCoins={localCoins}
            githubPoints={githubPoints}
            bonusPoints={bonusPoints}
            contributorLevel={contributorLevel}
            isOpen={isOpen}
            closeDropdown={closeDropdown}
            onShowRewards={() => setShowRewards(true)}
          />

          {!isDemoModeForced && (
            <ProfileDevPanel
              oauthStatus={oauthStatus}
              closeDropdown={closeDropdown}
              onShowSetupDialog={() => setShowSetupDialog(true)}
              onShowDevSetupDialog={() => setShowDevSetupDialog(true)}
            />
          )}

          <ProfileActionMenu
            closeDropdown={closeDropdown}
            openFeedbackModal={openFeedbackModal}
            awardCoins={awardCoins}
            onShowSetupDialog={() => setShowSetupDialog(true)}
            onPreferences={onPreferences}
            onShowLogoutConfirm={() => setShowLogoutConfirm(true)}
          />
        </div>
      )}

      <SetupInstructionsDialog
        isOpen={showSetupDialog}
        onClose={() => setShowSetupDialog(false)}
      />

      <DeveloperSetupDialog
        isOpen={showDevSetupDialog}
        onClose={() => setShowDevSetupDialog(false)}
      />

      {showRewards && (
        <Suspense fallback={null}>
          <FeatureRequestModal
            isOpen={showRewards}
            onClose={() => setShowRewards(false)}
            initialTab="updates"
          />
        </Suspense>
      )}

      {showFeedbackModal && (
        <Suspense fallback={null}>
          <FeatureRequestModal
            isOpen={showFeedbackModal}
            onClose={closeFeedbackModal}
            initialTab="submit"
          />
        </Suspense>
      )}

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false)
          onLogout()
        }}
        title={t('confirmDialog.logoutTitle')}
        message={t('confirmDialog.logoutMessage')}
        confirmLabel={t('actions.logout', 'Log Out')}
        variant="warning"
      />
    </>
  )
}
