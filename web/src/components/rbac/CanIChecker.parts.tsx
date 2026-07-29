import type { ReactNode } from 'react'
import { Check, X, AlertCircle, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import type { CanIResponse } from '../../hooks/usePermissions'
import type { CheckedSnapshot } from './CanIChecker.state'
import { COMMON_USER_GROUPS } from './CanIChecker.constants'

const SELECT_CLASS =
  'w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500 appearance-none pr-8'
const INPUT_CLASS =
  'w-full p-2 rounded-lg bg-secondary border border-border text-foreground focus:outline-hidden focus:ring-2 focus:ring-blue-500'
const CHEVRON_CLASS =
  'absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none'

interface LabeledSelectProps {
  id: string
  label: ReactNode
  value: string
  onChange: (value: string) => void
  testId: string
  children: ReactNode
}

/** Label + styled `<select>` with the shared chevron affordance. */
export function LabeledSelect({ id, label, value, onChange, testId, children }: LabeledSelectProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={SELECT_CLASS}
          data-testid={testId}
        >
          {children}
        </select>
        <ChevronDown className={CHEVRON_CLASS} />
      </div>
    </div>
  )
}

interface CustomValueInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  testId: string
}

/** Free-text override shown when the matching dropdown is set to `custom`. */
export function CustomValueInput({ value, onChange, placeholder, testId }: CustomValueInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`mt-2 ${INPUT_CLASS}`}
      data-testid={testId}
    />
  )
}

interface UserGroupsFieldProps {
  selectedUserGroups: string[]
  customUserGroup: string
  onToggleGroup: (group: string) => void
  onCustomGroupChange: (value: string) => void
  onAddCustomGroup: () => void
}

/** Multi-select for the user groups impersonated during the check. */
export function UserGroupsField({
  selectedUserGroups,
  customUserGroup,
  onToggleGroup,
  onCustomGroupChange,
  onAddCustomGroup,
}: UserGroupsFieldProps) {
  const { t } = useTranslation('common')

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {t('rbac.userGroups')} <span className="text-muted-foreground">{t('rbac.userGroupsHint')}</span>
      </label>

      {/* Selected groups display */}
      {selectedUserGroups.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {selectedUserGroups.map((group) => (
            <span
              key={group}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400"
            >
              {group}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleGroup(group)}
                className="p-0 hover:text-blue-200"
                aria-label={t('rbac.removeGroup', { group })}
                icon={<X className="w-3 h-3" />}
              />
            </span>
          ))}
        </div>
      )}

      {/* Common groups dropdown */}
      <div className="relative">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value && !selectedUserGroups.includes(e.target.value)) {
              onToggleGroup(e.target.value)
            }
          }}
          className={SELECT_CLASS}
          data-testid="can-i-user-groups"
        >
          <option value="">{t('rbac.selectCommonGroups')}</option>
          {COMMON_USER_GROUPS.filter(g => !selectedUserGroups.includes(g.value)).map((group) => (
            <option key={group.value} value={group.value}>{group.label}</option>
          ))}
        </select>
        <ChevronDown className={CHEVRON_CLASS} />
      </div>

      {/* Custom group input */}
      <div className="mt-2 flex gap-2">
        <input
          type="text"
          value={customUserGroup}
          onChange={(e) => onCustomGroupChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAddCustomGroup()
            }
          }}
          placeholder={t('rbac.addCustomGroupPlaceholder')}
          className="flex-1 p-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        />
        <Button
          variant="primary"
          size="lg"
          onClick={onAddCustomGroup}
          disabled={!customUserGroup.trim()}
          aria-label={t('rbac.add')}
        >
          {t('rbac.add')}
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('rbac.addGroupsDesc')}
      </p>
    </div>
  )
}

/** Static cheat-sheet of the most frequently used API groups. */
export function AdvancedApiGroupsHelp() {
  const { t } = useTranslation('common')

  return (
    <div className="text-xs text-muted-foreground p-3 bg-secondary/30 rounded-lg">
      <p className="font-medium mb-2">{t('rbac.commonApiGroupsTitle')}</p>
      <ul className="space-y-1">
        <li><code className="text-blue-400">""</code> - {t('rbac.apiGroupCoreDesc')}</li>
        <li><code className="text-blue-400">apps</code> - {t('rbac.apiGroupAppsDesc')}</li>
        <li><code className="text-blue-400">rbac.authorization.k8s.io</code> - {t('rbac.apiGroupRbacDesc')}</li>
        <li><code className="text-blue-400">batch</code> - {t('rbac.apiGroupBatchDesc')}</li>
        <li><code className="text-blue-400">networking.k8s.io</code> - {t('rbac.apiGroupNetworkingDesc')}</li>
      </ul>
    </div>
  )
}

interface CanIResultPanelProps {
  result: CanIResponse
  snapshot: CheckedSnapshot
}

/**
 * Allowed/denied verdict banner. Renders the frozen snapshot captured at Check
 * time so the displayed verb/resource/namespace match what was actually
 * checked (Issue 9268).
 */
export function CanIResultPanel({ result, snapshot }: CanIResultPanelProps) {
  const { t } = useTranslation('common')

  return (
    <div
      className={`p-4 rounded-lg border ${
        result.allowed
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}
      data-testid="can-i-result"
    >
      <div className="flex items-center gap-2">
        {result.allowed ? (
          <>
            <Check className="w-5 h-5 text-green-500" />
            <span className="font-medium text-green-500">{t('rbac.allowed')}</span>
          </>
        ) : (
          <>
            <X className="w-5 h-5 text-red-500" />
            <span className="font-medium text-red-500">{t('rbac.denied')}</span>
          </>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(result.allowed ? 'rbac.youCan' : 'rbac.youCannot')}{' '}
        <code className="px-1 py-0.5 rounded bg-secondary">{snapshot.verb}</code>{' '}
        <code className="px-1 py-0.5 rounded bg-secondary">{snapshot.resource}</code>
        {snapshot.namespace && (
          <>
            {' '}{t('rbac.inNamespace')} <code className="px-1 py-0.5 rounded bg-secondary">{snapshot.namespace}</code>
          </>
        )}
      </p>
      {result.reason && (
        <p className="mt-1 text-xs text-muted-foreground">{result.reason}</p>
      )}
    </div>
  )
}

/** Error banner shown when the permission check request itself failed. */
export function CanIErrorPanel({ error }: { error: string }) {
  const { t } = useTranslation('common')

  return (
    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30" data-testid="can-i-error">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <span className="font-medium text-red-500">{t('common.error')}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
    </div>
  )
}

/** Warning shown when no clusters are connected, so nothing can be checked. */
export function NoClustersWarning() {
  const { t } = useTranslation('common')

  return (
    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-yellow-500" />
        <span className="font-medium text-yellow-500">{t('rbac.noClustersAvailable')}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('rbac.connectToCluster')}
      </p>
    </div>
  )
}
