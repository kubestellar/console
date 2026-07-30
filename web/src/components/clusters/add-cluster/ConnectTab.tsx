import { useTranslation } from 'react-i18next'
import { X, Check, Loader2 } from 'lucide-react'
import { useConnectTabContext } from './ConnectTabContext'
import type { ConnectStep } from './types'
import { Button } from '../../ui/Button'
import { Input } from '../../ui/Input'
import { TextArea } from '../../ui/TextArea'
import { AuthTypeSelector, CloudIAMSection, AdvancedOptionsSection } from './ConnectTab.parts'


export function ConnectTab() {
  const { t } = useTranslation()
  const {
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
  } = useConnectTabContext()

  return (
    <div className="space-y-4">
      {connectState === 'done' ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Check className="w-10 h-10 text-green-400 mb-3" />
          <div className="text-sm text-green-400">{t('cluster.connectSuccess')}</div>
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
              <Input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder={t('cluster.connectServerPlaceholder')}
                inputSize="lg"
                className="dark:border-white/10 focus:border-purple-500"
              />
              {connectError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                  {connectError}
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={() => goToConnectStep(2)}
                  disabled={!serverUrl.trim()}
                  variant="secondary"
                >
                  {t('cluster.connectNext')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Authentication */}
          {connectStep === 2 && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">{t('cluster.connectAuthType')}</label>
              <AuthTypeSelector authType={authType} setAuthType={setAuthType} />

              {authType === 'token' && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">{t('cluster.connectTokenLabel')}</label>
                  <Input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t('cluster.connectTokenPlaceholder')}
                    inputSize="lg"
                    className="dark:border-white/10 focus:border-purple-500 font-mono"
                  />
                </div>
              )}

              {authType === 'certificate' && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t('cluster.connectCertLabel')}</label>
                    <TextArea
                      value={certData}
                      onChange={(e) => setCertData(e.target.value)}
                      rows={3}
                      placeholder="-----BEGIN CERTIFICATE-----"
                      textAreaSize="lg"
                      className="dark:border-white/10 focus:border-purple-500 font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">{t('cluster.connectKeyLabel')}</label>
                    <TextArea
                      value={keyData}
                      onChange={(e) => setKeyData(e.target.value)}
                      rows={3}
                      placeholder="-----BEGIN RSA PRIVATE KEY-----"
                      textAreaSize="lg"
                      className="dark:border-white/10 focus:border-purple-500 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {authType === 'cloud-iam' && (
                <CloudIAMSection
                  selectedCloudProvider={selectedCloudProvider}
                  setSelectedCloudProvider={setSelectedCloudProvider}
                />
              )}

              {/* Advanced options (only for token/certificate) */}
              {authType !== 'cloud-iam' && (
                <AdvancedOptionsSection
                  showAdvanced={showAdvanced}
                  setShowAdvanced={setShowAdvanced}
                  caData={caData}
                  setCaData={setCaData}
                  skipTls={skipTls}
                  setSkipTls={setSkipTls}
                />
              )}

              <div className="flex justify-between">
                <Button
                  onClick={() => setConnectStep(1)}
                  variant="secondary"
                >
                  {t('cluster.connectBack')}
                </Button>
                <Button
                  onClick={() => goToConnectStep(3)}
                  disabled={
                    authType === 'token'
                      ? !token.trim()
                      : authType === 'certificate'
                        ? (!certData.trim() || !keyData.trim())
                        : false // cloud-iam: user authenticates via CLI, no UI input required to proceed
                  }
                  variant="secondary"
                >
                  {t('cluster.connectNext')}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Context Settings */}
          {connectStep === 3 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('cluster.connectContextName')}</label>
                <Input
                  type="text"
                  value={contextName}
                  onChange={(e) => setContextName(e.target.value)}
                  placeholder="my-cluster"
                  inputSize="lg"
                  className="dark:border-white/10 focus:border-purple-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t('cluster.connectClusterName')}</label>
                <Input
                  type="text"
                  value={clusterName}
                  onChange={(e) => setClusterName(e.target.value)}
                  placeholder="my-cluster"
                  inputSize="lg"
                  className="dark:border-white/10 focus:border-purple-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">{t('cluster.connectNamespace')}</label>
                <Input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="default"
                  inputSize="lg"
                  className="dark:border-white/10 focus:border-purple-500"
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
                      {t('cluster.connectTestSuccessKubernetes', { version: testResult.serverVersion })}
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
                <Button
                  onClick={() => { resetTestResult(); setConnectStep(2) }}
                  variant="secondary"
                >
                  {t('cluster.connectBack')}
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleTestConnection}
                    disabled={connectState === 'testing' || !contextName.trim() || !clusterName.trim()}
                    variant="secondary"
                    loading={connectState === 'testing'}
                    icon={connectState === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                  >
                    {connectState === 'testing' ? (
                      t('cluster.connectTesting')
                    ) : (
                      t('cluster.connectTestButton')
                    )}
                  </Button>
                  <Button
                    onClick={handleAddCluster}
                    disabled={connectState === 'adding' || !contextName.trim() || !clusterName.trim() || testResult?.reachable === false}
                    title={testResult?.reachable === false ? t('cluster.connectAddDisabledAfterTestFail') : undefined}
                    variant="primary"
                    loading={connectState === 'adding'}
                    icon={connectState === 'adding' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connectState === 'adding' ? (
                      t('cluster.connectAdding')
                    ) : (
                      t('cluster.connectAddButton')
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
