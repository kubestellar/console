import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Shield, KeyRound, Cloud } from 'lucide-react'
import { CloudProviderIcon } from '../../ui/CloudProviderIcon'
import { CopyButton } from './CopyButton'
import { Button } from '../../ui/Button'
import { TextArea } from '../../ui/TextArea'
import { CLOUD_IAM_COMMANDS, getCloudIAMProviderKey } from './ConnectTab.constants'
import type { CloudProvider } from './types'

type AuthType = 'token' | 'certificate' | 'cloud-iam'

interface AuthTypeSelectorProps {
  authType: AuthType
  setAuthType: (authType: AuthType) => void
}

/** Connection-method cards for choosing between token, certificate, and cloud IAM auth. */
export function AuthTypeSelector({ authType, setAuthType }: AuthTypeSelectorProps) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-3 gap-2">
      <Button
        onClick={() => setAuthType('token')}
        variant="ghost"
        className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
          authType === 'token'
            ? 'border-purple-500 bg-purple-500/10 text-foreground'
            : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
        }`}
        icon={<KeyRound className="w-4 h-4 shrink-0" />}
      >
        {t('cluster.connectAuthToken')}
      </Button>
      <Button
        onClick={() => setAuthType('certificate')}
        variant="ghost"
        className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
          authType === 'certificate'
            ? 'border-purple-500 bg-purple-500/10 text-foreground'
            : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
        }`}
        icon={<Shield className="w-4 h-4 shrink-0" />}
      >
        {t('cluster.connectAuthCert')}
      </Button>
      <Button
        onClick={() => setAuthType('cloud-iam')}
        variant="ghost"
        className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
          authType === 'cloud-iam'
            ? 'border-purple-500 bg-purple-500/10 text-foreground'
            : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
        }`}
        icon={<Cloud className="w-4 h-4 shrink-0" />}
      >
        {t('cluster.connectAuthIAM')}
      </Button>
    </div>
  )
}

interface CloudIAMSectionProps {
  selectedCloudProvider: CloudProvider
  setSelectedCloudProvider: (provider: CloudProvider) => void
}

/** Cloud provider selector plus the auth/register CLI instruction blocks for cloud IAM login. */
export function CloudIAMSection({ selectedCloudProvider, setSelectedCloudProvider }: CloudIAMSectionProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{t('cluster.cloudIAMDesc')}</div>

      {/* Provider selector */}
      <div className="grid grid-cols-4 gap-2">
        {(['eks', 'gke', 'aks', 'openshift'] as CloudProvider[]).map((p) => (
          <Button
            key={p}
            onClick={() => setSelectedCloudProvider(p)}
            aria-label={t('actions.selectCloudProviderAria', {
              provider: t(`cluster.cloudIAMProvider${getCloudIAMProviderKey(p)}`),
            })}
            variant="ghost"
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-colors ${
              selectedCloudProvider === p
                ? 'border-purple-500 bg-purple-500/10 text-foreground'
                : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <CloudProviderIcon provider={p} size={20} />
            {t(`cluster.cloudIAMProvider${getCloudIAMProviderKey(p)}`)}
          </Button>
        ))}
      </div>

      {/* Step A: Authenticate */}
      <div className="bg-secondary rounded-lg p-4">
        <div className="text-xs text-muted-foreground mb-2">{t('cluster.cloudIAMStepAuth')}</div>
        <div className="flex items-start justify-between gap-2">
          <code className="text-sm text-foreground font-mono">{CLOUD_IAM_COMMANDS[selectedCloudProvider].auth}</code>
          <CopyButton text={CLOUD_IAM_COMMANDS[selectedCloudProvider].auth} />
        </div>
      </div>

      {/* Step B: Register cluster (skip for OpenShift — oc login does both) */}
      {CLOUD_IAM_COMMANDS[selectedCloudProvider].register && (
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-2">{t('cluster.cloudIAMStepRegister')}</div>
          <div className="flex items-start justify-between gap-2">
            <code className="text-sm text-foreground font-mono break-all">{CLOUD_IAM_COMMANDS[selectedCloudProvider].register}</code>
            <CopyButton text={CLOUD_IAM_COMMANDS[selectedCloudProvider].register} />
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-border/30 dark:border-white/5">
        {t('cluster.cloudIAMAutoDetect')}
      </p>
    </div>
  )
}

interface AdvancedOptionsSectionProps {
  showAdvanced: boolean
  setShowAdvanced: (showAdvanced: boolean) => void
  caData: string
  setCaData: (caData: string) => void
  skipTls: boolean
  setSkipTls: (skipTls: boolean) => void
}

/** Collapsible advanced options: custom CA data and skip-TLS-verify toggle (token/certificate auth only). */
export function AdvancedOptionsSection({
  showAdvanced,
  setShowAdvanced,
  caData,
  setCaData,
  skipTls,
  setSkipTls,
}: AdvancedOptionsSectionProps) {
  const { t } = useTranslation()
  return (
    <>
      <Button
        onClick={() => setShowAdvanced(!showAdvanced)}
        variant="ghost"
        size="sm"
        icon={showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {t('cluster.connectAdvanced')}
      </Button>

      {showAdvanced && (
        <div className="space-y-2 pl-1">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('cluster.connectCaLabel')}</label>
            <TextArea
              value={caData}
              onChange={(e) => setCaData(e.target.value)}
              rows={3}
              placeholder="-----BEGIN CERTIFICATE-----"
              textAreaSize="lg"
              className="dark:border-white/10 focus:border-purple-500 font-mono text-xs"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            {/* eslint-disable-next-line no-restricted-syntax -- no Checkbox component exists yet */}
            <input
              type="checkbox"
              checked={skipTls}
              onChange={(e) => setSkipTls(e.target.checked)}
              className="rounded border-border dark:border-white/20 bg-secondary"
            />
            {t('cluster.connectSkipTls')}
          </label>
        </div>
      )}
    </>
  )
}
