import { describe, it, expect } from 'vitest'
import { CLOUD_IAM_COMMANDS, getCloudIAMProviderKey } from '../ConnectTab.constants'
import type { CloudProvider } from '../types'

describe('ConnectTab.constants', () => {
  describe('CLOUD_IAM_COMMANDS', () => {
    it.each([
      ['eks', 'aws'],
      ['gke', 'gcloud'],
      ['aks', 'az'],
      ['openshift', 'oc'],
    ] as [CloudProvider, string][])('defines cliName %s -> %s', (provider, cliName) => {
      expect(CLOUD_IAM_COMMANDS[provider].cliName).toBe(cliName)
    })

    it('provides a non-empty auth command for every provider', () => {
      for (const provider of Object.keys(CLOUD_IAM_COMMANDS) as CloudProvider[]) {
        expect(CLOUD_IAM_COMMANDS[provider].auth.length).toBeGreaterThan(0)
      }
    })

    it('leaves openshift register command empty since oc login sets up kubeconfig', () => {
      expect(CLOUD_IAM_COMMANDS.openshift.register).toBe('')
    })

    it('provides a non-empty register command for eks, gke, aks', () => {
      expect(CLOUD_IAM_COMMANDS.eks.register.length).toBeGreaterThan(0)
      expect(CLOUD_IAM_COMMANDS.gke.register.length).toBeGreaterThan(0)
      expect(CLOUD_IAM_COMMANDS.aks.register.length).toBeGreaterThan(0)
    })
  })

  describe('getCloudIAMProviderKey', () => {
    it.each([
      ['eks', 'AWS'],
      ['gke', 'GKE'],
      ['aks', 'AKS'],
      ['openshift', 'OpenShift'],
    ] as [CloudProvider, string][])('maps %s -> %s', (provider, expected) => {
      expect(getCloudIAMProviderKey(provider)).toBe(expected)
    })
  })
})
