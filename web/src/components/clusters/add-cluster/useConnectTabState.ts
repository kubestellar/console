import { useMemo } from 'react'
import type { CloudProvider, ConnectState, ConnectStep } from './types'

export interface ConnectTestResult {
  reachable: boolean
  serverVersion?: string
  error?: string
}

export interface ConnectTabStateInput {
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
  testResult: ConnectTestResult | null
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

export type ConnectTabState = ConnectTabStateInput

export function useConnectTabState(input: ConnectTabStateInput): ConnectTabState {
  return useMemo(() => input, [
    input.authType,
    input.caData,
    input.certData,
    input.clusterName,
    input.connectError,
    input.connectState,
    input.connectStep,
    input.contextName,
    input.goToConnectStep,
    input.handleAddCluster,
    input.handleTestConnection,
    input.keyData,
    input.namespace,
    input.resetTestResult,
    input.selectedCloudProvider,
    input.serverUrl,
    input.setAuthType,
    input.setCaData,
    input.setCertData,
    input.setClusterName,
    input.setConnectStep,
    input.setContextName,
    input.setKeyData,
    input.setNamespace,
    input.setSelectedCloudProvider,
    input.setServerUrl,
    input.setShowAdvanced,
    input.setSkipTls,
    input.setToken,
    input.showAdvanced,
    input.skipTls,
    input.testResult,
    input.token,
  ])
}
