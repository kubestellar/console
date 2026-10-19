import { Shield, ChevronRight, CheckCircle, XCircle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatusBadge } from '../../ui/StatusBadge'
import type { OscalProfile } from '../../../hooks/useTrestle'
import type { useDrillDownActions } from '../../../hooks/useDrillDown'
import { SCORE_GOOD_THRESHOLD, SCORE_WARNING_THRESHOLD } from '../TrestleScan.constants'

export function TrestleScanProfiles({ allProfiles, expandedProfile, setExpandedProfile, drillToCompliance }: {
  allProfiles: OscalProfile[]
  expandedProfile: string | null
  setExpandedProfile: (profile: string | null) => void
  drillToCompliance: ReturnType<typeof useDrillDownActions>['drillToCompliance']
}) {
  const { t } = useTranslation(['common', 'cards'])
  return (
    <div className="flex-1 overflow-y-auto space-y-2">
      {allProfiles.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">{t('cards:trestleScan.noProfilesAssessed')}</p>
      )}
      {(allProfiles || []).map((profile) => {
        const profileScore = profile.totalControls > 0
          ? Math.round((profile.controlsPassed / profile.totalControls) * 100)
          : 0
        const isExpanded = expandedProfile === profile.name

        return (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
            key={profile.name}
            className="w-full text-left p-2.5 rounded-lg border border-border/50 hover:border-border transition-colors bg-secondary/20 cursor-pointer"
            onClick={() => setExpandedProfile(isExpanded ? null : profile.name)}
          >
            <div className="flex flex-wrap items-center justify-between gap-y-2 gap-2">
              <div
                className="flex-1 text-left"
                title={t('cards:trestleScan.toggleProfileDetails', { name: profile.name })}
              >
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-xs font-medium text-foreground">{profile.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${
                      profileScore >= SCORE_GOOD_THRESHOLD ? 'text-green-400' :
                      profileScore >= SCORE_WARNING_THRESHOLD ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {profileScore}%
                    </span>
                    <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); drillToCompliance('', { profile: profile.name }) }}
                className="cursor-pointer"
                title={t('cards:trestleScan.viewProfileControls', { name: profile.name })}
              >
                <StatusBadge
                  color={profileScore >= SCORE_GOOD_THRESHOLD ? 'green' : profileScore >= SCORE_WARNING_THRESHOLD ? 'yellow' : 'red'}
                  size="xs"
                >
                  {t('cards:trestleScan.controls', { count: profile.totalControls })}
                </StatusBadge>
              </button>
            </div>

            {/* Progress bar */}
            <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  profileScore >= SCORE_GOOD_THRESHOLD ? 'bg-green-400' :
                  profileScore >= SCORE_WARNING_THRESHOLD ? 'bg-yellow-400' : 'bg-red-400'
                }`}
                style={{ width: `${profileScore}%` }}
              />
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="mt-2 grid grid-cols-2 @md:grid-cols-3 gap-2 text-xs">
                <button
                  onClick={(e) => { e.stopPropagation(); drillToCompliance('pass', { profile: profile.name }) }}
                  className="flex items-center gap-1 text-green-400 hover:opacity-80 transition-opacity cursor-pointer"
                  title={t('cards:trestleScan.viewPassingProfileControls', { name: profile.name })}
                >
                  <CheckCircle className="w-3 h-3" />
                  <span>{profile.controlsPassed} {t('cards:trestleScan.pass')}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); drillToCompliance('fail', { profile: profile.name }) }}
                  className="flex items-center gap-1 text-red-400 hover:opacity-80 transition-opacity cursor-pointer"
                  title={t('cards:trestleScan.viewFailingProfileControls', { name: profile.name })}
                >
                  <XCircle className="w-3 h-3" />
                  <span>{profile.controlsFailed} {t('cards:trestleScan.fail')}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); drillToCompliance('other', { profile: profile.name }) }}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={t('cards:trestleScan.viewOtherProfileControls', { name: profile.name })}
                >
                  <Info className="w-3 h-3" />
                  <span>{profile.controlsOther} {t('cards:trestleScan.other')}</span>
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
