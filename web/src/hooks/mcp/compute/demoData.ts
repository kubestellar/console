// Static demo/fallback data for GPU nodes and compute nodes. Extracted from
// compute.ts so the hook implementation file stays under the max-lines limit
// (tracked by #15790, split by #21606). No behaviour change — same data as
// before, just moved to a sibling module.

import type { GPUNode, NodeInfo } from '../types'

export function getDemoGPUNodes(): GPUNode[] {
  return [
    // vllm-gpu-cluster - Large GPU cluster for AI/ML workloads
    { name: 'gpu-node-1', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    { name: 'gpu-node-2', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 8, acceleratorType: 'GPU' },
    { name: 'gpu-node-3', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA A100', gpuCount: 8, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'gpu-node-4', cluster: 'vllm-gpu-cluster', gpuType: 'NVIDIA H100', gpuCount: 8, gpuAllocated: 7, acceleratorType: 'GPU' },
    // EKS - Production ML inference
    { name: 'eks-gpu-1', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    { name: 'eks-gpu-2', cluster: 'eks-prod-us-east-1', gpuType: 'NVIDIA A10G', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    // GKE - Training workloads with GPUs and TPUs
    { name: 'gke-gpu-pool-1', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    { name: 'gke-gpu-pool-2', cluster: 'gke-staging', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 2, acceleratorType: 'GPU' },
    // GKE - TPU nodes (Google Cloud)
    { name: 'gke-tpu-node-1', cluster: 'gke-staging', gpuType: 'Google TPU v4', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'TPU', manufacturer: 'Google' },
    { name: 'gke-tpu-node-2', cluster: 'gke-staging', gpuType: 'Google TPU v5e', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'TPU', manufacturer: 'Google' },
    // AKS - Dev/test GPUs
    { name: 'aks-gpu-node', cluster: 'aks-dev-westeu', gpuType: 'NVIDIA V100', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
    // OpenShift - Enterprise ML
    { name: 'ocp-gpu-worker-1', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 4, acceleratorType: 'GPU' },
    { name: 'ocp-gpu-worker-2', cluster: 'openshift-prod', gpuType: 'NVIDIA A100', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'GPU' },
    // Intel Gaudi (AI accelerator, classified as GPU)
    { name: 'gaudi-node-1', cluster: 'openshift-prod', gpuType: 'Intel Gaudi2', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU', manufacturer: 'Intel' },
    // IBM AIU nodes (on OCI cluster)
    { name: 'oci-aiu-node-1', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'AIU', manufacturer: 'IBM' },
    { name: 'oci-aiu-node-2', cluster: 'oci-oke-phoenix', gpuType: 'IBM AIU', gpuCount: 4, gpuAllocated: 2, acceleratorType: 'AIU', manufacturer: 'IBM' },
    // Intel XPU nodes (on AKS cluster)
    { name: 'aks-xpu-node-1', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Max', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'XPU', manufacturer: 'Intel' },
    { name: 'aks-xpu-node-2', cluster: 'aks-dev-westeu', gpuType: 'Intel Data Center GPU Flex', gpuCount: 8, gpuAllocated: 5, acceleratorType: 'XPU', manufacturer: 'Intel' },
    // OCI - Oracle GPU shapes
    { name: 'oke-gpu-node', cluster: 'oci-oke-phoenix', gpuType: 'NVIDIA A10', gpuCount: 4, gpuAllocated: 3, acceleratorType: 'GPU' },
    // Alibaba - China region ML
    { name: 'ack-gpu-worker', cluster: 'alibaba-ack-shanghai', gpuType: 'NVIDIA V100', gpuCount: 8, gpuAllocated: 6, acceleratorType: 'GPU' },
    // Rancher - Managed GPU pool
    { name: 'rancher-gpu-1', cluster: 'rancher-mgmt', gpuType: 'NVIDIA T4', gpuCount: 2, gpuAllocated: 1, acceleratorType: 'GPU' },
  ]
}

export function getDemoNodes(): NodeInfo[] {
  return [
    {
      name: 'node-1',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['control-plane', 'master'],
      internalIP: '10.0.1.10',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '8',
      memoryCapacity: '32Gi',
      storageCapacity: '200Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node-role.kubernetes.io/control-plane': '' },
      taints: ['node-role.kubernetes.io/control-plane:NoSchedule'],
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'node-2',
      cluster: 'prod-east',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.1.11',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '16',
      memoryCapacity: '64Gi',
      storageCapacity: '500Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'node.kubernetes.io/instance-type': 'm5.4xlarge' },
      age: '45d',
      unschedulable: false,
    },
    {
      name: 'gpu-node-1',
      cluster: 'vllm-d',
      status: 'Ready',
      roles: ['worker'],
      internalIP: '10.0.2.20',
      kubeletVersion: 'v1.28.4',
      containerRuntime: 'containerd://1.6.24',
      os: 'Ubuntu 22.04.3 LTS',
      architecture: 'amd64',
      cpuCapacity: '32',
      memoryCapacity: '128Gi',
      storageCapacity: '1Ti',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      labels: { 'nvidia.com/gpu': 'true', 'node.kubernetes.io/instance-type': 'p3.8xlarge' },
      age: '30d',
      unschedulable: false,
    },
    {
      name: 'kind-control-plane',
      cluster: 'kind-local',
      status: 'Ready',
      roles: ['control-plane'],
      internalIP: '172.18.0.2',
      kubeletVersion: 'v1.27.3',
      containerRuntime: 'containerd://1.7.1',
      os: 'Ubuntu 22.04.2 LTS',
      architecture: 'amd64',
      cpuCapacity: '4',
      memoryCapacity: '8Gi',
      storageCapacity: '50Gi',
      podCapacity: '110',
      conditions: [{ type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'kubelet is posting ready status' }],
      age: '7d',
      unschedulable: false,
    },
  ]
}
