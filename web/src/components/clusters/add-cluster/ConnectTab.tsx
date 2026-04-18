import { useTranslation } from 'react-i18next'
import { X, Check, Loader2, ChevronDown, ChevronUp, Shield, KeyRound, Cloud } from 'lucide-react'
import { CloudProviderIcon } from '../../ui/CloudProviderIcon'
import { CopyButton } from './CopyButton'
import type { ConnectStep, ConnectState, CloudProvider } from './types'

// Cloud provider IAM auth commands — two steps: authenticate, then register cluster
const CLOUD_IAM_COMMANDS: Record<CloudProvider, { auth: string; register: string; cliName: string }> = {
  eks: {
    cliName: 'aws',
    auth: 'aws sso login',
    register: 'aws eks update-kubeconfig --name <CLUSTER> --region <REGION>',
  },
  gke: {
    cliName: 'gcloud',
    auth: 'gcloud auth login',
    register: 'gcloud container clusters get-credentials <CLUSTER> --zone <ZONE> --project <PROJECT>',
  },
  aks: {
    cliName: 'az',
    auth: 'az login',
    register: 'az aks get-credentials --resource-group <RG> --name <CLUSTER>',
  },
  openshift: {
    cliName: 'oc',
    auth: 'oc login <API_SERVER_URL>',
    register: '', // oc login already sets up kubeconfig
  },
}

interface ConnectTabProps {
  connectStep: ConnectStep
  setConnectStep: (step: ConnectStep) => void
  connectState: ConnectState
  serverUrl: string
  setServerUrl: (url: string) => void
  authType: 'token' | 'certificate' | 'cloud-iam'
  setAuthType: (type: 'token' | 'certificate' | 'cloud-iam') => void
  token: string
  setToken: (token: string) => void
  certData: string
  setCertData: (data: string) => void
  keyData: string
  setKeyData: (data: string) => void
  caData: string
  setCaData: (data: string) => void
  skipTls: boolean
  setSkipTls: (skip: boolean) => void
  contextName: string
  setContextName: (name: string) => void
  clusterName: string
  setClusterName: (name: string) => void
  namespace: string
  setNamespace: (ns: string) => void
  testResult: { reachable: boolean; serverVersion?: string; error?: string } | null
  resetTestResult: () => void
  connectError: string
  showAdvanced: boolean
  setShowAdvanced: (show: boolean) => void
  selectedCloudProvider: CloudProvider
  setSelectedCloudProvider: (provider: CloudProvider) => void
  goToConnectStep: (step: ConnectStep) => void
  handleTestConnection: () => void
  handleAddCluster: () => void
}

