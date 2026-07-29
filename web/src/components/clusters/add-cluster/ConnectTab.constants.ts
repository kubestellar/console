import type { CloudProvider } from './types'

// Cloud provider IAM auth commands — two steps: authenticate, then register cluster
export const CLOUD_IAM_COMMANDS: Record<CloudProvider, { auth: string; register: string; cliName: string }> = {
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

/** Maps a CloudProvider id to its i18n translation-key suffix, e.g. 'eks' -> 'AWS'. */
export function getCloudIAMProviderKey(provider: CloudProvider): 'AWS' | 'GKE' | 'AKS' | 'OpenShift' {
  switch (provider) {
    case 'eks':
      return 'AWS'
    case 'gke':
      return 'GKE'
    case 'aks':
      return 'AKS'
    case 'openshift':
      return 'OpenShift'
  }
}
