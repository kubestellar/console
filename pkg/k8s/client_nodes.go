package k8s

import (
	"context"
	"fmt"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// NodeCondition represents a node condition status
type NodeCondition struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`
}

// NodeInfo represents detailed node information
type NodeInfo struct {
	Name             string            `json:"name"`
	Cluster          string            `json:"cluster,omitempty"`
	Status           string            `json:"status"` // Ready, NotReady, Unknown
	Roles            []string          `json:"roles"`
	InternalIP       string            `json:"internalIP,omitempty"`
	ExternalIP       string            `json:"externalIP,omitempty"`
	KubeletVersion   string            `json:"kubeletVersion"`
	ContainerRuntime string            `json:"containerRuntime,omitempty"`
	OS               string            `json:"os,omitempty"`
	OSImage          string            `json:"osImage,omitempty"`
	Architecture     string            `json:"architecture,omitempty"`
	CPUCapacity      string            `json:"cpuCapacity"`
	MemoryCapacity   string            `json:"memoryCapacity"`
	StorageCapacity  string            `json:"storageCapacity,omitempty"`
	PodCapacity      string            `json:"podCapacity"`
	GPUCount         int               `json:"gpuCount"`
	GPUType          string            `json:"gpuType,omitempty"`
	NICCount         int               `json:"nicCount,omitempty"`        // Network interface count (from NFD)
	NVMECount        int               `json:"nvmeCount,omitempty"`       // NVME device count (from NFD)
	InfiniBandCount  int               `json:"infinibandCount,omitempty"` // InfiniBand HCA count
	Conditions       []NodeCondition   `json:"conditions"`
	Labels           map[string]string `json:"labels,omitempty"`
	Taints           []string          `json:"taints,omitempty"`
	Age              string            `json:"age,omitempty"`
	Unschedulable    bool              `json:"unschedulable"`
}

// FlatcarNodeInfo represents a Kubernetes node running Flatcar Container Linux.
// Only nodes whose OSImage contains "flatcar" (case-insensitive) are returned.
type FlatcarNodeInfo struct {
	NodeName      string `json:"nodeName"`
	Cluster       string `json:"cluster"`
	OSImage       string `json:"osImage"`
	KernelVersion string `json:"kernelVersion"`
}

// GetGPUNodes returns nodes with GPU resources

func (m *MultiClusterClient) GetNodes(ctx context.Context, contextName string) ([]NodeInfo, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var nodeInfos []NodeInfo
	for _, node := range nodes.Items {
		info := NodeInfo{
			Name:           node.Name,
			Cluster:        contextName,
			KubeletVersion: node.Status.NodeInfo.KubeletVersion,
			OS:             node.Status.NodeInfo.OperatingSystem,
			OSImage:        node.Status.NodeInfo.OSImage,
			Architecture:   node.Status.NodeInfo.Architecture,
			Unschedulable:  node.Spec.Unschedulable,
		}

		// Get container runtime
		info.ContainerRuntime = node.Status.NodeInfo.ContainerRuntimeVersion

		// Get roles from labels
		for label := range node.Labels {
			if strings.HasPrefix(label, "node-role.kubernetes.io/") {
				role := strings.TrimPrefix(label, "node-role.kubernetes.io/")
				if role != "" {
					info.Roles = append(info.Roles, role)
				}
			}
		}
		if len(info.Roles) == 0 {
			info.Roles = []string{"worker"}
		}

		// Get IPs
		for _, addr := range node.Status.Addresses {
			switch addr.Type {
			case "InternalIP":
				info.InternalIP = addr.Address
			case "ExternalIP":
				info.ExternalIP = addr.Address
			}
		}

		// Report schedulable resources. CPU, memory, and pod density come from
		// capacity, but ephemeral storage must prefer allocatable because
		// containerized clusters (Docker Desktop, kind, etc.) can expose the host
		// filesystem size in capacity while allocatable reflects the storage the
		// kubelet actually makes available to pods.
		if cpu, ok := node.Status.Capacity["cpu"]; ok {
			info.CPUCapacity = cpu.String()
		}
		if mem, ok := node.Status.Capacity["memory"]; ok {
			info.MemoryCapacity = mem.String()
		}
		if storage, ok := node.Status.Allocatable["ephemeral-storage"]; ok {
			info.StorageCapacity = storage.String()
		} else if storage, ok := node.Status.Capacity["ephemeral-storage"]; ok {
			info.StorageCapacity = storage.String()
		}
		if pods, ok := node.Status.Capacity["pods"]; ok {
			info.PodCapacity = pods.String()
		}

		// Get GPU count from allocatable resources (nvidia, amd, intel)
		if gpu, ok := node.Status.Allocatable["nvidia.com/gpu"]; ok {
			info.GPUCount = int(gpu.Value())
			// Get GPU type from labels
			if gpuType, ok := node.Labels["nvidia.com/gpu.product"]; ok {
				info.GPUType = gpuType
			}
		} else if gpu, ok := node.Status.Allocatable["amd.com/gpu"]; ok {
			info.GPUCount = int(gpu.Value())
			info.GPUType = "AMD GPU"
		} else if gpu, ok := node.Status.Allocatable["gpu.intel.com/i915"]; ok {
			info.GPUCount = int(gpu.Value())
			info.GPUType = "Intel GPU"
		}

		// Get NIC/InfiniBand count from allocatable resources and labels
		// Check for Mellanox InfiniBand HCAs (common on HGX systems)
		for key, val := range node.Status.Allocatable {
			keyStr := string(key)
			if strings.HasPrefix(keyStr, "rdma/") || strings.Contains(keyStr, "hca") {
				info.InfiniBandCount += int(val.Value())
			}
			// NVIDIA ConnectX NICs
			if strings.Contains(keyStr, "mellanox") || strings.Contains(keyStr, "connectx") {
				info.NICCount += int(val.Value())
			}
		}
		// Fallback: count from NFD labels (feature.node.kubernetes.io/pci-15b3.present = Mellanox)
		if info.InfiniBandCount == 0 {
			for key := range node.Labels {
				if strings.Contains(key, "pci-15b3") || strings.Contains(key, "infiniband") {
					info.InfiniBandCount = 1 // At least one present
					break
				}
			}
		}

		// Get NVME count from NFD labels or allocatable resources
		for key := range node.Labels {
			if strings.Contains(key, "nvme") && strings.Contains(key, "present") {
				info.NVMECount = 1 // NFD marks presence, count from capacity if available
				break
			}
		}
		// Check allocatable for explicit NVME count (some device plugins expose this)
		for key, val := range node.Status.Allocatable {
			keyStr := string(key)
			if strings.Contains(keyStr, "nvme") {
				info.NVMECount = int(val.Value())
				break
			}
		}

		// Get conditions
		info.Status = "Unknown"
		for _, cond := range node.Status.Conditions {
			info.Conditions = append(info.Conditions, NodeCondition{
				Type:    string(cond.Type),
				Status:  string(cond.Status),
				Reason:  cond.Reason,
				Message: cond.Message,
			})
			if cond.Type == "Ready" {
				if cond.Status == "True" {
					info.Status = "Ready"
				} else {
					info.Status = "NotReady"
				}
			}
		}

		// Get labels (filter out some verbose ones, but keep topology labels for region detection)
		info.Labels = make(map[string]string)
		for k, v := range node.Labels {
			// Always include topology labels needed for region/zone detection
			if strings.HasPrefix(k, "topology.kubernetes.io/") ||
				strings.HasPrefix(k, "failure-domain.beta.kubernetes.io/") ||
				strings.Contains(k, "region") ||
				strings.Contains(k, "zone") {
				info.Labels[k] = v
				continue
			}
			// Skip very long or system labels
			if !strings.HasPrefix(k, "node.kubernetes.io/") &&
				!strings.HasPrefix(k, "kubernetes.io/") &&
				!strings.HasPrefix(k, "beta.kubernetes.io/") &&
				len(v) < 100 {
				info.Labels[k] = v
			}
		}

		// Get taints
		for _, taint := range node.Spec.Taints {
			taintStr := fmt.Sprintf("%s=%s:%s", taint.Key, taint.Value, taint.Effect)
			info.Taints = append(info.Taints, taintStr)
		}

		// Calculate age
		age := time.Since(node.CreationTimestamp.Time)
		if age.Hours() >= 24*365 {
			info.Age = fmt.Sprintf("%.0fy", age.Hours()/(24*365))
		} else if age.Hours() >= 24 {
			info.Age = fmt.Sprintf("%.0fd", age.Hours()/24)
		} else if age.Hours() >= 1 {
			info.Age = fmt.Sprintf("%.0fh", age.Hours())
		} else {
			info.Age = fmt.Sprintf("%.0fm", age.Minutes())
		}

		nodeInfos = append(nodeInfos, info)
	}

	return nodeInfos, nil
}

// GetFlatcarNodes returns information about nodes running Flatcar Container Linux
// in the given cluster. Detection is based on OSImage containing "flatcar"
// (case-insensitive).
func (m *MultiClusterClient) GetFlatcarNodes(ctx context.Context, contextName string) ([]FlatcarNodeInfo, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []FlatcarNodeInfo
	for _, node := range nodes.Items {
		osImage := node.Status.NodeInfo.OSImage
		if strings.Contains(strings.ToLower(osImage), "flatcar") {
			result = append(result, FlatcarNodeInfo{
				NodeName:      node.Name,
				Cluster:       contextName,
				OSImage:       osImage,
				KernelVersion: node.Status.NodeInfo.KernelVersion,
			})
		}
	}
	return result, nil
}

// FindDeploymentIssues returns deployments with issues
