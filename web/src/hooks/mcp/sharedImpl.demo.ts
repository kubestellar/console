// Demo data for cluster cache

import type { ClusterInfo } from './types'

export function getDemoClusters(): ClusterInfo[] {
  return [
    // One cluster for each provider type to showcase all icons
    { name: 'kind-local', context: 'kind-local', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 1, podCount: 15, cpuCores: 4, memoryGB: 8, storageGB: 50, cpuRequestsCores: 2.1, memoryRequestsGB: 5, distribution: 'kind' },
    { name: 'minikube', context: 'minikube', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 1, podCount: 12, cpuCores: 2, memoryGB: 4, storageGB: 20, cpuRequestsCores: 0.8, memoryRequestsGB: 2, distribution: 'minikube' },
    { name: 'k3s-edge', context: 'k3s-edge', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 3, podCount: 28, cpuCores: 6, memoryGB: 12, storageGB: 100, cpuRequestsCores: 3.5, memoryRequestsGB: 7, distribution: 'k3s' },
    { name: 'eks-prod-us-east-1', context: 'eks-prod', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 12, podCount: 156, cpuCores: 96, memoryGB: 384, storageGB: 2000, cpuRequestsCores: 62, memoryRequestsGB: 245, server: 'https://ABC123.gr7.us-east-1.eks.amazonaws.com', distribution: 'eks' },
    { name: 'gke-staging', context: 'gke-staging', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 6, podCount: 78, cpuCores: 48, memoryGB: 192, storageGB: 1000, cpuRequestsCores: 18, memoryRequestsGB: 72, distribution: 'gke' },
    { name: 'aks-dev-westeu', context: 'aks-dev', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 4, podCount: 45, cpuCores: 32, memoryGB: 128, storageGB: 500, cpuRequestsCores: 11, memoryRequestsGB: 48, server: 'https://aks-dev-dns-abc123.hcp.westeurope.azmk8s.io:443', distribution: 'aks' },
    { name: 'openshift-prod', context: 'ocp-prod', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 9, podCount: 234, cpuCores: 72, memoryGB: 288, storageGB: 1500, cpuRequestsCores: 54, memoryRequestsGB: 210, server: 'api.openshift-prod.example.com:6443', distribution: 'openshift', namespaces: ['openshift-operators', 'openshift-monitoring'] },
    { name: 'oci-oke-phoenix', context: 'oke-phoenix', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 5, podCount: 67, cpuCores: 40, memoryGB: 160, storageGB: 800, cpuRequestsCores: 22, memoryRequestsGB: 88, server: 'https://abc123.us-phoenix-1.clusters.oci.oraclecloud.com:6443', distribution: 'oci' },
    { name: 'alibaba-ack-shanghai', context: 'ack-shanghai', healthy: false, source: 'kubeconfig', isDemo: true, nodeCount: 8, podCount: 112, cpuCores: 64, memoryGB: 256, storageGB: 1200, cpuRequestsCores: 38, memoryRequestsGB: 154, distribution: 'alibaba' },
    { name: 'do-nyc1-prod', context: 'do-nyc1', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 3, podCount: 34, cpuCores: 12, memoryGB: 48, storageGB: 300, cpuRequestsCores: 5, memoryRequestsGB: 22, distribution: 'digitalocean' },
    { name: 'rancher-mgmt', context: 'rancher-mgmt', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 3, podCount: 89, cpuCores: 24, memoryGB: 96, storageGB: 400, cpuRequestsCores: 14, memoryRequestsGB: 58, distribution: 'rancher' },
    { name: 'vllm-gpu-cluster', context: 'vllm-d', healthy: true, source: 'kubeconfig', isDemo: true, nodeCount: 8, podCount: 124, cpuCores: 256, memoryGB: 2048, storageGB: 8000, cpuRequestsCores: 192, memoryRequestsGB: 1536, distribution: 'kubernetes' },
  ]
}