export function ConnectTab({
  connectStep,
  setConnectStep,
  connectState,
  serverUrl,
  setServerUrl,
  authType,
  setAuthType,
  token,
  setToken,
  certData,
  setCertData,
  keyData,
  setKeyData,
  caData,
  setCaData,
  skipTls,
  setSkipTls,
  contextName,
  setContextName,
  clusterName,
  setClusterName,
  namespace,
  setNamespace,
  testResult,
  resetTestResult,
  connectError,
  showAdvanced,
  setShowAdvanced,
  selectedCloudProvider,
  setSelectedCloudProvider,
  goToConnectStep,
  handleTestConnection,
  handleAddCluster,
}: ConnectTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {connectState === 'done' ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Check className="w-10 h-10 text-green-400 mb-3" />
          <p className="text-sm text-green-400">{t('cluster.connectSuccess')}</p>
        </div>
      ) : (
        <>
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-3">
            {([1, 2, 3] as ConnectStep[]).map((step) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  connectStep === step
                    ? 'bg-purple-600 text-white'
                    : connectStep > step
                      ? 'bg-green-600 text-white'
                      : 'bg-black/5 dark:bg-white/10 text-muted-foreground'
                }`}>
                  {connectStep > step ? <Check className="w-3.5 h-3.5" /> : step}
                </div>
                <span className={`text-xs ${connectStep === step ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {t(`cluster.connectStep${step}`)}
                </span>
                {step < 3 && <div className={`w-8 h-px ${connectStep > step ? 'bg-green-600' : 'bg-black/10 dark:bg-white/10'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Server URL */}
          {connectStep === 1 && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">{t('cluster.connectServerUrl')}</label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={t('cluster.connectServerPlaceholder')}
                className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none"
              />
              {connectError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                  {connectError}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => goToConnectStep(2)}
                  disabled={!serverUrl.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border dark:border-white/10"
                >
                  {t('cluster.connectNext')}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Authentication */}
          {connectStep === 2 && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">{t('cluster.connectAuthType')}</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setAuthType('token')}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                    authType === 'token'
                      ? 'border-purple-500 bg-purple-500/10 text-foreground'
                      : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <KeyRound className="w-4 h-4 shrink-0" />
                  {t('cluster.connectAuthToken')}
                </button>
                <button
                  onClick={() => setAuthType('certificate')}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                    authType === 'certificate'
                      ? 'border-purple-500 bg-purple-500/10 text-foreground'
                      : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  {t('cluster.connectAuthCert')}
                </button>
                <button
                  onClick={() => setAuthType('cloud-iam')}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-sm text-left transition-colors ${
                    authType === 'cloud-iam'
                      ? 'border-purple-500 bg-purple-500/10 text-foreground'
                      : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Cloud className="w-4 h-4 shrink-0" />
                  {t('cluster.connectAuthIAM')}
                </button>
              </div>

              {authType === 'token' && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('cluster.connectTokenLabel')}</label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t('cluster.connectTokenPlaceholder')}
                    className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none font-mono"
                  />
                </div>
              )}

              {authType === 'certificate' && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t('cluster.connectCertLabel')}</label>
                    <textarea
                      value={certData}
                      onChange={(e) => setCertData(e.target.value)}
                      rows={3}
                      placeholder="-----BEGIN CERTIFICATE-----"
                      className="bg-secondary rounded-lg px-4 py-2 text-xs w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none font-mono resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t('cluster.connectKeyLabel')}</label>
                    <textarea
                      value={keyData}
                      onChange={(e) => setKeyData(e.target.value)}
                      rows={3}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----"
                      className="bg-secondary rounded-lg px-4 py-2 text-xs w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none font-mono resize-none"
                    />
                  </div>
                </div>
              )}

              {authType === 'cloud-iam' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{t('cluster.cloudIAMDesc')}</p>

                  {/* Provider selector */}
                  <div className="grid grid-cols-4 gap-2">
                    {(['eks', 'gke', 'aks', 'openshift'] as CloudProvider[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setSelectedCloudProvider(p)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs transition-colors ${
                          selectedCloudProvider === p
                            ? 'border-purple-500 bg-purple-500/10 text-foreground'
                            : 'border-border dark:border-white/10 bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <CloudProviderIcon provider={p} size={20} />
                        {t(`cluster.cloudIAMProvider${p.toUpperCase() === 'EKS' ? 'AWS' : p.toUpperCase() === 'GKE' ? 'GKE' : p.toUpperCase() === 'AKS' ? 'AKS' : 'OpenShift'}`)}
                      </button>
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
              )}

              {/* Advanced options (only for token/certificate) */}
              {authType !== 'cloud-iam' && (
                <>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {t('cluster.connectAdvanced')}
                  </button>

                  {showAdvanced && (
                    <div className="space-y-2 pl-1">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">{t('cluster.connectCaLabel')}</label>
                        <textarea
                          value={caData}
                          onChange={(e) => setCaData(e.target.value)}
                          rows={3}
                          placeholder="-----BEGIN CERTIFICATE-----"
                          className="bg-secondary rounded-lg px-4 py-2 text-xs w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none font-mono resize-none"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
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
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => setConnectStep(1)}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors border border-border dark:border-white/10"
                >
                  {t('cluster.connectBack')}
                </button>
                <button
                  onClick={() => goToConnectStep(3)}
                  disabled={
                    authType === 'token'
                      ? !token.trim()
                      : authType === 'certificate'
                        ? (!certData.trim() || !keyData.trim())
                        : false // cloud-iam: user authenticates via CLI, no UI input required to proceed
                  }
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border dark:border-white/10"
                >
                  {t('cluster.connectNext')}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Context Settings */}
          {connectStep === 3 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('cluster.connectContextName')}</label>
                <input
                  type="text"
                  value={contextName}
                  onChange={(e) => setContextName(e.target.value)}
                  placeholder="my-cluster"
                  className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('cluster.connectClusterName')}</label>
                <input
                  type="text"
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  placeholder="my-cluster"
                  className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">{t('cluster.connectNamespace')}</label>
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="default"
                  className="bg-secondary rounded-lg px-4 py-2.5 text-sm w-full border border-border dark:border-white/10 focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* Test connection result */}
              {testResult && (
                <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${
                  testResult.reachable
                    ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400'
                }`}>
                  {testResult.reachable ? (
                    <>
                      <Check className="w-4 h-4 shrink-0" />
                      {t('cluster.connectTestSuccess')} — Kubernetes {testResult.serverVersion}
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4 shrink-0" />
                      {t('cluster.connectTestFailed')}: {testResult.error}
                    </>
                  )}
                </div>
              )}

              {connectError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                  {connectError}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  onClick={() => { resetTestResult(); setConnectStep(2) }}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors border border-border dark:border-white/10"
                >
                  {t('cluster.connectBack')}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={connectState === 'testing' || !contextName.trim() || !clusterName.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border dark:border-white/10"
                  >
                    {connectState === 'testing' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('cluster.connectTesting')}
                      </>
                    ) : (
                      t('cluster.connectTestButton')
                    )}
                  </button>
                  <button
                    onClick={handleAddCluster}
                    disabled={connectState === 'adding' || !contextName.trim() || !clusterName.trim() || testResult?.reachable === false}
                    title={testResult?.reachable === false ? t('cluster.connectAddDisabledAfterTestFail') : undefined}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connectState === 'adding' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('cluster.connectAdding')}
                      </>
                    ) : (
                      t('cluster.connectAddButton')
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
