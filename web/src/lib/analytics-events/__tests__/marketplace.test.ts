import { describe, expect, it, mockSend, mockSetUserProps, emitConversionStep, emitFromHeadlampActioned, emitFromHeadlampCommandCopy, emitFromHeadlampTabSwitch, emitFromHeadlampViewed, emitFromLensActioned, emitFromLensCommandCopy, emitFromLensTabSwitch, emitFromLensViewed, emitInstallCommandCopied, emitLocalClusterCreated, emitMarketplaceInstall, emitMarketplaceInstallFailed, emitMarketplaceItemViewed, emitMarketplaceRemove, emitWelcomeActioned, emitWelcomeViewed, emitWhiteLabelActioned, emitWhiteLabelCommandCopy, emitWhiteLabelTabSwitch, emitWhiteLabelViewed } from './analytics-events.shared'

describe('analytics-events/marketplace', () => {
  it('emitMarketplaceInstall sends item_type and item_name', () => {
    emitMarketplaceInstall('extension', 'trivy')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install', {
      item_type: 'extension',
      item_name: 'trivy',
    })
  })

  it('emitMarketplaceRemove sends item_type', () => {
    emitMarketplaceRemove('extension')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_remove', { item_type: 'extension' })
  })

  it('emitMarketplaceInstallFailed truncates error to 100 chars', () => {
    const longErr = 'z'.repeat(150)
    emitMarketplaceInstallFailed('extension', 'trivy', longErr, 'download')
    const payload = mockSend.mock.calls[0][1] as Record<string, unknown>
    expect((payload.error_detail as string).length).toBeLessThanOrEqual(100)
    expect(payload.failure_stage).toBe('download')
  })

  it('emitMarketplaceInstallFailed sends all fields on short error', () => {
    emitMarketplaceInstallFailed('extension', 'kyverno', 'timeout', 'http_error')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_install_failed', {
      item_type: 'extension',
      item_name: 'kyverno',
      error_detail: 'timeout',
      failure_stage: 'http_error',
    })
  })

  it('emitMarketplaceItemViewed sends item_type and item_name', () => {
    emitMarketplaceItemViewed('dashboard', 'security-overview')
    expect(mockSend).toHaveBeenCalledWith('ksc_marketplace_item_viewed', {
      item_type: 'dashboard',
      item_name: 'security-overview',
    })
  })

  it('emitInstallCommandCopied sends source and command', () => {
    emitInstallCommandCopied('from_lens', 'helm install ks ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_install_command_copied', {
      source: 'from_lens',
      command: 'helm install ks ...',
    })
  })

  it('emitConversionStep sends step_number, step_name, and extra details', () => {
    emitConversionStep(2, 'connect-cluster', { method: 'kubeconfig' })
    expect(mockSend).toHaveBeenCalledWith('ksc_conversion_step', {
      step_number: 2,
      step_name: 'connect-cluster',
      method: 'kubeconfig',
    })
  })

  it('emitLocalClusterCreated sends tool', () => {
    emitLocalClusterCreated('kind')
    expect(mockSend).toHaveBeenCalledWith('ksc_local_cluster_created', { tool: 'kind' })
  })

  it('emitWelcomeViewed sends ref', () => {
    emitWelcomeViewed('docs')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_viewed', { ref: 'docs' })
  })

  it('emitWelcomeActioned sends action and ref', () => {
    emitWelcomeActioned('start', 'homepage')
    expect(mockSend).toHaveBeenCalledWith('ksc_welcome_actioned', { action: 'start', ref: 'homepage' })
  })

  it('emitFromLensViewed sends ksc_from_lens_viewed', () => {
    emitFromLensViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_viewed')
  })

  it('emitFromLensActioned sends action', () => {
    emitFromLensActioned('install')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_actioned', { action: 'install' })
  })

  it('emitFromLensTabSwitch sends tab', () => {
    emitFromLensTabSwitch('quickstart')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_tab_switch', { tab: 'quickstart' })
  })

  it('emitFromLensCommandCopy sends tab, step, command', () => {
    emitFromLensCommandCopy('quickstart', 1, 'helm install ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_lens_command_copy', {
      tab: 'quickstart',
      step: 1,
      command: 'helm install ...',
    })
  })

  it('emitFromHeadlampViewed sends ksc_from_headlamp_viewed', () => {
    emitFromHeadlampViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_viewed')
  })

  it('emitFromHeadlampActioned sends action', () => {
    emitFromHeadlampActioned('install')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_actioned', { action: 'install' })
  })

  it('emitFromHeadlampTabSwitch sends tab', () => {
    emitFromHeadlampTabSwitch('k8s')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_tab_switch', { tab: 'k8s' })
  })

  it('emitFromHeadlampCommandCopy sends tab, step, command', () => {
    emitFromHeadlampCommandCopy('k8s', 2, 'kubectl apply ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_from_headlamp_command_copy', {
      tab: 'k8s',
      step: 2,
      command: 'kubectl apply ...',
    })
  })

  it('emitWhiteLabelViewed sends ksc_white_label_viewed', () => {
    emitWhiteLabelViewed()
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_viewed')
  })

  it('emitWhiteLabelActioned sends action', () => {
    emitWhiteLabelActioned('contact')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_actioned', { action: 'contact' })
  })

  it('emitWhiteLabelTabSwitch sends tab', () => {
    emitWhiteLabelTabSwitch('pricing')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_tab_switch', { tab: 'pricing' })
  })

  it('emitWhiteLabelCommandCopy sends tab, step, command', () => {
    emitWhiteLabelCommandCopy('pricing', 3, 'curl ...')
    expect(mockSend).toHaveBeenCalledWith('ksc_white_label_command_copy', {
      tab: 'pricing',
      step: 3,
      command: 'curl ...',
    })
  })
})
