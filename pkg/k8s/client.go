package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	authorizationv1 "k8s.io/api/authorization/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

const (
	clusterHealthCheckTimeout = 8 * time.Second
	clusterProbeTimeout       = 5 * time.Second
	k8sClientTimeout          = 45 * time.Second
	clusterCacheTTL           = 60 * time.Second
	podIssueAgeThreshold      = 5 * time.Minute
	podPendingAgeThreshold    = 2 * time.Minute
	clusterEventDebounce      = 500 * time.Millisecond
	clusterEventPollInterval  = 5 * time.Second
	slowClusterTTL            = 2 * time.Minute
)

// MultiClusterClient manages connections to multiple Kubernetes clusters
type MultiClusterClient struct {
	mu              sync.RWMutex
	kubeconfig      string
	clients         map[string]kubernetes.Interface
	dynamicClients  map[string]dynamic.Interface
	configs         map[string]*rest.Config
	rawConfig       *api.Config
	healthCache     map[string]*ClusterHealth
	cacheTTL        time.Duration
	cacheTime       map[string]time.Time
	watcher         *fsnotify.Watcher
	stopWatch       chan struct{}
	onReload        func()               // Callback when config is reloaded
	inClusterConfig *rest.Config         // In-cluster config when running inside k8s
	slowClusters    map[string]time.Time // clusters that recently timed out (reduced timeout)
}

// IsInCluster returns true if the server is running inside a Kubernetes cluster
// (i.e., has a valid in-cluster ServiceAccount config).
func (m *MultiClusterClient) IsInCluster() bool {
	return m.inClusterConfig != nil
}

// SetDynamicClient injects a dynamic client for a cluster (for testing)
func (m *MultiClusterClient) SetDynamicClient(cluster string, client dynamic.Interface) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dynamicClients == nil {
		m.dynamicClients = make(map[string]dynamic.Interface)
	}
	m.dynamicClients[cluster] = client
}

// SetClient injects a typed client for a cluster (for testing)
func (m *MultiClusterClient) SetClient(cluster string, client kubernetes.Interface) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.clients == nil {
		m.clients = make(map[string]kubernetes.Interface)
	}
	m.clients[cluster] = client
}

// SetRawConfig sets the raw kubeconfig (for testing)
func (m *MultiClusterClient) SetRawConfig(config *api.Config) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rawConfig = config
}

// GetRawConfig returns the raw kubeconfig (for testing)
func (m *MultiClusterClient) GetRawConfig() *api.Config {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rawConfig
}

// InjectClient injects a typed client for a cluster (for testing)
func (m *MultiClusterClient) InjectClient(contextName string, client kubernetes.Interface) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.clients == nil {
		m.clients = make(map[string]kubernetes.Interface)
	}
	m.clients[contextName] = client
}

// InjectDynamicClient injects a dynamic client for a cluster (for testing)
func (m *MultiClusterClient) InjectDynamicClient(contextName string, client dynamic.Interface) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dynamicClients == nil {
		m.dynamicClients = make(map[string]dynamic.Interface)
	}
	m.dynamicClients[contextName] = client
}

// Reload reloads the kubeconfig from disk
func (m *MultiClusterClient) Reload() error {
	config, err := clientcmd.LoadFromFile(m.kubeconfig)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.rawConfig = config
	m.mu.Unlock()
	return nil
}

// ClusterInfo represents basic cluster information
type ClusterInfo struct {
	Name      string `json:"name"`
	Context   string `json:"context"`
	Server    string `json:"server,omitempty"`
	User      string `json:"user,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	Healthy   bool   `json:"healthy"`
	Source    string `json:"source,omitempty"`
	NodeCount int    `json:"nodeCount,omitempty"`
	PodCount  int    `json:"podCount,omitempty"`
	IsCurrent bool   `json:"isCurrent,omitempty"`
}

// ClusterHealth represents cluster health status
type ClusterHealth struct {
	Cluster      string `json:"cluster"`
	Healthy      bool   `json:"healthy"`
	Reachable    bool   `json:"reachable"`
	LastSeen     string `json:"lastSeen,omitempty"`
	ErrorType    string `json:"errorType,omitempty"` // timeout, auth, network, certificate, unknown
	ErrorMessage string `json:"errorMessage,omitempty"`
	APIServer    string `json:"apiServer,omitempty"`
	NodeCount    int    `json:"nodeCount"`
	ReadyNodes   int    `json:"readyNodes"`
	PodCount     int    `json:"podCount"`
	// Total allocatable resources (capacity)
	CpuCores     int     `json:"cpuCores"`
	MemoryBytes  int64   `json:"memoryBytes"`  // Total allocatable memory in bytes
	MemoryGB     float64 `json:"memoryGB"`     // Total allocatable memory in GB
	StorageBytes int64   `json:"storageBytes"` // Total ephemeral storage in bytes
	StorageGB    float64 `json:"storageGB"`    // Total ephemeral storage in GB
	// Resource requests (allocated/used)
	CpuRequestsMillicores int64   `json:"cpuRequestsMillicores,omitempty"` // Sum of pod CPU requests in millicores
	CpuRequestsCores      float64 `json:"cpuRequestsCores,omitempty"`      // Sum of pod CPU requests in cores
	MemoryRequestsBytes   int64   `json:"memoryRequestsBytes,omitempty"`   // Sum of pod memory requests in bytes
	MemoryRequestsGB      float64 `json:"memoryRequestsGB,omitempty"`      // Sum of pod memory requests in GB
	// PVC metrics
	PVCCount      int `json:"pvcCount,omitempty"`      // Total PVC count
	PVCBoundCount int `json:"pvcBoundCount,omitempty"` // Bound PVC count
	// Issues and timing
	Issues    []string `json:"issues,omitempty"`
	CheckedAt string   `json:"checkedAt,omitempty"`
}

// PodInfo represents pod information
type PodInfo struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Status      string            `json:"status"`
	Ready       string            `json:"ready"`
	Restarts    int               `json:"restarts"`
	Age         string            `json:"age"`
	Node        string            `json:"node,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Containers  []ContainerInfo   `json:"containers,omitempty"`
}

// ContainerInfo represents container information
type ContainerInfo struct {
	Name         string `json:"name"`
	Image        string `json:"image"`
	Ready        bool   `json:"ready"`
	State        string `json:"state"` // running, waiting, terminated
	Reason       string `json:"reason,omitempty"`
	Message      string `json:"message,omitempty"`
	GPURequested int    `json:"gpuRequested,omitempty"` // Number of GPUs requested by this container
}

// PodIssue represents a pod with issues
type PodIssue struct {
	Name      string   `json:"name"`
	Namespace string   `json:"namespace"`
	Cluster   string   `json:"cluster,omitempty"`
	Status    string   `json:"status"`
	Reason    string   `json:"reason,omitempty"`
	Issues    []string `json:"issues"`
	Restarts  int      `json:"restarts"`
}

// Event represents a Kubernetes event
type Event struct {
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster,omitempty"`
	Count     int32  `json:"count"`
	Age       string `json:"age,omitempty"`
	FirstSeen string `json:"firstSeen,omitempty"`
	LastSeen  string `json:"lastSeen,omitempty"`
}

// DeploymentIssue represents a deployment with issues
type DeploymentIssue struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Cluster       string `json:"cluster,omitempty"`
	Replicas      int32  `json:"replicas"`
	ReadyReplicas int32  `json:"readyReplicas"`
	Reason        string `json:"reason,omitempty"`
	Message       string `json:"message,omitempty"`
}

// AcceleratorType represents the category of accelerator (GPU, TPU, AIU, XPU)
type AcceleratorType string

const (
	AcceleratorGPU AcceleratorType = "GPU"
	AcceleratorTPU AcceleratorType = "TPU"
	AcceleratorAIU AcceleratorType = "AIU" // Intel Gaudi
	AcceleratorXPU AcceleratorType = "XPU" // Intel XPU
)

// GPUNode represents a node with accelerator resources (GPU, TPU, AIU, XPU)
type GPUNode struct {
	Name            string          `json:"name"`
	Cluster         string          `json:"cluster"`
	GPUType         string          `json:"gpuType"`                   // Display name of accelerator (e.g., "NVIDIA A100", "Intel Gaudi2")
	GPUCount        int             `json:"gpuCount"`                  // Number of accelerators
	GPUAllocated    int             `json:"gpuAllocated"`              // Number of allocated accelerators
	AcceleratorType AcceleratorType `json:"acceleratorType,omitempty"` // GPU, TPU, AIU, or XPU
	// Enhanced GPU info from NVIDIA GPU Feature Discovery
	GPUMemoryMB        int    `json:"gpuMemoryMB,omitempty"`        // GPU memory in MB
	GPUFamily          string `json:"gpuFamily,omitempty"`          // GPU architecture family (e.g., ampere, hopper)
	CUDADriverVersion  string `json:"cudaDriverVersion,omitempty"`  // CUDA driver version
	CUDARuntimeVersion string `json:"cudaRuntimeVersion,omitempty"` // CUDA runtime version
	MIGCapable         bool   `json:"migCapable,omitempty"`         // Whether MIG is supported
	MIGStrategy        string `json:"migStrategy,omitempty"`        // MIG strategy if enabled
	Manufacturer       string `json:"manufacturer,omitempty"`       // Manufacturer (NVIDIA, AMD, Intel, Google)
}

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

// GPUNodeHealthCheck represents a single health check result for a GPU node
type GPUNodeHealthCheck struct {
	Name    string `json:"name"` // e.g., "node_ready", "gpu_feature_discovery"
	Passed  bool   `json:"passed"`
	Message string `json:"message,omitempty"` // e.g., "CrashLoopBackOff (128 restarts)"
}

// GPUNodeHealthStatus represents the proactive health status of a GPU node
type GPUNodeHealthStatus struct {
	NodeName  string               `json:"nodeName"`
	Cluster   string               `json:"cluster"`
	Status    string               `json:"status"` // healthy, degraded, unhealthy
	GPUCount  int                  `json:"gpuCount"`
	GPUType   string               `json:"gpuType"`
	Checks    []GPUNodeHealthCheck `json:"checks"`
	Issues    []string             `json:"issues"`    // human-readable issue list
	StuckPods int                  `json:"stuckPods"` // count of stuck pods on this node
	CheckedAt string               `json:"checkedAt"` // RFC3339 timestamp
}

// GPUHealthCronJobStatus represents the status of the GPU health check CronJob on a cluster
type GPUHealthCronJobStatus struct {
	Installed       bool                   `json:"installed"`
	Cluster         string                 `json:"cluster"`
	Namespace       string                 `json:"namespace,omitempty"`
	Schedule        string                 `json:"schedule,omitempty"`
	Tier            int                    `json:"tier"`                  // 1-4: check depth level
	Version         int                    `json:"version"`               // installed script version
	UpdateAvailable bool                   `json:"updateAvailable"`       // newer script version exists
	LastRun         string                 `json:"lastRun,omitempty"`     // RFC3339 timestamp of last job completion
	LastResult      string                 `json:"lastResult,omitempty"`  // "success" or "failed"
	NextRun         string                 `json:"nextRun,omitempty"`     // RFC3339 timestamp of next scheduled run
	CanInstall      bool                   `json:"canInstall"`            // user has RBAC permissions to manage CronJobs
	ActiveJobs      int                    `json:"activeJobs"`            // currently running jobs
	FailedJobs      int                    `json:"failedJobs"`            // recent failed jobs
	SuccessJobs     int                    `json:"successJobs"`           // recent successful jobs
	LastResults     []GPUHealthCheckResult `json:"lastResults,omitempty"` // structured results from ConfigMap
}

// GPUHealthCheckResult represents health check results for a single GPU node from the CronJob ConfigMap
type GPUHealthCheckResult struct {
	NodeName string               `json:"nodeName"`
	Status   string               `json:"status"` // healthy, degraded, unhealthy
	Checks   []GPUNodeHealthCheck `json:"checks"`
	Issues   []string             `json:"issues"`
}

// GPU health CronJob constants
const (
	gpuHealthCronJobName        = "gpu-health-check"
	gpuHealthServiceAccount     = "gpu-health-checker"
	gpuHealthClusterRole        = "gpu-health-checker"
	gpuHealthClusterRoleBinding = "gpu-health-checker"
	gpuHealthDefaultSchedule    = "*/5 * * * *" // every 5 minutes
	gpuHealthDefaultNS          = "nvidia-gpu-operator"
	gpuHealthCheckerImage       = "bitnami/kubectl:latest"
	gpuHealthConfigMapName      = "gpu-health-results"
	gpuHealthScriptVersion      = 2 // bump when script changes
	gpuHealthDefaultTier        = 2 // standard tier by default
)

// Deployment represents a Kubernetes deployment with rollout status
type Deployment struct {
	Name              string            `json:"name"`
	Namespace         string            `json:"namespace"`
	Cluster           string            `json:"cluster,omitempty"`
	Status            string            `json:"status"` // running, deploying, failed
	Replicas          int32             `json:"replicas"`
	ReadyReplicas     int32             `json:"readyReplicas"`
	UpdatedReplicas   int32             `json:"updatedReplicas"`
	AvailableReplicas int32             `json:"availableReplicas"`
	Progress          int               `json:"progress"` // 0-100
	Image             string            `json:"image,omitempty"`
	Age               string            `json:"age,omitempty"`
	Labels            map[string]string `json:"labels,omitempty"`
	Annotations       map[string]string `json:"annotations,omitempty"`
}

// Service represents a Kubernetes service
type Service struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Type        string            `json:"type"` // ClusterIP, NodePort, LoadBalancer, ExternalName
	ClusterIP   string            `json:"clusterIP,omitempty"`
	ExternalIP  string            `json:"externalIP,omitempty"`
	Ports       []string          `json:"ports,omitempty"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// Job represents a Kubernetes job
type Job struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Status      string            `json:"status"` // Running, Complete, Failed
	Completions string            `json:"completions"`
	Duration    string            `json:"duration,omitempty"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// HPA represents a Horizontal Pod Autoscaler
type HPA struct {
	Name            string            `json:"name"`
	Namespace       string            `json:"namespace"`
	Cluster         string            `json:"cluster,omitempty"`
	Reference       string            `json:"reference"` // Target deployment/statefulset
	MinReplicas     int32             `json:"minReplicas"`
	MaxReplicas     int32             `json:"maxReplicas"`
	CurrentReplicas int32             `json:"currentReplicas"`
	TargetCPU       string            `json:"targetCPU,omitempty"`
	CurrentCPU      string            `json:"currentCPU,omitempty"`
	Age             string            `json:"age,omitempty"`
	Labels          map[string]string `json:"labels,omitempty"`
	Annotations     map[string]string `json:"annotations,omitempty"`
}

// ConfigMap represents a Kubernetes ConfigMap
type ConfigMap struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	DataCount   int               `json:"dataCount"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// Secret represents a Kubernetes Secret
type Secret struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Type        string            `json:"type"`
	DataCount   int               `json:"dataCount"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

// ServiceAccount represents a Kubernetes ServiceAccount
type ServiceAccount struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Cluster          string            `json:"cluster,omitempty"`
	Secrets          []string          `json:"secrets,omitempty"`
	ImagePullSecrets []string          `json:"imagePullSecrets,omitempty"`
	Age              string            `json:"age,omitempty"`
	Labels           map[string]string `json:"labels,omitempty"`
	Annotations      map[string]string `json:"annotations,omitempty"`
}

// PVC represents a Kubernetes PersistentVolumeClaim
type PVC struct {
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Cluster      string            `json:"cluster,omitempty"`
	Status       string            `json:"status"`
	Capacity     string            `json:"capacity,omitempty"`
	StorageClass string            `json:"storageClass,omitempty"`
	VolumeName   string            `json:"volumeName,omitempty"`
	AccessModes  []string          `json:"accessModes,omitempty"`
	Age          string            `json:"age,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
}

// PV represents a Kubernetes PersistentVolume
type PV struct {
	Name          string            `json:"name"`
	Cluster       string            `json:"cluster,omitempty"`
	Status        string            `json:"status"`
	Capacity      string            `json:"capacity,omitempty"`
	StorageClass  string            `json:"storageClass,omitempty"`
	ReclaimPolicy string            `json:"reclaimPolicy,omitempty"`
	AccessModes   []string          `json:"accessModes,omitempty"`
	ClaimRef      string            `json:"claimRef,omitempty"`
	VolumeMode    string            `json:"volumeMode,omitempty"`
	Age           string            `json:"age,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// ReplicaSet represents a Kubernetes ReplicaSet
type ReplicaSet struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Cluster       string            `json:"cluster,omitempty"`
	Replicas      int32             `json:"replicas"`
	ReadyReplicas int32             `json:"readyReplicas"`
	OwnerName     string            `json:"ownerName,omitempty"`
	OwnerKind     string            `json:"ownerKind,omitempty"`
	Age           string            `json:"age,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// StatefulSet represents a Kubernetes StatefulSet
type StatefulSet struct {
	Name          string            `json:"name"`
	Namespace     string            `json:"namespace"`
	Cluster       string            `json:"cluster,omitempty"`
	Replicas      int32             `json:"replicas"`
	ReadyReplicas int32             `json:"readyReplicas"`
	Status        string            `json:"status"`
	Image         string            `json:"image,omitempty"`
	Age           string            `json:"age,omitempty"`
	Labels        map[string]string `json:"labels,omitempty"`
}

// DaemonSet represents a Kubernetes DaemonSet
type DaemonSet struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Cluster          string            `json:"cluster,omitempty"`
	DesiredScheduled int32             `json:"desiredScheduled"`
	CurrentScheduled int32             `json:"currentScheduled"`
	Ready            int32             `json:"ready"`
	Status           string            `json:"status"`
	Age              string            `json:"age,omitempty"`
	Labels           map[string]string `json:"labels,omitempty"`
}

// CronJob represents a Kubernetes CronJob
type CronJob struct {
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Cluster      string            `json:"cluster,omitempty"`
	Schedule     string            `json:"schedule"`
	Suspend      bool              `json:"suspend"`
	Active       int               `json:"active"`
	LastSchedule string            `json:"lastSchedule,omitempty"`
	Age          string            `json:"age,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
}

// Ingress represents a Kubernetes Ingress
type Ingress struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Cluster   string            `json:"cluster,omitempty"`
	Class     string            `json:"class,omitempty"`
	Hosts     []string          `json:"hosts"`
	Address   string            `json:"address,omitempty"`
	Age       string            `json:"age,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// NetworkPolicy represents a Kubernetes NetworkPolicy
type NetworkPolicy struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	PolicyTypes []string          `json:"policyTypes"`
	PodSelector string            `json:"podSelector"`
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// SecurityIssue represents a security misconfiguration
type SecurityIssue struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster,omitempty"`
	Issue     string `json:"issue"`
	Severity  string `json:"severity"` // high, medium, low
	Details   string `json:"details,omitempty"`
}

// ResourceQuota represents a Kubernetes ResourceQuota
type ResourceQuota struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Cluster     string            `json:"cluster,omitempty"`
	Hard        map[string]string `json:"hard"` // Resource limits
	Used        map[string]string `json:"used"` // Current usage
	Age         string            `json:"age,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"` // Reservation metadata
}

// LimitRange represents a Kubernetes LimitRange
type LimitRange struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Cluster   string            `json:"cluster,omitempty"`
	Limits    []LimitRangeItem  `json:"limits"`
	Age       string            `json:"age,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
}

// LimitRangeItem represents a single limit in a LimitRange
type LimitRangeItem struct {
	Type           string            `json:"type"` // Pod, Container, PersistentVolumeClaim
	Default        map[string]string `json:"default,omitempty"`
	DefaultRequest map[string]string `json:"defaultRequest,omitempty"`
	Max            map[string]string `json:"max,omitempty"`
	Min            map[string]string `json:"min,omitempty"`
}

// NewMultiClusterClient creates a new multi-cluster client
func NewMultiClusterClient(kubeconfig string) (*MultiClusterClient, error) {
	if kubeconfig == "" {
		kubeconfig = os.Getenv("KUBECONFIG")
		if kubeconfig == "" {
			home, _ := os.UserHomeDir()
			kubeconfig = filepath.Join(home, ".kube", "config")
		}
	}

	client := &MultiClusterClient{
		kubeconfig:     kubeconfig,
		clients:        make(map[string]kubernetes.Interface),
		dynamicClients: make(map[string]dynamic.Interface),
		configs:        make(map[string]*rest.Config),
		healthCache:    make(map[string]*ClusterHealth),
		cacheTTL:       clusterCacheTTL,
		cacheTime:      make(map[string]time.Time),
		slowClusters:   make(map[string]time.Time),
	}

	// Try to detect if we're running in-cluster
	if _, err := os.Stat(kubeconfig); os.IsNotExist(err) {
		// No kubeconfig file, try in-cluster config
		if inClusterConfig, err := rest.InClusterConfig(); err == nil {
			log.Println("Using in-cluster config (no kubeconfig file found)")
			client.inClusterConfig = inClusterConfig
		}
	}

	return client, nil
}

// LoadConfig loads the kubeconfig
func (m *MultiClusterClient) LoadConfig() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If we have in-cluster config and no kubeconfig file, use that
	if m.inClusterConfig != nil {
		if _, err := os.Stat(m.kubeconfig); os.IsNotExist(err) {
			log.Println("No kubeconfig file, using in-cluster config only")
			m.rawConfig = nil
			m.clients = make(map[string]kubernetes.Interface)
			m.configs = make(map[string]*rest.Config)
			m.healthCache = make(map[string]*ClusterHealth)
			m.cacheTime = make(map[string]time.Time)
			return nil
		}
	}

	config, err := clientcmd.LoadFromFile(m.kubeconfig)
	if err != nil {
		return fmt.Errorf("failed to load kubeconfig: %w", err)
	}

	m.rawConfig = config
	// Clear cached clients when config reloads
	m.clients = make(map[string]kubernetes.Interface)
	m.dynamicClients = make(map[string]dynamic.Interface)
	m.configs = make(map[string]*rest.Config)
	m.healthCache = make(map[string]*ClusterHealth)
	m.cacheTime = make(map[string]time.Time)
	return nil
}

// StartWatching starts watching the kubeconfig file for changes.
// Uses fsnotify for instant detection plus a polling fallback every 5s
// to catch changes that fsnotify misses (common on macOS after atomic writes).
func (m *MultiClusterClient) StartWatching() error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("failed to create watcher: %w", err)
	}

	m.watcher = watcher
	m.stopWatch = make(chan struct{})

	// Watch the kubeconfig file
	if err := watcher.Add(m.kubeconfig); err != nil {
		watcher.Close()
		return fmt.Errorf("failed to watch kubeconfig: %w", err)
	}

	// Also watch the directory (for editors that do atomic saves)
	dir := filepath.Dir(m.kubeconfig)
	if err := watcher.Add(dir); err != nil {
		log.Printf("Warning: could not watch kubeconfig directory: %v", err)
	}

	go m.watchLoop()
	log.Printf("Watching kubeconfig for changes: %s", m.kubeconfig)
	return nil
}

// reloadAndNotify reloads the kubeconfig and notifies listeners.
// After a successful reload, it re-adds the file to the watcher to handle
// inode changes from atomic writes (old inode watch becomes stale).
func (m *MultiClusterClient) reloadAndNotify() {
	log.Printf("Kubeconfig changed, reloading...")
	if err := m.LoadConfig(); err != nil {
		log.Printf("Error reloading kubeconfig: %v", err)
		return
	}
	log.Printf("Kubeconfig reloaded successfully")

	// Re-add file watch — after atomic writes (rm+create or rename-over),
	// the old inode-level watch is dead. This re-establishes it on the new inode.
	if m.watcher != nil {
		_ = m.watcher.Remove(m.kubeconfig)
		if err := m.watcher.Add(m.kubeconfig); err != nil {
			log.Printf("Warning: could not re-watch kubeconfig file: %v", err)
		}
	}

	// Notify listeners
	m.mu.RLock()
	callback := m.onReload
	m.mu.RUnlock()
	if callback != nil {
		callback()
	}
}

func (m *MultiClusterClient) watchLoop() {
	// Debounce timer to avoid reloading multiple times for rapid changes
	var debounceTimer *time.Timer
	debounceDelay := clusterEventDebounce

	// Polling fallback: check file mtime every 5s to catch changes fsnotify misses.
	// macOS kqueue can silently lose watches after atomic file replacements.
	pollTicker := time.NewTicker(clusterEventPollInterval)
	defer pollTicker.Stop()
	var lastModTime time.Time
	if info, err := os.Stat(m.kubeconfig); err == nil {
		lastModTime = info.ModTime()
	}

	triggerReload := func() {
		if debounceTimer != nil {
			debounceTimer.Stop()
		}
		debounceTimer = time.AfterFunc(debounceDelay, m.reloadAndNotify)
	}

	for {
		select {
		case <-m.stopWatch:
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return
		case event, ok := <-m.watcher.Events:
			if !ok {
				return
			}
			// Check if this event is for our kubeconfig file
			if event.Name == m.kubeconfig || filepath.Base(event.Name) == filepath.Base(m.kubeconfig) {
				if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Rename) != 0 {
					// Update lastModTime so the poller doesn't double-trigger
					if info, err := os.Stat(m.kubeconfig); err == nil {
						lastModTime = info.ModTime()
					}
					triggerReload()
				}
			}
		case err, ok := <-m.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Kubeconfig watcher error: %v", err)
		case <-pollTicker.C:
			// Polling fallback: detect changes that fsnotify missed
			info, err := os.Stat(m.kubeconfig)
			if err != nil {
				continue
			}
			if info.ModTime() != lastModTime {
				lastModTime = info.ModTime()
				log.Printf("Kubeconfig change detected by poll (fsnotify missed)")
				triggerReload()
			}
		}
	}
}

// StopWatching stops watching the kubeconfig file
func (m *MultiClusterClient) StopWatching() {
	if m.stopWatch != nil {
		close(m.stopWatch)
	}
	if m.watcher != nil {
		m.watcher.Close()
	}
}

// SetOnReload sets a callback to be called when kubeconfig is reloaded
func (m *MultiClusterClient) SetOnReload(callback func()) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onReload = callback
}

// ListClusters returns all clusters from kubeconfig
func (m *MultiClusterClient) ListClusters(ctx context.Context) ([]ClusterInfo, error) {
	m.mu.RLock()
	rawConfig := m.rawConfig
	inClusterConfig := m.inClusterConfig
	m.mu.RUnlock()

	if rawConfig == nil && inClusterConfig == nil {
		if err := m.LoadConfig(); err != nil {
			return nil, err
		}
		m.mu.RLock()
		rawConfig = m.rawConfig
		inClusterConfig = m.inClusterConfig
		m.mu.RUnlock()
	}

	var clusters []ClusterInfo

	// If we have in-cluster config, add the local cluster
	if inClusterConfig != nil {
		clusters = append(clusters, ClusterInfo{
			Name:      "in-cluster",
			Context:   "in-cluster",
			Server:    inClusterConfig.Host,
			Source:    "in-cluster",
			IsCurrent: rawConfig == nil, // Current if no kubeconfig
		})
	}

	// Add clusters from kubeconfig if available
	if rawConfig != nil {
		currentContext := rawConfig.CurrentContext

		for contextName, contextInfo := range rawConfig.Contexts {
			clusterInfo, exists := rawConfig.Clusters[contextInfo.Cluster]
			server := ""
			if exists {
				server = clusterInfo.Server
			}

			// Get the user name from the AuthInfo reference
			user := contextInfo.AuthInfo

			clusters = append(clusters, ClusterInfo{
				Name:      contextName,
				Context:   contextName,
				Server:    server,
				User:      user,
				Source:    "kubeconfig",
				IsCurrent: contextName == currentContext,
			})
		}
	}

	// Sort by name
	sort.Slice(clusters, func(i, j int) bool {
		return clusters[i].Name < clusters[j].Name
	})

	return clusters, nil
}

// DeduplicatedClusters returns one cluster per unique server URL, preferring
// short/user-friendly context names over auto-generated OpenShift names.
// This prevents double-counting when the same physical cluster is reachable
// via multiple kubeconfig contexts (e.g. "vllm-d" and
// "default/api-fmaas-vllm-d-fmaas-res-ibm-com:6443/...").
func (m *MultiClusterClient) DeduplicatedClusters(ctx context.Context) ([]ClusterInfo, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	// Group by server URL
	type group struct {
		primary ClusterInfo
		others  []string
	}
	serverGroups := make(map[string]*group)
	var noServer []ClusterInfo

	for _, cl := range clusters {
		if cl.Server == "" {
			noServer = append(noServer, cl)
			continue
		}
		g, exists := serverGroups[cl.Server]
		if !exists {
			serverGroups[cl.Server] = &group{primary: cl}
			continue
		}
		// Pick the shorter/friendlier name as primary
		if isBetterClusterName(cl.Name, g.primary.Name) {
			g.others = append(g.others, g.primary.Name)
			g.primary = cl
		} else {
			g.others = append(g.others, cl.Name)
		}
	}

	result := make([]ClusterInfo, 0, len(serverGroups)+len(noServer))
	for _, g := range serverGroups {
		result = append(result, g.primary)
	}
	result = append(result, noServer...)

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result, nil
}

// WarmupHealthCache probes all clusters on startup to populate the health cache.
// Without this, HealthyClusters() treats unknown clusters as healthy, causing
// every SSE stream to hit all clusters (including offline ones) on first load.
// Uses a lightweight namespace list (Limit=1) with a 5s per-cluster timeout.
// Blocks for at most 8s total.
func (m *MultiClusterClient) WarmupHealthCache() {
	ctx, cancel := context.WithTimeout(context.Background(), clusterHealthCheckTimeout)
	defer cancel()

	clusters, err := m.DeduplicatedClusters(ctx)
	if err != nil {
		log.Printf("[Warmup] failed to list clusters: %v", err)
		return
	}

	log.Printf("[Warmup] probing %d clusters for reachability...", len(clusters))
	var wg sync.WaitGroup
	for _, cl := range clusters {
		wg.Add(1)
		go func(name, ctxName string) {
			defer wg.Done()
			probeCtx, probeCancel := context.WithTimeout(ctx, clusterProbeTimeout)
			defer probeCancel()

			client, clientErr := m.GetClient(ctxName)
			if clientErr != nil {
				m.mu.Lock()
				m.healthCache[ctxName] = &ClusterHealth{
					Cluster:      name,
					Reachable:    false,
					Healthy:      false,
					ErrorType:    classifyError(clientErr.Error()),
					ErrorMessage: clientErr.Error(),
					CheckedAt:    time.Now().Format(time.RFC3339),
				}
				m.cacheTime[ctxName] = time.Now()
				m.mu.Unlock()
				log.Printf("[Warmup] %s: unreachable (client error)", name)
				return
			}

			_, listErr := client.CoreV1().Namespaces().List(probeCtx, metav1.ListOptions{Limit: 1})
			if listErr != nil {
				m.mu.Lock()
				m.healthCache[ctxName] = &ClusterHealth{
					Cluster:      name,
					Reachable:    false,
					Healthy:      false,
					ErrorType:    classifyError(listErr.Error()),
					ErrorMessage: listErr.Error(),
					CheckedAt:    time.Now().Format(time.RFC3339),
				}
				m.cacheTime[ctxName] = time.Now()
				m.mu.Unlock()
				log.Printf("[Warmup] %s: unreachable (%v)", name, listErr)
			} else {
				m.mu.Lock()
				m.healthCache[ctxName] = &ClusterHealth{
					Cluster:   name,
					Reachable: true,
					Healthy:   true,
					CheckedAt: time.Now().Format(time.RFC3339),
				}
				m.cacheTime[ctxName] = time.Now()
				m.mu.Unlock()
				log.Printf("[Warmup] %s: reachable", name)
			}
		}(cl.Name, cl.Context)
	}

	wg.Wait()

	m.mu.RLock()
	reachable, unreachable := 0, 0
	for _, h := range m.healthCache {
		if h.Reachable {
			reachable++
		} else {
			unreachable++
		}
	}
	m.mu.RUnlock()
	log.Printf("[Warmup] done: %d reachable, %d unreachable", reachable, unreachable)
}

// HealthyClusters returns deduplicated clusters split into two lists:
// healthy/unknown clusters (safe to query) and offline clusters (skip to avoid
// blocking on timeouts). Clusters with no cached health data are treated as
// healthy (unknown = try them). This prevents spawning goroutines for clusters
// known to be unreachable, eliminating 15-30s timeout waste per offline cluster.
func (m *MultiClusterClient) HealthyClusters(ctx context.Context) (healthy []ClusterInfo, offline []ClusterInfo, err error) {
	all, err := m.DeduplicatedClusters(ctx)
	if err != nil {
		return nil, nil, err
	}

	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, cl := range all {
		if h, ok := m.healthCache[cl.Context]; ok && !h.Reachable {
			offline = append(offline, cl)
		} else {
			// Reachable or unknown (no cache entry) — try it
			healthy = append(healthy, cl)
		}
	}
	return healthy, offline, nil
}

// MarkSlow flags a cluster as slow (recently timed out or took >5s).
// Slow clusters receive a reduced timeout for slowClusterTTL.
func (m *MultiClusterClient) MarkSlow(clusterName string) {
	m.mu.Lock()
	m.slowClusters[clusterName] = time.Now()
	m.mu.Unlock()
	log.Printf("[Slow] cluster %s marked as slow (reduced timeout for %v)", clusterName, slowClusterTTL)
}

// IsSlow returns true if the cluster was recently marked as slow.
func (m *MultiClusterClient) IsSlow(clusterName string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if t, ok := m.slowClusters[clusterName]; ok {
		return time.Since(t) < slowClusterTTL
	}
	return false
}

// isBetterClusterName returns true if candidate is a better (more user-friendly)
// name than current. Prefers shorter names without slashes or port numbers.
func isBetterClusterName(candidate, current string) bool {
	candidateAuto := strings.Contains(candidate, "/") && strings.Contains(candidate, ":")
	currentAuto := strings.Contains(current, "/") && strings.Contains(current, ":")
	if !candidateAuto && currentAuto {
		return true
	}
	if candidateAuto && !currentAuto {
		return false
	}
	return len(candidate) < len(current)
}

// GetClient returns a kubernetes client for the specified context
func (m *MultiClusterClient) GetClient(contextName string) (kubernetes.Interface, error) {
	m.mu.RLock()
	if client, ok := m.clients[contextName]; ok {
		m.mu.RUnlock()
		return client, nil
	}
	inClusterConfig := m.inClusterConfig
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if client, ok := m.clients[contextName]; ok {
		return client, nil
	}

	var config *rest.Config
	var err error

	// Handle in-cluster context specially
	if contextName == "in-cluster" && inClusterConfig != nil {
		config = rest.CopyConfig(inClusterConfig)
	} else {
		config, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			&clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig},
			&clientcmd.ConfigOverrides{CurrentContext: contextName},
		).ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("failed to get config for context %s: %w", contextName, err)
		}
	}

	// Set reasonable timeouts — large OpenShift clusters (18+ nodes) can return
	// 800KB+ node payloads that take >10s over higher-latency links
	config.Timeout = k8sClientTimeout

	client, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create client for context %s: %w", contextName, err)
	}

	m.clients[contextName] = client
	m.configs[contextName] = config
	return client, nil
}

// GetRestConfig returns the REST config for the specified cluster context.
// Ensures the client (and config) is initialized first by calling GetClient.
func (m *MultiClusterClient) GetRestConfig(contextName string) (*rest.Config, error) {
	if _, err := m.GetClient(contextName); err != nil {
		return nil, err
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	config, ok := m.configs[contextName]
	if !ok {
		return nil, fmt.Errorf("no config for context %s", contextName)
	}
	return rest.CopyConfig(config), nil
}

// GetDynamicClient returns a dynamic kubernetes client for the specified context
func (m *MultiClusterClient) GetDynamicClient(contextName string) (dynamic.Interface, error) {
	m.mu.RLock()
	if client, ok := m.dynamicClients[contextName]; ok {
		m.mu.RUnlock()
		return client, nil
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if client, ok := m.dynamicClients[contextName]; ok {
		return client, nil
	}

	// Get or create config
	config, ok := m.configs[contextName]
	if !ok {
		var err error
		if contextName == "in-cluster" && m.inClusterConfig != nil {
			config = rest.CopyConfig(m.inClusterConfig)
		} else {
			config, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
				&clientcmd.ClientConfigLoadingRules{ExplicitPath: m.kubeconfig},
				&clientcmd.ConfigOverrides{CurrentContext: contextName},
			).ClientConfig()
			if err != nil {
				return nil, fmt.Errorf("failed to get config for context %s: %w", contextName, err)
			}
		}
		config.Timeout = k8sClientTimeout
		m.configs[contextName] = config
	}

	client, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client for context %s: %w", contextName, err)
	}

	m.dynamicClients[contextName] = client
	return client, nil
}

// classifyError determines the error type from an error message
func classifyError(errMsg string) string {
	lowerMsg := strings.ToLower(errMsg)

	// Timeout errors
	if strings.Contains(lowerMsg, "timeout") ||
		strings.Contains(lowerMsg, "deadline exceeded") ||
		strings.Contains(lowerMsg, "context deadline") ||
		strings.Contains(lowerMsg, "i/o timeout") {
		return "timeout"
	}

	// Auth errors
	if strings.Contains(lowerMsg, "401") ||
		strings.Contains(lowerMsg, "403") ||
		strings.Contains(lowerMsg, "unauthorized") ||
		strings.Contains(lowerMsg, "forbidden") ||
		strings.Contains(lowerMsg, "authentication") ||
		strings.Contains(lowerMsg, "invalid token") ||
		strings.Contains(lowerMsg, "token expired") {
		return "auth"
	}

	// Network errors
	if strings.Contains(lowerMsg, "connection refused") ||
		strings.Contains(lowerMsg, "no route to host") ||
		strings.Contains(lowerMsg, "network unreachable") ||
		strings.Contains(lowerMsg, "dial tcp") ||
		strings.Contains(lowerMsg, "no such host") ||
		strings.Contains(lowerMsg, "lookup") {
		return "network"
	}

	// Certificate errors
	if strings.Contains(lowerMsg, "x509") ||
		strings.Contains(lowerMsg, "tls") ||
		strings.Contains(lowerMsg, "certificate") ||
		strings.Contains(lowerMsg, "ssl") {
		return "certificate"
	}

	return "unknown"
}

// GetClusterHealth returns health status for a cluster
func (m *MultiClusterClient) GetClusterHealth(ctx context.Context, contextName string) (*ClusterHealth, error) {
	// Check cache — also save previous cached data for fallback on partial failures
	var prevCached *ClusterHealth
	m.mu.RLock()
	if health, ok := m.healthCache[contextName]; ok {
		if time.Since(m.cacheTime[contextName]) < m.cacheTTL {
			m.mu.RUnlock()
			return health, nil
		}
		prevCached = health
	}
	m.mu.RUnlock()

	now := time.Now().Format(time.RFC3339)

	client, err := m.GetClient(contextName)
	if err != nil {
		errMsg := err.Error()
		return &ClusterHealth{
			Cluster:      contextName,
			Healthy:      false,
			Reachable:    false,
			ErrorType:    classifyError(errMsg),
			ErrorMessage: errMsg,
			Issues:       []string{fmt.Sprintf("Failed to connect: %v", err)},
			CheckedAt:    now,
		}, nil
	}

	health := &ClusterHealth{
		Cluster:   contextName,
		Healthy:   true,
		Reachable: true,
		LastSeen:  now,
		CheckedAt: now,
	}

	// Fetch nodes, pods, and PVCs in parallel to avoid sequential timeout accumulation.
	// Large clusters (e.g. 18 nodes, 972 pods) can take 10-20s per call sequentially,
	// exceeding the context deadline. Parallel fetches reduce wall-clock time to max(individual).
	var (
		nodes    *corev1.NodeList
		pods     *corev1.PodList
		pvcs     *corev1.PersistentVolumeClaimList
		nodesErr error
		podsErr  error
		pvcsErr  error
		wg       sync.WaitGroup
	)

	wg.Add(3)
	go func() {
		defer wg.Done()
		nodes, nodesErr = client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		pods, podsErr = client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	}()
	go func() {
		defer wg.Done()
		pvcs, pvcsErr = client.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{})
	}()
	wg.Wait()

	// Process nodes - determines reachability
	if nodesErr != nil {
		errMsg := nodesErr.Error()
		health.Healthy = false
		health.Reachable = false
		health.ErrorType = classifyError(errMsg)
		health.ErrorMessage = errMsg
		health.Issues = append(health.Issues, fmt.Sprintf("Failed to list nodes: %v", nodesErr))
	} else if nodes != nil {
		health.NodeCount = len(nodes.Items)
		var totalCPU int64
		var totalMemory int64
		var totalStorage int64
		for _, node := range nodes.Items {
			// Count ready nodes
			for _, condition := range node.Status.Conditions {
				if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
					health.ReadyNodes++
					break
				}
			}
			if cpu := node.Status.Allocatable.Cpu(); cpu != nil {
				totalCPU += cpu.Value()
			}
			if mem := node.Status.Allocatable.Memory(); mem != nil {
				totalMemory += mem.Value()
			}
			if storage, ok := node.Status.Allocatable["ephemeral-storage"]; ok {
				totalStorage += storage.Value()
			}
		}
		health.CpuCores = int(totalCPU)
		health.MemoryBytes = totalMemory
		health.MemoryGB = float64(totalMemory) / (1024 * 1024 * 1024)
		health.StorageBytes = totalStorage
		health.StorageGB = float64(totalStorage) / (1024 * 1024 * 1024)
		if health.ReadyNodes < health.NodeCount {
			health.Issues = append(health.Issues, fmt.Sprintf("%d/%d nodes not ready", health.NodeCount-health.ReadyNodes, health.NodeCount))
		}
	}

	// Process pods - non-fatal, fall back to cached values on timeout
	if podsErr == nil && pods != nil {
		health.PodCount = len(pods.Items)
		var totalCPURequests int64
		var totalMemoryRequests int64
		for _, pod := range pods.Items {
			if pod.Status.Phase != corev1.PodRunning {
				continue
			}
			for _, container := range pod.Spec.Containers {
				if container.Resources.Requests != nil {
					if cpu := container.Resources.Requests.Cpu(); cpu != nil {
						totalCPURequests += cpu.MilliValue()
					}
					if mem := container.Resources.Requests.Memory(); mem != nil {
						totalMemoryRequests += mem.Value()
					}
				}
			}
		}
		health.CpuRequestsMillicores = totalCPURequests
		health.CpuRequestsCores = float64(totalCPURequests) / 1000.0
		health.MemoryRequestsBytes = totalMemoryRequests
		health.MemoryRequestsGB = float64(totalMemoryRequests) / (1024 * 1024 * 1024)
	} else if prevCached != nil {
		// Pod listing timed out — preserve previous cached pod data instead of showing 0
		health.PodCount = prevCached.PodCount
		health.CpuRequestsMillicores = prevCached.CpuRequestsMillicores
		health.CpuRequestsCores = prevCached.CpuRequestsCores
		health.MemoryRequestsBytes = prevCached.MemoryRequestsBytes
		health.MemoryRequestsGB = prevCached.MemoryRequestsGB
	}

	// Process PVCs - non-fatal, fall back to cached values on timeout
	if pvcsErr == nil && pvcs != nil {
		health.PVCCount = len(pvcs.Items)
		for _, pvc := range pvcs.Items {
			if pvc.Status.Phase == corev1.ClaimBound {
				health.PVCBoundCount++
			}
		}
	} else if prevCached != nil {
		health.PVCCount = prevCached.PVCCount
		health.PVCBoundCount = prevCached.PVCBoundCount
	}

	// Only cache successful results — don't cache failures (timeout, context canceled)
	// so the next request retries immediately instead of serving stale errors
	if health.Reachable {
		m.mu.Lock()
		m.healthCache[contextName] = health
		m.cacheTime[contextName] = time.Now()
		m.mu.Unlock()
	}

	return health, nil
}

// GetPods returns pods for a namespace/cluster
func (m *MultiClusterClient) GetPods(ctx context.Context, contextName, namespace string) ([]PodInfo, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PodInfo
	for _, pod := range pods.Items {
		ready := 0
		total := len(pod.Spec.Containers)
		restarts := 0

		// Build container status map
		statusMap := make(map[string]corev1.ContainerStatus)
		for _, cs := range pod.Status.ContainerStatuses {
			statusMap[cs.Name] = cs
			if cs.Ready {
				ready++
			}
			restarts += int(cs.RestartCount)
		}

		// Build container info
		var containers []ContainerInfo
		for _, c := range pod.Spec.Containers {
			ci := ContainerInfo{
				Name:  c.Name,
				Image: c.Image,
			}
			if cs, ok := statusMap[c.Name]; ok {
				ci.Ready = cs.Ready
				if cs.State.Running != nil {
					ci.State = "running"
				} else if cs.State.Waiting != nil {
					ci.State = "waiting"
					ci.Reason = cs.State.Waiting.Reason
					ci.Message = cs.State.Waiting.Message
				} else if cs.State.Terminated != nil {
					ci.State = "terminated"
					ci.Reason = cs.State.Terminated.Reason
					ci.Message = cs.State.Terminated.Message
				}
			}
			// Check for GPU resource requests (nvidia.com/gpu, amd.com/gpu)
			if c.Resources.Requests != nil {
				for resourceName, qty := range c.Resources.Requests {
					if resourceName == "nvidia.com/gpu" || resourceName == "amd.com/gpu" {
						ci.GPURequested = int(qty.Value())
					}
				}
			}
			if ci.GPURequested == 0 && c.Resources.Limits != nil {
				for resourceName, qty := range c.Resources.Limits {
					if resourceName == "nvidia.com/gpu" || resourceName == "amd.com/gpu" {
						ci.GPURequested = int(qty.Value())
					}
				}
			}
			containers = append(containers, ci)
		}

		result = append(result, PodInfo{
			Name:        pod.Name,
			Namespace:   pod.Namespace,
			Cluster:     contextName,
			Status:      string(pod.Status.Phase),
			Ready:       fmt.Sprintf("%d/%d", ready, total),
			Restarts:    restarts,
			Age:         formatDuration(time.Since(pod.CreationTimestamp.Time)),
			Node:        pod.Spec.NodeName,
			Labels:      pod.Labels,
			Annotations: pod.Annotations,
			Containers:  containers,
		})
	}

	return result, nil
}

// FindPodIssues returns pods with issues
func (m *MultiClusterClient) FindPodIssues(ctx context.Context, contextName, namespace string) ([]PodIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Waiting reasons that indicate a problem
	problemWaitingReasons := map[string]bool{
		"CrashLoopBackOff":           true,
		"ImagePullBackOff":           true,
		"ErrImagePull":               true,
		"CreateContainerConfigError": true,
		"InvalidImageName":           true,
		"CreateContainerError":       true,
		"RunContainerError":          true,
		"PostStartHookError":         true,
	}

	now := time.Now()

	var issues []PodIssue
	for _, pod := range pods.Items {
		// Skip completed/succeeded pods (e.g. finished Jobs)
		if pod.Status.Phase == corev1.PodSucceeded {
			continue
		}

		var podIssues []string
		restarts := 0

		// Determine effective status (mirrors kubectl logic)
		effectiveStatus := string(pod.Status.Phase)

		// Check init container statuses
		for i, cs := range pod.Status.InitContainerStatuses {
			restarts += int(cs.RestartCount)

			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				if problemWaitingReasons[cs.State.Waiting.Reason] {
					podIssues = append(podIssues, fmt.Sprintf("Init:%s", cs.State.Waiting.Reason))
					effectiveStatus = fmt.Sprintf("Init:%s", cs.State.Waiting.Reason)
				}
			}
			if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
				podIssues = append(podIssues, fmt.Sprintf("Init container %d failed (exit %d)", i, cs.State.Terminated.ExitCode))
			}
			if cs.LastTerminationState.Terminated != nil && cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
				podIssues = append(podIssues, "Init:OOMKilled")
			}
		}

		// Check container statuses
		for _, cs := range pod.Status.ContainerStatuses {
			restarts += int(cs.RestartCount)

			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				reason := cs.State.Waiting.Reason
				if problemWaitingReasons[reason] {
					podIssues = append(podIssues, reason)
					effectiveStatus = reason
				}
			}

			if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
				podIssues = append(podIssues, fmt.Sprintf("Exit code %d", cs.State.Terminated.ExitCode))
				if cs.State.Terminated.Reason != "" {
					effectiveStatus = cs.State.Terminated.Reason
				}
			}

			if cs.LastTerminationState.Terminated != nil {
				if cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
					podIssues = append(podIssues, "OOMKilled")
				}
			}

			// Container running but not ready for over 5 minutes
			if cs.State.Running != nil && !cs.Ready {
				age := now.Sub(cs.State.Running.StartedAt.Time)
				if age > podIssueAgeThreshold {
					podIssues = append(podIssues, "Not ready")
				}
			}

			if cs.RestartCount > 5 {
				podIssues = append(podIssues, fmt.Sprintf("High restarts (%d)", cs.RestartCount))
			}
		}

		// Check pod conditions for scheduling failures
		for _, cond := range pod.Status.Conditions {
			if cond.Type == corev1.PodScheduled && cond.Status == corev1.ConditionFalse {
				msg := cond.Reason
				if cond.Message != "" {
					msg = cond.Message
				}
				podIssues = append(podIssues, fmt.Sprintf("Unschedulable: %s", msg))
				effectiveStatus = "Unschedulable"
			}
		}

		// Check pod phase
		if pod.Status.Phase == corev1.PodPending {
			// Only add "Pending" if no more specific issue was found
			if len(podIssues) == 0 {
				// Pending for over 2 minutes is suspicious
				if pod.CreationTimestamp.Time.Before(now.Add(-podPendingAgeThreshold)) {
					podIssues = append(podIssues, "Pending")
				}
			}
		}
		if pod.Status.Phase == corev1.PodFailed {
			reason := "Failed"
			if pod.Status.Reason != "" {
				reason = pod.Status.Reason
			}
			podIssues = append(podIssues, reason)
			effectiveStatus = reason
		}

		// Stuck terminating (has deletion timestamp but still exists)
		if pod.DeletionTimestamp != nil {
			age := now.Sub(pod.DeletionTimestamp.Time)
			if age > podIssueAgeThreshold {
				podIssues = append(podIssues, fmt.Sprintf("Stuck terminating (%dm)", int(age.Minutes())))
				effectiveStatus = "Terminating"
			}
		}

		if len(podIssues) > 0 {
			issues = append(issues, PodIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Status:    effectiveStatus,
				Restarts:  restarts,
				Issues:    podIssues,
			})
		}
	}

	return issues, nil
}

// GetEvents returns events from a cluster
func (m *MultiClusterClient) GetEvents(ctx context.Context, contextName, namespace string, limit int) ([]Event, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	events, err := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		Limit: int64(limit),
	})
	if err != nil {
		return nil, err
	}

	// Sort by last timestamp descending
	sort.Slice(events.Items, func(i, j int) bool {
		return events.Items[i].LastTimestamp.After(events.Items[j].LastTimestamp.Time)
	})

	var result []Event
	for i, event := range events.Items {
		if limit > 0 && i >= limit {
			break
		}
		e := Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
			Age:       formatDuration(time.Since(event.LastTimestamp.Time)),
		}
		if !event.FirstTimestamp.IsZero() {
			e.FirstSeen = event.FirstTimestamp.Time.Format(time.RFC3339)
		}
		if !event.LastTimestamp.IsZero() {
			e.LastSeen = event.LastTimestamp.Time.Format(time.RFC3339)
		}
		result = append(result, e)
	}

	return result, nil
}

// GetWarningEvents returns warning events from a cluster
func (m *MultiClusterClient) GetWarningEvents(ctx context.Context, contextName, namespace string, limit int) ([]Event, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	events, err := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: "type=Warning",
	})
	if err != nil {
		return nil, err
	}

	// Sort by last timestamp descending
	sort.Slice(events.Items, func(i, j int) bool {
		return events.Items[i].LastTimestamp.After(events.Items[j].LastTimestamp.Time)
	})

	var result []Event
	for i, event := range events.Items {
		if limit > 0 && i >= limit {
			break
		}
		e := Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
			Age:       formatDuration(time.Since(event.LastTimestamp.Time)),
		}
		if !event.FirstTimestamp.IsZero() {
			e.FirstSeen = event.FirstTimestamp.Time.Format(time.RFC3339)
		}
		if !event.LastTimestamp.IsZero() {
			e.LastSeen = event.LastTimestamp.Time.Format(time.RFC3339)
		}
		result = append(result, e)
	}

	return result, nil
}

// GetGPUNodes returns nodes with GPU resources
func (m *MultiClusterClient) GetGPUNodes(ctx context.Context, contextName string) ([]GPUNode, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	// Fetch all pods once upfront to calculate accelerator allocations per node
	// This is much faster than querying pods per-node for large clusters
	allPods, _ := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	// Track allocations by node and accelerator type
	gpuAllocationByNode := make(map[string]int) // GPU allocations
	tpuAllocationByNode := make(map[string]int) // TPU allocations
	aiuAllocationByNode := make(map[string]int) // AIU (Gaudi) allocations
	xpuAllocationByNode := make(map[string]int) // XPU allocations
	if allPods != nil {
		for _, pod := range allPods.Items {
			nodeName := pod.Spec.NodeName
			if nodeName == "" {
				continue
			}
			for _, container := range pod.Spec.Containers {
				// Check GPU requests (NVIDIA, AMD, Intel)
				if gpuReq, ok := container.Resources.Requests["nvidia.com/gpu"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				if gpuReq, ok := container.Resources.Requests["amd.com/gpu"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				if gpuReq, ok := container.Resources.Requests["gpu.intel.com/i915"]; ok {
					gpuAllocationByNode[nodeName] += int(gpuReq.Value())
				}
				// Check TPU requests (Google Cloud)
				if tpuReq, ok := container.Resources.Requests["google.com/tpu"]; ok {
					tpuAllocationByNode[nodeName] += int(tpuReq.Value())
				}
				// Check AIU requests (Intel Gaudi / Habana)
				if aiuReq, ok := container.Resources.Requests["habana.ai/gaudi"]; ok {
					aiuAllocationByNode[nodeName] += int(aiuReq.Value())
				}
				if aiuReq, ok := container.Resources.Requests["habana.ai/gaudi2"]; ok {
					aiuAllocationByNode[nodeName] += int(aiuReq.Value())
				}
				if aiuReq, ok := container.Resources.Requests["intel.com/gaudi"]; ok {
					aiuAllocationByNode[nodeName] += int(aiuReq.Value())
				}
				// Check XPU requests (Intel)
				if xpuReq, ok := container.Resources.Requests["intel.com/xpu"]; ok {
					xpuAllocationByNode[nodeName] += int(xpuReq.Value())
				}
				// Check IBM AIU requests
				if aiuReq, ok := container.Resources.Requests["ibm.com/aiu"]; ok {
					aiuAllocationByNode[nodeName] += int(aiuReq.Value())
				}
			}
		}
	}

	var gpuNodes []GPUNode
	for _, node := range nodes.Items {
		// Check for various accelerator types in allocatable resources
		// GPUs
		nvidiaGPUQty, hasNvidiaGPU := node.Status.Allocatable["nvidia.com/gpu"]
		amdGPUQty, hasAMDGPU := node.Status.Allocatable["amd.com/gpu"]
		intelGPUQty, hasIntelGPU := node.Status.Allocatable["gpu.intel.com/i915"]
		// TPUs (Google Cloud)
		tpuQty, hasTPU := node.Status.Allocatable["google.com/tpu"]
		// AIUs (Intel Gaudi / Habana)
		gaudiQty, hasGaudi := node.Status.Allocatable["habana.ai/gaudi"]
		gaudi2Qty, hasGaudi2 := node.Status.Allocatable["habana.ai/gaudi2"]
		intelGaudiQty, hasIntelGaudi := node.Status.Allocatable["intel.com/gaudi"]
		// XPUs (Intel)
		xpuQty, hasXPU := node.Status.Allocatable["intel.com/xpu"]
		// AIUs (IBM)
		ibmAIUQty, hasIBMAIU := node.Status.Allocatable["ibm.com/aiu"]

		hasAnyAccelerator := hasNvidiaGPU || hasAMDGPU || hasIntelGPU || hasTPU || hasGaudi || hasGaudi2 || hasIntelGaudi || hasXPU || hasIBMAIU
		if !hasAnyAccelerator {
			continue
		}

		var deviceCount int
		var manufacturer string
		var deviceType string
		var accelType AcceleratorType

		// Check GPUs first
		if hasNvidiaGPU && nvidiaGPUQty.Value() > 0 {
			deviceCount = int(nvidiaGPUQty.Value())
			manufacturer = "NVIDIA"
			accelType = AcceleratorGPU
			// Get GPU type from NVIDIA GPU Feature Discovery labels
			if label, ok := node.Labels["nvidia.com/gpu.product"]; ok {
				deviceType = label
			} else if label, ok := node.Labels["accelerator"]; ok {
				deviceType = label
			} else {
				deviceType = "NVIDIA GPU"
			}
		} else if hasAMDGPU && amdGPUQty.Value() > 0 {
			deviceCount = int(amdGPUQty.Value())
			manufacturer = "AMD"
			accelType = AcceleratorGPU
			if label, ok := node.Labels["amd.com/gpu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "AMD GPU"
			}
		} else if hasIntelGPU && intelGPUQty.Value() > 0 {
			deviceCount = int(intelGPUQty.Value())
			manufacturer = "Intel"
			accelType = AcceleratorGPU
			deviceType = "Intel GPU"
		} else if hasTPU && tpuQty.Value() > 0 {
			// Google TPU
			deviceCount = int(tpuQty.Value())
			manufacturer = "Google"
			accelType = AcceleratorTPU
			// Get TPU type from labels if available
			if label, ok := node.Labels["cloud.google.com/gke-tpu-accelerator"]; ok {
				deviceType = label
			} else if label, ok := node.Labels["cloud.google.com/gke-tpu-topology"]; ok {
				deviceType = "TPU " + label
			} else {
				deviceType = "Google TPU"
			}
		} else if (hasGaudi && gaudiQty.Value() > 0) || (hasGaudi2 && gaudi2Qty.Value() > 0) || (hasIntelGaudi && intelGaudiQty.Value() > 0) {
			// Intel Gaudi accelerators (formerly Habana Labs) - these are GPUs
			manufacturer = "Intel"
			accelType = AcceleratorGPU // Gaudi is classified as GPU-class accelerator
			if hasGaudi2 && gaudi2Qty.Value() > 0 {
				deviceCount = int(gaudi2Qty.Value())
				deviceType = "Intel Gaudi2"
			} else if hasGaudi && gaudiQty.Value() > 0 {
				deviceCount = int(gaudiQty.Value())
				deviceType = "Intel Gaudi"
			} else if hasIntelGaudi && intelGaudiQty.Value() > 0 {
				deviceCount = int(intelGaudiQty.Value())
				// Check for Gaudi generation from labels
				if label, ok := node.Labels["intel.com/gaudi.product"]; ok {
					deviceType = label
				} else {
					deviceType = "Intel Gaudi"
				}
			}
		} else if hasXPU && xpuQty.Value() > 0 {
			// Intel XPU
			deviceCount = int(xpuQty.Value())
			manufacturer = "Intel"
			accelType = AcceleratorXPU
			if label, ok := node.Labels["intel.com/xpu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "Intel XPU"
			}
		} else if hasIBMAIU && ibmAIUQty.Value() > 0 {
			// IBM AIU (Artificial Intelligence Unit)
			deviceCount = int(ibmAIUQty.Value())
			manufacturer = "IBM"
			accelType = AcceleratorAIU
			if label, ok := node.Labels["ibm.com/aiu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "IBM AIU"
			}
		} else {
			continue
		}

		if deviceCount == 0 {
			continue
		}

		// Extract enhanced GPU info from NVIDIA GPU Feature Discovery (GFD) labels
		var gpuMemoryMB int
		var gpuFamily string
		var cudaDriverVersion string
		var cudaRuntimeVersion string
		var migCapable bool
		var migStrategy string

		// GPU memory (in MB)
		if memLabel, ok := node.Labels["nvidia.com/gpu.memory"]; ok {
			fmt.Sscanf(memLabel, "%d", &gpuMemoryMB)
		}

		// GPU architecture family
		if familyLabel, ok := node.Labels["nvidia.com/gpu.family"]; ok {
			gpuFamily = familyLabel
		}

		// CUDA driver version (major.minor.rev)
		driverMajor := node.Labels["nvidia.com/cuda.driver.major"]
		driverMinor := node.Labels["nvidia.com/cuda.driver.minor"]
		driverRev := node.Labels["nvidia.com/cuda.driver.rev"]
		if driverMajor != "" {
			cudaDriverVersion = driverMajor
			if driverMinor != "" {
				cudaDriverVersion += "." + driverMinor
			}
			if driverRev != "" {
				cudaDriverVersion += "." + driverRev
			}
		}

		// CUDA runtime version
		runtimeMajor := node.Labels["nvidia.com/cuda.runtime.major"]
		runtimeMinor := node.Labels["nvidia.com/cuda.runtime.minor"]
		if runtimeMajor != "" {
			cudaRuntimeVersion = runtimeMajor
			if runtimeMinor != "" {
				cudaRuntimeVersion += "." + runtimeMinor
			}
		}

		// MIG capability
		if migLabel, ok := node.Labels["nvidia.com/mig.capable"]; ok {
			migCapable = migLabel == "true"
		}

		// MIG strategy
		if strategyLabel, ok := node.Labels["nvidia.com/mig.strategy"]; ok {
			migStrategy = strategyLabel
		}

		// Get allocated accelerators from pre-computed map based on type
		var allocated int
		switch accelType {
		case AcceleratorGPU:
			allocated = gpuAllocationByNode[node.Name]
		case AcceleratorTPU:
			allocated = tpuAllocationByNode[node.Name]
		case AcceleratorAIU:
			allocated = aiuAllocationByNode[node.Name]
		case AcceleratorXPU:
			allocated = xpuAllocationByNode[node.Name]
		}

		gpuNodes = append(gpuNodes, GPUNode{
			Name:               node.Name,
			Cluster:            contextName,
			GPUType:            deviceType,
			GPUCount:           deviceCount,
			GPUAllocated:       allocated,
			AcceleratorType:    accelType,
			GPUMemoryMB:        gpuMemoryMB,
			GPUFamily:          gpuFamily,
			CUDADriverVersion:  cudaDriverVersion,
			CUDARuntimeVersion: cudaRuntimeVersion,
			MIGCapable:         migCapable,
			MIGStrategy:        migStrategy,
			Manufacturer:       manufacturer,
		})
	}

	return gpuNodes, nil
}

// GPU operator namespace names to search for operator pods
var gpuOperatorNamespaces = []string{
	"nvidia-gpu-operator",
	"gpu-operator",
	"nvidia-device-plugin",
	"kube-system",
}

// GetGPUNodeHealth returns proactive health status for all GPU nodes in a cluster.
// It checks node readiness, scheduling, GPU operator pod health, stuck pods, and GPU reset events.
func (m *MultiClusterClient) GetGPUNodeHealth(ctx context.Context, contextName string) ([]GPUNodeHealthStatus, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	// 1. Get GPU nodes using existing method
	gpuNodes, err := m.GetGPUNodes(ctx, contextName)
	if err != nil {
		return nil, fmt.Errorf("listing GPU nodes: %w", err)
	}
	if len(gpuNodes) == 0 {
		return nil, nil
	}

	// 2. Get node objects for condition checks
	nodeList, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing nodes: %w", err)
	}
	nodeMap := make(map[string]corev1.Node, len(nodeList.Items))
	for _, n := range nodeList.Items {
		nodeMap[n.Name] = n
	}

	// 3. Find GPU operator pods across known namespaces
	var operatorPods []corev1.Pod
	for _, ns := range gpuOperatorNamespaces {
		pods, listErr := client.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			continue // namespace may not exist
		}
		operatorPods = append(operatorPods, pods.Items...)
	}

	// 4. Find non-running pods for stuck pod detection (exclude Succeeded/Running)
	allPods, _ := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})

	// 5. Get warning events from the last hour for GPU reset detection
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	events, _ := client.CoreV1().Events("").List(ctx, metav1.ListOptions{
		FieldSelector: "type=Warning",
	})

	// 6. Build health status for each GPU node
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	var results []GPUNodeHealthStatus

	for _, gpuNode := range gpuNodes {
		nodeObj, exists := nodeMap[gpuNode.Name]
		if !exists {
			continue
		}

		checks := []GPUNodeHealthCheck{}
		issues := []string{}

		// Check 1: Node Ready
		nodeReady := false
		for _, cond := range nodeObj.Status.Conditions {
			if cond.Type == corev1.NodeReady {
				nodeReady = cond.Status == corev1.ConditionTrue
				if !nodeReady {
					msg := "Node is NotReady"
					if cond.Message != "" {
						msg = cond.Message
					}
					checks = append(checks, GPUNodeHealthCheck{Name: "node_ready", Passed: false, Message: msg})
					issues = append(issues, "Node is NotReady")
				} else {
					checks = append(checks, GPUNodeHealthCheck{Name: "node_ready", Passed: true})
				}
				break
			}
		}

		// Check 2: Scheduling enabled
		if nodeObj.Spec.Unschedulable {
			checks = append(checks, GPUNodeHealthCheck{Name: "scheduling", Passed: false, Message: "Node is cordoned (SchedulingDisabled)"})
			issues = append(issues, "Node is cordoned")
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "scheduling", Passed: true})
		}

		// Check 3: gpu-feature-discovery pod
		gfdCheck := checkOperatorPod(operatorPods, gpuNode.Name, "gpu-feature-discovery")
		checks = append(checks, gfdCheck)
		if !gfdCheck.Passed {
			issues = append(issues, "gpu-feature-discovery: "+gfdCheck.Message)
		}

		// Check 4: nvidia-device-plugin pod
		dpCheck := checkOperatorPod(operatorPods, gpuNode.Name, "nvidia-device-plugin")
		checks = append(checks, dpCheck)
		if !dpCheck.Passed {
			issues = append(issues, "nvidia-device-plugin: "+dpCheck.Message)
		}

		// Check 5: dcgm-exporter pod
		dcgmCheck := checkOperatorPod(operatorPods, gpuNode.Name, "dcgm-exporter")
		checks = append(checks, dcgmCheck)
		if !dcgmCheck.Passed {
			issues = append(issues, "dcgm-exporter: "+dcgmCheck.Message)
		}

		// Check 6: Stuck pods on this node
		stuckCount := 0
		if allPods != nil {
			for i := range allPods.Items {
				pod := &allPods.Items[i]
				if pod.Spec.NodeName != gpuNode.Name {
					continue
				}
				if isStuckPod(pod) {
					stuckCount++
				}
			}
		}
		if stuckCount > 0 {
			msg := fmt.Sprintf("%d pods stuck (ContainerStatusUnknown/Terminating)", stuckCount)
			checks = append(checks, GPUNodeHealthCheck{Name: "stuck_pods", Passed: false, Message: msg})
			issues = append(issues, msg)
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "stuck_pods", Passed: true})
		}

		// Check 7: GPU reset events
		gpuResetCount := 0
		if events != nil {
			for i := range events.Items {
				ev := &events.Items[i]
				if ev.LastTimestamp.Time.Before(oneHourAgo) && ev.EventTime.Time.Before(oneHourAgo) {
					continue
				}
				if ev.InvolvedObject.Name != gpuNode.Name {
					continue
				}
				msg := strings.ToLower(ev.Message)
				if strings.Contains(msg, "gpu") && (strings.Contains(msg, "reset") || strings.Contains(msg, "xid") || strings.Contains(msg, "nvlink") || strings.Contains(msg, "ecc")) {
					gpuResetCount++
				}
			}
		}
		if gpuResetCount > 0 {
			msg := fmt.Sprintf("%d GPU warning events in last hour", gpuResetCount)
			checks = append(checks, GPUNodeHealthCheck{Name: "gpu_events", Passed: false, Message: msg})
			issues = append(issues, msg)
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "gpu_events", Passed: true})
		}

		// Derive overall status
		status := deriveGPUNodeStatus(checks)

		results = append(results, GPUNodeHealthStatus{
			NodeName:  gpuNode.Name,
			Cluster:   contextName,
			Status:    status,
			GPUCount:  gpuNode.GPUCount,
			GPUType:   gpuNode.GPUType,
			Checks:    checks,
			Issues:    issues,
			StuckPods: stuckCount,
			CheckedAt: checkedAt,
		})
	}

	return results, nil
}

// checkOperatorPod checks if a specific GPU operator pod is running on a node.
// It searches by pod name prefix and node name match (for DaemonSet pods).
func checkOperatorPod(pods []corev1.Pod, nodeName, podPrefix string) GPUNodeHealthCheck {
	for i := range pods {
		pod := &pods[i]
		if !strings.Contains(pod.Name, podPrefix) {
			continue
		}
		// DaemonSet pods run on specific nodes
		if pod.Spec.NodeName != nodeName {
			continue
		}
		if pod.Status.Phase == corev1.PodRunning {
			// Check for CrashLoopBackOff in container statuses
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
					msg := fmt.Sprintf("CrashLoopBackOff (%d restarts)", cs.RestartCount)
					return GPUNodeHealthCheck{Name: podPrefix, Passed: false, Message: msg}
				}
			}
			return GPUNodeHealthCheck{Name: podPrefix, Passed: true}
		}
		// Not running
		reason := string(pod.Status.Phase)
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				reason = cs.State.Waiting.Reason
				if cs.RestartCount > 0 {
					reason = fmt.Sprintf("%s (%d restarts)", reason, cs.RestartCount)
				}
				break
			}
		}
		return GPUNodeHealthCheck{Name: podPrefix, Passed: false, Message: reason}
	}
	// Pod not found on this node — could be normal if operator not installed
	return GPUNodeHealthCheck{Name: podPrefix, Passed: true, Message: "not found (operator may not be installed)"}
}

// isStuckPod returns true if a pod appears stuck (ContainerStatusUnknown, long-Terminating, etc.)
func isStuckPod(pod *corev1.Pod) bool {
	// Check for ContainerStatusUnknown
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Terminated != nil && cs.State.Terminated.Reason == "ContainerStatusUnknown" {
			return true
		}
	}
	// Check for pods stuck in Terminating (deletion timestamp set but still exists) > 5 min
	if pod.DeletionTimestamp != nil {
		if time.Since(pod.DeletionTimestamp.Time) > 5*time.Minute {
			return true
		}
	}
	// Check for Pending pods stuck > 10 min
	if pod.Status.Phase == corev1.PodPending && pod.CreationTimestamp.Time.Before(time.Now().Add(-10*time.Minute)) {
		return true
	}
	return false
}

// deriveGPUNodeStatus determines overall health from individual checks.
// Critical checks (node_ready, stuck_pods) failing → unhealthy.
// 1-2 non-critical failures → degraded. All pass → healthy.
func deriveGPUNodeStatus(checks []GPUNodeHealthCheck) string {
	criticalFail := false
	failCount := 0
	for _, c := range checks {
		if c.Passed {
			continue
		}
		failCount++
		if c.Name == "node_ready" || c.Name == "stuck_pods" || c.Name == "gpu_events" {
			criticalFail = true
		}
	}
	if criticalFail || failCount >= 3 {
		return "unhealthy"
	}
	if failCount > 0 {
		return "degraded"
	}
	return "healthy"
}

// ============================================================================
// GPU Health CronJob Management
// ============================================================================

// GetGPUHealthCronJobStatus checks if the GPU health CronJob is installed and returns its status.
// It also reads structured results from the ConfigMap and auto-reconciles outdated script versions.
func (m *MultiClusterClient) GetGPUHealthCronJobStatus(ctx context.Context, contextName string) (*GPUHealthCronJobStatus, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	status := &GPUHealthCronJobStatus{
		Cluster: contextName,
	}

	// Check RBAC permissions first
	status.CanInstall = m.canManageCronJobs(ctx, client, gpuHealthDefaultNS)

	// Look for the CronJob in known namespaces
	for _, ns := range []string{gpuHealthDefaultNS, "gpu-operator", "kube-system"} {
		cj, getErr := client.BatchV1().CronJobs(ns).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
		if getErr != nil {
			continue // not found or namespace doesn't exist
		}

		// Found it
		status.Installed = true
		status.Namespace = ns
		status.Schedule = cj.Spec.Schedule
		status.ActiveJobs = len(cj.Status.Active)

		// Read version and tier from labels
		if v, ok := cj.Labels["kubestellar-console/script-version"]; ok {
			fmt.Sscanf(v, "%d", &status.Version)
		}
		if t, ok := cj.Labels["kubestellar-console/tier"]; ok {
			fmt.Sscanf(t, "%d", &status.Tier)
		}
		if status.Tier == 0 {
			status.Tier = 1 // legacy CronJobs without tier label
		}

		// Check if update is available
		status.UpdateAvailable = status.Version < gpuHealthScriptVersion

		// Auto-reconcile: update CronJob if version is outdated and user has permissions
		if status.UpdateAvailable && status.CanInstall {
			if reconcileErr := m.InstallGPUHealthCronJob(ctx, contextName, ns, cj.Spec.Schedule, status.Tier); reconcileErr != nil {
				log.Printf("[GPUHealthCronJob] Auto-reconcile failed for %s: %v", contextName, reconcileErr)
			} else {
				log.Printf("[GPUHealthCronJob] Auto-reconciled %s to script version %d", contextName, gpuHealthScriptVersion)
				status.Version = gpuHealthScriptVersion
				status.UpdateAvailable = false
			}
		}

		if cj.Status.LastScheduleTime != nil {
			status.LastRun = cj.Status.LastScheduleTime.UTC().Format(time.RFC3339)
		}
		if cj.Status.LastSuccessfulTime != nil {
			status.LastResult = "success"
			status.SuccessJobs = 1
		}

		// Count recent jobs
		jobs, jobErr := client.BatchV1().Jobs(ns).List(ctx, metav1.ListOptions{
			LabelSelector: "app=" + gpuHealthCronJobName,
		})
		if jobErr == nil {
			status.SuccessJobs = 0
			status.FailedJobs = 0
			for _, j := range jobs.Items {
				if j.Status.Succeeded > 0 {
					status.SuccessJobs++
				}
				if j.Status.Failed > 0 {
					status.FailedJobs++
				}
			}
			if status.FailedJobs > 0 && status.SuccessJobs == 0 {
				status.LastResult = "failed"
			} else if status.SuccessJobs > 0 {
				status.LastResult = "success"
			}
		}

		// Read structured results from ConfigMap
		status.LastResults = readGPUHealthResults(ctx, client, ns)

		return status, nil
	}

	// Not found
	return status, nil
}

// readGPUHealthResults reads the gpu-health-results ConfigMap and parses the JSON results.
func readGPUHealthResults(ctx context.Context, client kubernetes.Interface, namespace string) []GPUHealthCheckResult {
	cm, err := client.CoreV1().ConfigMaps(namespace).Get(ctx, gpuHealthConfigMapName, metav1.GetOptions{})
	if err != nil {
		return nil
	}

	resultsJSON, ok := cm.Data["results"]
	if !ok {
		return nil
	}

	var wrapper struct {
		Nodes []GPUHealthCheckResult `json:"nodes"`
	}
	if jsonErr := json.Unmarshal([]byte(resultsJSON), &wrapper); jsonErr != nil {
		log.Printf("[GPUHealthCronJob] Failed to parse ConfigMap results: %v", jsonErr)
		return nil
	}
	return wrapper.Nodes
}

// InstallGPUHealthCronJob installs the GPU health check CronJob on a cluster.
// It creates: Namespace (if needed), ServiceAccount, ClusterRole, ClusterRoleBinding, CronJob.
func (m *MultiClusterClient) InstallGPUHealthCronJob(ctx context.Context, contextName, namespace, schedule string, tier int) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	if namespace == "" {
		namespace = gpuHealthDefaultNS
	}
	if schedule == "" {
		schedule = gpuHealthDefaultSchedule
	}
	if tier < 1 || tier > 4 {
		tier = gpuHealthDefaultTier
	}

	// Ensure namespace exists
	_, nsErr := client.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if nsErr != nil {
		if errors.IsNotFound(nsErr) {
			_, createErr := client.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{
				ObjectMeta: metav1.ObjectMeta{
					Name:   namespace,
					Labels: map[string]string{"app.kubernetes.io/managed-by": "kubestellar-console"},
				},
			}, metav1.CreateOptions{})
			if createErr != nil && !errors.IsAlreadyExists(createErr) {
				return fmt.Errorf("creating namespace %s: %w", namespace, createErr)
			}
		}
	}

	// Create ServiceAccount
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      gpuHealthServiceAccount,
			Namespace: namespace,
			Labels:    map[string]string{"app": gpuHealthCronJobName, "app.kubernetes.io/managed-by": "kubestellar-console"},
		},
	}
	if _, saErr := client.CoreV1().ServiceAccounts(namespace).Create(ctx, sa, metav1.CreateOptions{}); saErr != nil && !errors.IsAlreadyExists(saErr) {
		return fmt.Errorf("creating ServiceAccount: %w", saErr)
	}

	// Build RBAC rules based on tier
	rules := []rbacv1.PolicyRule{
		// All tiers: nodes, pods, events, configmaps (for results)
		{APIGroups: []string{""}, Resources: []string{"nodes"}, Verbs: []string{"get", "list"}},
		{APIGroups: []string{""}, Resources: []string{"pods"}, Verbs: []string{"get", "list"}},
		{APIGroups: []string{""}, Resources: []string{"events"}, Verbs: []string{"get", "list", "create"}},
		{APIGroups: []string{""}, Resources: []string{"configmaps"}, Verbs: []string{"get", "create", "update"}},
	}
	if tier >= 2 {
		rules = append(rules,
			rbacv1.PolicyRule{APIGroups: []string{""}, Resources: []string{"resourcequotas"}, Verbs: []string{"get", "list"}},
		)
	}
	if tier >= 3 {
		rules = append(rules,
			rbacv1.PolicyRule{APIGroups: []string{"batch"}, Resources: []string{"jobs"}, Verbs: []string{"get", "list"}},
		)
	}
	if tier >= 4 {
		rules = append(rules,
			rbacv1.PolicyRule{APIGroups: []string{""}, Resources: []string{"pods/exec"}, Verbs: []string{"create"}},
		)
	}

	// Create/update ClusterRole
	cr := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{
			Name:   gpuHealthClusterRole,
			Labels: map[string]string{"app": gpuHealthCronJobName, "app.kubernetes.io/managed-by": "kubestellar-console"},
		},
		Rules: rules,
	}
	if _, crErr := client.RbacV1().ClusterRoles().Create(ctx, cr, metav1.CreateOptions{}); crErr != nil {
		if errors.IsAlreadyExists(crErr) {
			existing, getErr := client.RbacV1().ClusterRoles().Get(ctx, gpuHealthClusterRole, metav1.GetOptions{})
			if getErr == nil {
				existing.Rules = rules
				_, _ = client.RbacV1().ClusterRoles().Update(ctx, existing, metav1.UpdateOptions{})
			}
		} else {
			return fmt.Errorf("creating ClusterRole: %w", crErr)
		}
	}

	// Create ClusterRoleBinding
	crb := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{
			Name:   gpuHealthClusterRoleBinding,
			Labels: map[string]string{"app": gpuHealthCronJobName, "app.kubernetes.io/managed-by": "kubestellar-console"},
		},
		Subjects: []rbacv1.Subject{{
			Kind:      "ServiceAccount",
			Name:      gpuHealthServiceAccount,
			Namespace: namespace,
		}},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     gpuHealthClusterRole,
		},
	}
	if _, crbErr := client.RbacV1().ClusterRoleBindings().Create(ctx, crb, metav1.CreateOptions{}); crbErr != nil && !errors.IsAlreadyExists(crbErr) {
		return fmt.Errorf("creating ClusterRoleBinding: %w", crbErr)
	}

	// Build the tiered health check script
	healthCheckScript := buildGPUHealthCheckScript(namespace)

	backoffLimit := int32(1)
	ttlSeconds := int32(3600) // Clean up finished jobs after 1 hour
	cjLabels := map[string]string{
		"app":                                gpuHealthCronJobName,
		"app.kubernetes.io/managed-by":       "kubestellar-console",
		"app.kubernetes.io/component":        "gpu-health-monitoring",
		"kubestellar-console/script-version": fmt.Sprintf("%d", gpuHealthScriptVersion),
		"kubestellar-console/tier":           fmt.Sprintf("%d", tier),
	}
	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{
			Name:      gpuHealthCronJobName,
			Namespace: namespace,
			Labels:    cjLabels,
		},
		Spec: batchv1.CronJobSpec{
			Schedule:          schedule,
			ConcurrencyPolicy: batchv1.ForbidConcurrent,
			JobTemplate: batchv1.JobTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{"app": gpuHealthCronJobName},
				},
				Spec: batchv1.JobSpec{
					BackoffLimit:            &backoffLimit,
					TTLSecondsAfterFinished: &ttlSeconds,
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							ServiceAccountName: gpuHealthServiceAccount,
							RestartPolicy:      corev1.RestartPolicyNever,
							Containers: []corev1.Container{{
								Name:    "gpu-health-checker",
								Image:   gpuHealthCheckerImage,
								Command: []string{"/bin/sh", "-c", healthCheckScript},
								Env: []corev1.EnvVar{
									{Name: "CHECK_TIER", Value: fmt.Sprintf("%d", tier)},
									{Name: "RESULTS_NAMESPACE", Value: namespace},
								},
							}},
						},
					},
				},
			},
		},
	}

	if _, cjErr := client.BatchV1().CronJobs(namespace).Create(ctx, cj, metav1.CreateOptions{}); cjErr != nil {
		if errors.IsAlreadyExists(cjErr) {
			// Update existing CronJob
			existing, getErr := client.BatchV1().CronJobs(namespace).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
			if getErr != nil {
				return fmt.Errorf("getting existing CronJob: %w", getErr)
			}
			existing.Spec = cj.Spec
			existing.Labels = cjLabels
			if _, updateErr := client.BatchV1().CronJobs(namespace).Update(ctx, existing, metav1.UpdateOptions{}); updateErr != nil {
				return fmt.Errorf("updating CronJob: %w", updateErr)
			}
		} else {
			return fmt.Errorf("creating CronJob: %w", cjErr)
		}
	}

	log.Printf("[GPUHealthCronJob] Installed on cluster %s in namespace %s (schedule=%s, tier=%d, version=%d)", contextName, namespace, schedule, tier, gpuHealthScriptVersion)
	return nil
}

// buildGPUHealthCheckScript returns the tiered health check bash script.
// The CHECK_TIER env var controls which checks run. Results are written to a ConfigMap.
func buildGPUHealthCheckScript(namespace string) string {
	return `#!/bin/sh
set -e
TIER=${CHECK_TIER:-2}
NS=${RESULTS_NAMESPACE:-` + namespace + `}
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "GPU Health Check starting at $TIMESTAMP (Tier $TIER)"

# ---- Discover GPU nodes ----
GPU_NODES=$(kubectl get nodes -l nvidia.com/gpu.present=true -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || echo "")
if [ -z "$GPU_NODES" ]; then
  GPU_NODES=$(kubectl get nodes -o json | python3 -c "
import json,sys
data=json.load(sys.stdin)
for n in data.get('items',[]):
  alloc=n.get('status',{}).get('allocatable',{})
  if any(k for k in alloc if 'gpu' in k.lower() or 'gaudi' in k.lower()):
    print(n['metadata']['name'])
" 2>/dev/null || echo "")
fi

if [ -z "$GPU_NODES" ]; then
  echo '{"checkedAt":"'"$TIMESTAMP"'","tier":'"$TIER"',"nodes":[]}' > /tmp/results.json
  kubectl create configmap gpu-health-results --from-file=results=/tmp/results.json -n "$NS" --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || true
  echo "No GPU nodes found"
  exit 0
fi

TOTAL_ISSUES=0
RESULTS_JSON='{"checkedAt":"'"$TIMESTAMP"'","tier":'"$TIER"',"nodes":['
FIRST_NODE=true

for NODE in $GPU_NODES; do
  NODE_ISSUES=""
  NODE_CHECKS=""
  NODE_STATUS="healthy"
  FIRST_CHECK=true

  add_check() {
    local name="$1" passed="$2" msg="$3"
    if [ "$FIRST_CHECK" = "true" ]; then FIRST_CHECK=false; else NODE_CHECKS="$NODE_CHECKS,"; fi
    NODE_CHECKS="$NODE_CHECKS"'{"name":"'"$name"'","passed":'"$passed"',"message":"'"$msg"'"}'
    if [ "$passed" = "false" ]; then
      TOTAL_ISSUES=$((TOTAL_ISSUES+1))
      if [ -z "$NODE_ISSUES" ]; then NODE_ISSUES='"'"$msg"'"'; else NODE_ISSUES="$NODE_ISSUES,"'"'"$msg"'"'; fi
      NODE_STATUS="unhealthy"
    fi
  }

  # ---- TIER 1: Critical checks ----
  # Node Ready status
  READY=$(kubectl get node "$NODE" -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
  if [ "$READY" = "True" ]; then
    add_check "Node Ready" "true" "Node is Ready"
  else
    add_check "Node Ready" "false" "Node $NODE is NotReady"
  fi

  # Cordoned check
  UNSCHEDULABLE=$(kubectl get node "$NODE" -o jsonpath='{.spec.unschedulable}')
  if [ "$UNSCHEDULABLE" = "true" ]; then
    add_check "Cordoned" "false" "Node $NODE is cordoned (unschedulable)"
  else
    add_check "Cordoned" "true" "Node is schedulable"
  fi

  # Stuck pods
  STUCK=$(kubectl get pods --field-selector=spec.nodeName="$NODE" --all-namespaces --no-headers 2>/dev/null | grep -cE "Unknown|Terminating|ContainerStatusUnknown" || echo "0")
  if [ "$STUCK" -gt "0" ]; then
    add_check "Stuck Pods" "false" "$STUCK stuck pods on node $NODE"
  else
    add_check "Stuck Pods" "true" "No stuck pods"
  fi

  # NVIDIA operator pods (GFD, device-plugin, DCGM)
  for COMPONENT in gpu-feature-discovery nvidia-device-plugin dcgm-exporter; do
    POD_STATUS=$(kubectl get pods -A -l app="$COMPONENT" --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | head -1 | awk '{print $4}' || echo "")
    if [ -z "$POD_STATUS" ]; then
      POD_STATUS=$(kubectl get pods -A -l app.kubernetes.io/component="$COMPONENT" --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | head -1 | awk '{print $4}' || echo "")
    fi
    if [ -z "$POD_STATUS" ]; then
      add_check "$COMPONENT" "true" "$COMPONENT not deployed (optional)"
    elif [ "$POD_STATUS" = "Running" ]; then
      add_check "$COMPONENT" "true" "$COMPONENT is running"
    else
      add_check "$COMPONENT" "false" "$COMPONENT pod is $POD_STATUS on $NODE"
    fi
  done

  # GPU reset/XID events (last 1 hour)
  XID_EVENTS=$(kubectl get events -A --field-selector involvedObject.name="$NODE" --no-headers 2>/dev/null | grep -ciE "xid|gpu.?reset|ecc|fallen off the bus" || echo "0")
  if [ "$XID_EVENTS" -gt "0" ]; then
    add_check "GPU Events" "false" "$XID_EVENTS GPU error events on $NODE"
  else
    add_check "GPU Events" "true" "No GPU error events"
  fi

  # ---- TIER 2: Standard checks ----
  if [ "$TIER" -ge "2" ]; then
    # GPU capacity vs allocatable mismatch
    GPU_CAP=$(kubectl get node "$NODE" -o jsonpath='{.status.capacity.nvidia\.com/gpu}' 2>/dev/null || echo "0")
    GPU_ALLOC=$(kubectl get node "$NODE" -o jsonpath='{.status.allocatable.nvidia\.com/gpu}' 2>/dev/null || echo "0")
    if [ "$GPU_CAP" != "$GPU_ALLOC" ] && [ "$GPU_CAP" != "0" ]; then
      add_check "GPU Capacity" "false" "Capacity $GPU_CAP != allocatable $GPU_ALLOC on $NODE"
    else
      add_check "GPU Capacity" "true" "GPU capacity matches allocatable ($GPU_CAP)"
    fi

    # Pending GPU pods
    PENDING_GPU=$(kubectl get pods -A --field-selector=status.phase=Pending -o json 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
count=0
for p in data.get('items',[]):
  for c in p.get('spec',{}).get('containers',[]):
    res=c.get('resources',{}).get('limits',{})
    if any(k for k in res if 'gpu' in k.lower() or 'gaudi' in k.lower()):
      count+=1
      break
print(count)
" 2>/dev/null || echo "0")
    if [ "$PENDING_GPU" -gt "0" ]; then
      add_check "Pending GPU Pods" "false" "$PENDING_GPU pods pending GPU allocation"
    else
      add_check "Pending GPU Pods" "true" "No pending GPU pods"
    fi

    # NVIDIA driver pods
    DRIVER_STATUS=$(kubectl get pods -A -l app=nvidia-driver-daemonset --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | head -1 | awk '{print $4}' || echo "")
    if [ -z "$DRIVER_STATUS" ]; then
      add_check "NVIDIA Driver" "true" "NVIDIA driver daemonset not deployed (may use host driver)"
    elif [ "$DRIVER_STATUS" = "Running" ]; then
      add_check "NVIDIA Driver" "true" "NVIDIA driver pod is running"
    else
      add_check "NVIDIA Driver" "false" "NVIDIA driver pod is $DRIVER_STATUS on $NODE"
    fi

    # Node conditions: DiskPressure, MemoryPressure, PIDPressure
    for COND in DiskPressure MemoryPressure PIDPressure; do
      COND_STATUS=$(kubectl get node "$NODE" -o jsonpath='{.status.conditions[?(@.type=="'"$COND"'")].status}')
      if [ "$COND_STATUS" = "True" ]; then
        add_check "$COND" "false" "$COND detected on $NODE"
      else
        add_check "$COND" "true" "No $COND"
      fi
    done

    # Resource quota exhaustion (any namespace on this node)
    QUOTA_ISSUES=$(kubectl get resourcequotas -A -o json 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
issues=0
for q in data.get('items',[]):
  hard=q.get('status',{}).get('hard',{})
  used=q.get('status',{}).get('used',{})
  for k in hard:
    if 'gpu' in k.lower():
      try:
        h=int(hard[k]);u=int(used.get(k,'0'))
        if h>0 and u>=h: issues+=1
      except: pass
print(issues)
" 2>/dev/null || echo "0")
    if [ "$QUOTA_ISSUES" -gt "0" ]; then
      add_check "GPU Quota" "false" "$QUOTA_ISSUES GPU resource quotas exhausted"
    else
      add_check "GPU Quota" "true" "No GPU quota exhaustion"
    fi
  fi

  # ---- TIER 3: Full checks ----
  if [ "$TIER" -ge "3" ]; then
    # GPU utilization at zero (check via DCGM metrics if available)
    DCGM_POD=$(kubectl get pods -A -l app=dcgm-exporter --field-selector=spec.nodeName="$NODE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    DCGM_NS=$(kubectl get pods -A -l app=dcgm-exporter --field-selector=spec.nodeName="$NODE" -o jsonpath='{.items[0].metadata.namespace}' 2>/dev/null || echo "")
    if [ -n "$DCGM_POD" ] && [ -n "$DCGM_NS" ]; then
      ZERO_UTIL=$(kubectl exec -n "$DCGM_NS" "$DCGM_POD" -- curl -s localhost:9400/metrics 2>/dev/null | grep "DCGM_FI_DEV_GPU_UTIL" | grep -v "^#" | awk '{if($NF==0)count++}END{print count+0}' || echo "0")
      GPU_IN_USE=$(kubectl get pods --field-selector=spec.nodeName="$NODE" -A -o json 2>/dev/null | python3 -c "
import json,sys
data=json.load(sys.stdin)
count=0
for p in data.get('items',[]):
  if p.get('status',{}).get('phase')=='Running':
    for c in p.get('spec',{}).get('containers',[]):
      res=c.get('resources',{}).get('limits',{})
      if any(k for k in res if 'gpu' in k.lower()):
        count+=1; break
print(count)
" 2>/dev/null || echo "0")
      if [ "$ZERO_UTIL" -gt "0" ] && [ "$GPU_IN_USE" -gt "0" ]; then
        add_check "GPU Utilization" "false" "$ZERO_UTIL GPUs at 0% utilization with $GPU_IN_USE GPU pods running"
      else
        add_check "GPU Utilization" "true" "GPU utilization normal"
      fi
    else
      add_check "GPU Utilization" "true" "DCGM not available (skipped)"
    fi

    # MIG config drift
    MIG_STRATEGY=$(kubectl get node "$NODE" -o jsonpath='{.metadata.labels.nvidia\.com/mig\.strategy}' 2>/dev/null || echo "")
    if [ -n "$MIG_STRATEGY" ]; then
      MIG_CONFIG=$(kubectl get node "$NODE" -o jsonpath='{.metadata.labels.nvidia\.com/mig\.config\.state}' 2>/dev/null || echo "")
      if [ "$MIG_CONFIG" = "failed" ]; then
        add_check "MIG Config" "false" "MIG configuration in failed state on $NODE"
      else
        add_check "MIG Config" "true" "MIG config OK (strategy=$MIG_STRATEGY)"
      fi
    fi

    # InfiniBand/RDMA pods
    RDMA_PODS=$(kubectl get pods -A --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | grep -ciE "rdma|infiniband|mellanox|mofed" || echo "0")
    RDMA_ISSUES=$(kubectl get pods -A --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | grep -iE "rdma|infiniband|mellanox|mofed" | grep -cvE "Running|Completed" || echo "0")
    if [ "$RDMA_ISSUES" -gt "0" ]; then
      add_check "RDMA/IB" "false" "$RDMA_ISSUES RDMA/InfiniBand pods not running on $NODE"
    elif [ "$RDMA_PODS" -gt "0" ]; then
      add_check "RDMA/IB" "true" "$RDMA_PODS RDMA/IB pods healthy"
    fi

    # Failed Jobs on GPU nodes
    FAILED_JOBS=$(kubectl get jobs -A --no-headers 2>/dev/null | awk '$3=="0" && $4!="0"{print $2}' | head -5 | while read JOB; do
      kubectl get pods -A -l job-name="$JOB" --field-selector=spec.nodeName="$NODE" --no-headers 2>/dev/null | grep -c "" || true
    done | awk '{s+=$1}END{print s+0}')
    if [ "$FAILED_JOBS" -gt "0" ]; then
      add_check "Failed Jobs" "false" "$FAILED_JOBS failed jobs ran on GPU node $NODE"
    else
      add_check "Failed Jobs" "true" "No failed jobs on GPU node"
    fi

    # Evicted pods
    EVICTED=$(kubectl get pods --field-selector=spec.nodeName="$NODE" -A --no-headers 2>/dev/null | grep -c "Evicted" || echo "0")
    if [ "$EVICTED" -gt "0" ]; then
      add_check "Evicted Pods" "false" "$EVICTED evicted pods on $NODE"
    else
      add_check "Evicted Pods" "true" "No evicted pods"
    fi
  fi

  # ---- TIER 4: Deep checks (requires privileged access) ----
  if [ "$TIER" -ge "4" ]; then
    # nvidia-smi via debug pod
    SMI_OUTPUT=$(kubectl debug node/"$NODE" -it --image=nvidia/cuda:12.2.0-base-ubuntu22.04 -- nvidia-smi --query-gpu=ecc.errors.corrected.volatile.total,temperature.gpu,memory.used,memory.total --format=csv,noheader 2>/dev/null || echo "")
    if [ -n "$SMI_OUTPUT" ]; then
      ECC_ERRORS=$(echo "$SMI_OUTPUT" | awk -F',' '{s+=$1}END{print s+0}')
      MAX_TEMP=$(echo "$SMI_OUTPUT" | awk -F',' '{if($2+0>max)max=$2+0}END{print max+0}')
      if [ "$ECC_ERRORS" -gt "0" ]; then
        add_check "ECC Errors" "false" "$ECC_ERRORS ECC errors detected on $NODE"
      else
        add_check "ECC Errors" "true" "No ECC errors"
      fi
      if [ "$MAX_TEMP" -gt "85" ]; then
        add_check "GPU Temperature" "false" "GPU temperature ${MAX_TEMP}C exceeds 85C on $NODE"
      else
        add_check "GPU Temperature" "true" "GPU temperature normal (${MAX_TEMP}C)"
      fi
    else
      add_check "nvidia-smi" "true" "Could not run nvidia-smi (debug pod failed, skipped)"
    fi

    # dmesg GPU kernel errors (via debug pod)
    DMESG_ERRORS=$(kubectl debug node/"$NODE" -it --image=busybox -- dmesg 2>/dev/null | grep -ciE "nvrm|xid|gpu|fallen off the bus" || echo "0")
    if [ "$DMESG_ERRORS" -gt "0" ]; then
      add_check "Kernel GPU Errors" "false" "$DMESG_ERRORS GPU-related kernel errors on $NODE"
    else
      add_check "Kernel GPU Errors" "true" "No GPU kernel errors in dmesg"
    fi

    # NVLink status
    NVLINK_OUTPUT=$(kubectl debug node/"$NODE" -it --image=nvidia/cuda:12.2.0-base-ubuntu22.04 -- nvidia-smi nvlink -s 2>/dev/null || echo "")
    if echo "$NVLINK_OUTPUT" | grep -qi "inactive\|error"; then
      add_check "NVLink" "false" "NVLink issues detected on $NODE"
    elif [ -n "$NVLINK_OUTPUT" ]; then
      add_check "NVLink" "true" "NVLink status OK"
    fi
  fi

  # Get GPU count for this node
  GPU_COUNT=$(kubectl get node "$NODE" -o jsonpath='{.status.capacity.nvidia\.com/gpu}' 2>/dev/null || echo "0")

  # Determine final node status
  if echo "$NODE_CHECKS" | grep -q '"passed":false'; then
    if echo "$NODE_CHECKS" | grep -q '"name":"Node Ready","passed":false'; then
      NODE_STATUS="unhealthy"
    else
      NODE_STATUS="degraded"
    fi
  fi

  # Append node JSON
  if [ "$FIRST_NODE" = "true" ]; then FIRST_NODE=false; else RESULTS_JSON="$RESULTS_JSON,"; fi
  RESULTS_JSON="$RESULTS_JSON"'{"nodeName":"'"$NODE"'","status":"'"$NODE_STATUS"'","gpuCount":'"$GPU_COUNT"',"checks":['"$NODE_CHECKS"'],"issues":['"$NODE_ISSUES"']}'
done

RESULTS_JSON="$RESULTS_JSON]}"

# ---- Write results to ConfigMap ----
echo "$RESULTS_JSON" > /tmp/results.json
kubectl create configmap gpu-health-results --from-file=results=/tmp/results.json -n "$NS" --dry-run=client -o yaml | kubectl apply -f - 2>/dev/null || echo "WARNING: Could not write results ConfigMap"

NODE_COUNT=$(echo $GPU_NODES | wc -w | tr -d ' ')
echo "GPU Health Check complete: $TOTAL_ISSUES issues found across $NODE_COUNT nodes (Tier $TIER)"
if [ "$TOTAL_ISSUES" -gt "0" ]; then exit 1; fi
`
}

// UninstallGPUHealthCronJob removes the GPU health check CronJob and associated RBAC from a cluster.
func (m *MultiClusterClient) UninstallGPUHealthCronJob(ctx context.Context, contextName, namespace string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	if namespace == "" {
		namespace = gpuHealthDefaultNS
	}

	// Delete CronJob
	if delErr := client.BatchV1().CronJobs(namespace).Delete(ctx, gpuHealthCronJobName, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		return fmt.Errorf("deleting CronJob: %w", delErr)
	}

	// Delete results ConfigMap
	if delErr := client.CoreV1().ConfigMaps(namespace).Delete(ctx, gpuHealthConfigMapName, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		log.Printf("[GPUHealthCronJob] Warning: could not delete results ConfigMap: %v", delErr)
	}

	// Delete associated Jobs
	if delErr := client.BatchV1().Jobs(namespace).DeleteCollection(ctx, metav1.DeleteOptions{}, metav1.ListOptions{
		LabelSelector: "app=" + gpuHealthCronJobName,
	}); delErr != nil {
		log.Printf("[GPUHealthCronJob] Warning: could not clean up jobs: %v", delErr)
	}

	// Delete ClusterRoleBinding
	if delErr := client.RbacV1().ClusterRoleBindings().Delete(ctx, gpuHealthClusterRoleBinding, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		log.Printf("[GPUHealthCronJob] Warning: could not delete ClusterRoleBinding: %v", delErr)
	}

	// Delete ClusterRole
	if delErr := client.RbacV1().ClusterRoles().Delete(ctx, gpuHealthClusterRole, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		log.Printf("[GPUHealthCronJob] Warning: could not delete ClusterRole: %v", delErr)
	}

	// Delete ServiceAccount
	if delErr := client.CoreV1().ServiceAccounts(namespace).Delete(ctx, gpuHealthServiceAccount, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		log.Printf("[GPUHealthCronJob] Warning: could not delete ServiceAccount: %v", delErr)
	}

	log.Printf("[GPUHealthCronJob] Uninstalled from cluster %s namespace %s", contextName, namespace)
	return nil
}

// canManageCronJobs checks if the current user has permissions to create/delete CronJobs in the given namespace.
func (m *MultiClusterClient) canManageCronJobs(ctx context.Context, client kubernetes.Interface, namespace string) bool {
	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace: namespace,
				Verb:      "create",
				Group:     "batch",
				Resource:  "cronjobs",
			},
		},
	}
	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return false
	}
	return result.Status.Allowed
}

// GetNodes returns detailed information about all nodes in a cluster
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

		// Get capacity
		if cpu, ok := node.Status.Capacity["cpu"]; ok {
			info.CPUCapacity = cpu.String()
		}
		if mem, ok := node.Status.Capacity["memory"]; ok {
			info.MemoryCapacity = mem.String()
		}
		if storage, ok := node.Status.Capacity["ephemeral-storage"]; ok {
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

// FindDeploymentIssues returns deployments with issues
func (m *MultiClusterClient) FindDeploymentIssues(ctx context.Context, contextName, namespace string) ([]DeploymentIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var issues []DeploymentIssue
	for _, deploy := range deployments.Items {
		// Check for issues
		var reason, message string

		// Check if not all replicas are ready
		if deploy.Status.ReadyReplicas < *deploy.Spec.Replicas {
			// Check conditions for more details
			for _, condition := range deploy.Status.Conditions {
				if condition.Type == "Available" && condition.Status == "False" {
					reason = "Unavailable"
					message = condition.Message
					break
				}
				if condition.Type == "Progressing" && condition.Status == "False" {
					reason = "ProgressDeadlineExceeded"
					message = condition.Message
					break
				}
			}

			// If we found no condition, use generic
			if reason == "" {
				reason = "Unavailable"
				message = fmt.Sprintf("%d/%d replicas ready", deploy.Status.ReadyReplicas, *deploy.Spec.Replicas)
			}

			issues = append(issues, DeploymentIssue{
				Name:          deploy.Name,
				Namespace:     deploy.Namespace,
				Cluster:       contextName,
				Replicas:      *deploy.Spec.Replicas,
				ReadyReplicas: deploy.Status.ReadyReplicas,
				Reason:        reason,
				Message:       message,
			})
		}
	}

	return issues, nil
}

// GetDeployments returns all deployments with rollout status
func (m *MultiClusterClient) GetDeployments(ctx context.Context, contextName, namespace string) ([]Deployment, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Deployment
	for _, deploy := range deployments.Items {
		// Determine status
		status := "running"
		if deploy.Status.ReadyReplicas < *deploy.Spec.Replicas {
			status = "deploying"
			// Check if stuck/failed
			for _, condition := range deploy.Status.Conditions {
				if condition.Type == "Progressing" && condition.Status == "False" {
					status = "failed"
					break
				}
				if condition.Type == "Available" && condition.Status == "False" &&
					deploy.Status.ObservedGeneration >= deploy.Generation {
					status = "failed"
					break
				}
			}
		}

		// Calculate progress
		desired := *deploy.Spec.Replicas
		progress := 100
		if desired > 0 {
			progress = int((float64(deploy.Status.ReadyReplicas) / float64(desired)) * 100)
		}

		// Get primary container image
		image := ""
		if len(deploy.Spec.Template.Spec.Containers) > 0 {
			image = deploy.Spec.Template.Spec.Containers[0].Image
		}

		// Calculate age
		age := ""
		if !deploy.CreationTimestamp.IsZero() {
			duration := time.Since(deploy.CreationTimestamp.Time)
			if duration.Hours() > 24 {
				age = fmt.Sprintf("%dd", int(duration.Hours()/24))
			} else if duration.Hours() > 1 {
				age = fmt.Sprintf("%dh", int(duration.Hours()))
			} else {
				age = fmt.Sprintf("%dm", int(duration.Minutes()))
			}
		}

		result = append(result, Deployment{
			Name:              deploy.Name,
			Namespace:         deploy.Namespace,
			Cluster:           contextName,
			Status:            status,
			Replicas:          *deploy.Spec.Replicas,
			ReadyReplicas:     deploy.Status.ReadyReplicas,
			UpdatedReplicas:   deploy.Status.UpdatedReplicas,
			AvailableReplicas: deploy.Status.AvailableReplicas,
			Progress:          progress,
			Image:             image,
			Age:               age,
			Labels:            deploy.Labels,
			Annotations:       deploy.Annotations,
		})
	}

	return result, nil
}

// GetServices returns all services in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetServices(ctx context.Context, contextName, namespace string) ([]Service, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	services, err := client.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Service
	for _, svc := range services.Items {
		// Build ports list
		var ports []string
		for _, p := range svc.Spec.Ports {
			portStr := fmt.Sprintf("%d/%s", p.Port, p.Protocol)
			if p.NodePort != 0 {
				portStr = fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, p.Protocol)
			}
			ports = append(ports, portStr)
		}

		// Get external IP
		externalIP := ""
		if len(svc.Status.LoadBalancer.Ingress) > 0 {
			if svc.Status.LoadBalancer.Ingress[0].IP != "" {
				externalIP = svc.Status.LoadBalancer.Ingress[0].IP
			} else if svc.Status.LoadBalancer.Ingress[0].Hostname != "" {
				externalIP = svc.Status.LoadBalancer.Ingress[0].Hostname
			}
		}
		if len(svc.Spec.ExternalIPs) > 0 {
			externalIP = svc.Spec.ExternalIPs[0]
		}

		// Calculate age
		age := formatAge(svc.CreationTimestamp.Time)

		result = append(result, Service{
			Name:        svc.Name,
			Namespace:   svc.Namespace,
			Cluster:     contextName,
			Type:        string(svc.Spec.Type),
			ClusterIP:   svc.Spec.ClusterIP,
			ExternalIP:  externalIP,
			Ports:       ports,
			Age:         age,
			Labels:      svc.Labels,
			Annotations: svc.Annotations,
		})
	}

	return result, nil
}

// GetJobs returns all jobs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetJobs(ctx context.Context, contextName, namespace string) ([]Job, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	jobs, err := client.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Job
	for _, job := range jobs.Items {
		// Determine status
		status := "Running"
		if job.Status.Succeeded > 0 {
			status = "Complete"
		} else if job.Status.Failed > 0 {
			status = "Failed"
		}

		// Completions
		completions := "0/1"
		if job.Spec.Completions != nil {
			completions = fmt.Sprintf("%d/%d", job.Status.Succeeded, *job.Spec.Completions)
		}

		// Duration
		duration := ""
		if job.Status.StartTime != nil {
			endTime := time.Now()
			if job.Status.CompletionTime != nil {
				endTime = job.Status.CompletionTime.Time
			}
			dur := endTime.Sub(job.Status.StartTime.Time)
			if dur.Hours() > 1 {
				duration = fmt.Sprintf("%dh%dm", int(dur.Hours()), int(dur.Minutes())%60)
			} else if dur.Minutes() > 1 {
				duration = fmt.Sprintf("%dm%ds", int(dur.Minutes()), int(dur.Seconds())%60)
			} else {
				duration = fmt.Sprintf("%ds", int(dur.Seconds()))
			}
		}

		// Calculate age
		age := formatAge(job.CreationTimestamp.Time)

		result = append(result, Job{
			Name:        job.Name,
			Namespace:   job.Namespace,
			Cluster:     contextName,
			Status:      status,
			Completions: completions,
			Duration:    duration,
			Age:         age,
			Labels:      job.Labels,
			Annotations: job.Annotations,
		})
	}

	return result, nil
}

// GetHPAs returns all HPAs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetHPAs(ctx context.Context, contextName, namespace string) ([]HPA, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	hpas, err := client.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []HPA
	for _, hpa := range hpas.Items {
		// Get target reference
		reference := fmt.Sprintf("%s/%s", hpa.Spec.ScaleTargetRef.Kind, hpa.Spec.ScaleTargetRef.Name)

		// Get min/max replicas
		minReplicas := int32(1)
		if hpa.Spec.MinReplicas != nil {
			minReplicas = *hpa.Spec.MinReplicas
		}

		// Get target/current CPU
		targetCPU := ""
		currentCPU := ""
		for _, metric := range hpa.Spec.Metrics {
			if metric.Type == "Resource" && metric.Resource != nil && metric.Resource.Name == "cpu" {
				if metric.Resource.Target.AverageUtilization != nil {
					targetCPU = fmt.Sprintf("%d%%", *metric.Resource.Target.AverageUtilization)
				}
			}
		}
		for _, condition := range hpa.Status.CurrentMetrics {
			if condition.Type == "Resource" && condition.Resource != nil && condition.Resource.Name == "cpu" {
				if condition.Resource.Current.AverageUtilization != nil {
					currentCPU = fmt.Sprintf("%d%%", *condition.Resource.Current.AverageUtilization)
				}
			}
		}

		// Calculate age
		age := formatAge(hpa.CreationTimestamp.Time)

		result = append(result, HPA{
			Name:            hpa.Name,
			Namespace:       hpa.Namespace,
			Cluster:         contextName,
			Reference:       reference,
			MinReplicas:     minReplicas,
			MaxReplicas:     hpa.Spec.MaxReplicas,
			CurrentReplicas: hpa.Status.CurrentReplicas,
			TargetCPU:       targetCPU,
			CurrentCPU:      currentCPU,
			Age:             age,
			Labels:          hpa.Labels,
			Annotations:     hpa.Annotations,
		})
	}

	return result, nil
}

// GetConfigMaps returns all ConfigMaps in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetConfigMaps(ctx context.Context, contextName, namespace string) ([]ConfigMap, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	configmaps, err := client.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ConfigMap
	for _, cm := range configmaps.Items {
		// Calculate age
		age := formatAge(cm.CreationTimestamp.Time)

		result = append(result, ConfigMap{
			Name:        cm.Name,
			Namespace:   cm.Namespace,
			Cluster:     contextName,
			DataCount:   len(cm.Data) + len(cm.BinaryData),
			Age:         age,
			Labels:      cm.Labels,
			Annotations: cm.Annotations,
		})
	}

	return result, nil
}

// GetSecrets returns all Secrets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetSecrets(ctx context.Context, contextName, namespace string) ([]Secret, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	secrets, err := client.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Secret
	for _, secret := range secrets.Items {
		// Calculate age
		age := formatAge(secret.CreationTimestamp.Time)

		result = append(result, Secret{
			Name:        secret.Name,
			Namespace:   secret.Namespace,
			Cluster:     contextName,
			Type:        string(secret.Type),
			DataCount:   len(secret.Data),
			Age:         age,
			Labels:      secret.Labels,
			Annotations: secret.Annotations,
		})
	}

	return result, nil
}

// GetServiceAccounts returns ServiceAccounts from a cluster
func (m *MultiClusterClient) GetServiceAccounts(ctx context.Context, contextName, namespace string) ([]ServiceAccount, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	serviceAccounts, err := client.CoreV1().ServiceAccounts(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ServiceAccount
	for _, sa := range serviceAccounts.Items {
		// Calculate age
		age := formatAge(sa.CreationTimestamp.Time)

		// Get secret names
		var secrets []string
		for _, s := range sa.Secrets {
			secrets = append(secrets, s.Name)
		}

		// Get image pull secret names
		var imagePullSecrets []string
		for _, s := range sa.ImagePullSecrets {
			imagePullSecrets = append(imagePullSecrets, s.Name)
		}

		result = append(result, ServiceAccount{
			Name:             sa.Name,
			Namespace:        sa.Namespace,
			Cluster:          contextName,
			Secrets:          secrets,
			ImagePullSecrets: imagePullSecrets,
			Age:              age,
			Labels:           sa.Labels,
			Annotations:      sa.Annotations,
		})
	}

	return result, nil
}

// GetPVCs returns all PersistentVolumeClaims in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetPVCs(ctx context.Context, contextName, namespace string) ([]PVC, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pvcs, err := client.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PVC
	for _, pvc := range pvcs.Items {
		age := formatAge(pvc.CreationTimestamp.Time)

		// Get capacity
		var capacity string
		if pvc.Status.Capacity != nil {
			if storage, ok := pvc.Status.Capacity[corev1.ResourceStorage]; ok {
				capacity = storage.String()
			}
		}

		// Get access modes
		var accessModes []string
		for _, mode := range pvc.Spec.AccessModes {
			accessModes = append(accessModes, string(mode))
		}

		// Get storage class
		storageClass := ""
		if pvc.Spec.StorageClassName != nil {
			storageClass = *pvc.Spec.StorageClassName
		}

		result = append(result, PVC{
			Name:         pvc.Name,
			Namespace:    pvc.Namespace,
			Cluster:      contextName,
			Status:       string(pvc.Status.Phase),
			Capacity:     capacity,
			StorageClass: storageClass,
			VolumeName:   pvc.Spec.VolumeName,
			AccessModes:  accessModes,
			Age:          age,
			Labels:       pvc.Labels,
		})
	}

	return result, nil
}

// GetPVs returns all PersistentVolumes
func (m *MultiClusterClient) GetPVs(ctx context.Context, contextName string) ([]PV, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pvs, err := client.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []PV
	for _, pv := range pvs.Items {
		age := formatAge(pv.CreationTimestamp.Time)

		// Get capacity
		var capacity string
		if pv.Spec.Capacity != nil {
			if storage, ok := pv.Spec.Capacity[corev1.ResourceStorage]; ok {
				capacity = storage.String()
			}
		}

		// Get access modes
		var accessModes []string
		for _, mode := range pv.Spec.AccessModes {
			accessModes = append(accessModes, string(mode))
		}

		// Get claim reference
		claimRef := ""
		if pv.Spec.ClaimRef != nil {
			claimRef = pv.Spec.ClaimRef.Namespace + "/" + pv.Spec.ClaimRef.Name
		}

		// Get volume mode
		volumeMode := ""
		if pv.Spec.VolumeMode != nil {
			volumeMode = string(*pv.Spec.VolumeMode)
		}

		result = append(result, PV{
			Name:          pv.Name,
			Cluster:       contextName,
			Status:        string(pv.Status.Phase),
			Capacity:      capacity,
			StorageClass:  pv.Spec.StorageClassName,
			ReclaimPolicy: string(pv.Spec.PersistentVolumeReclaimPolicy),
			AccessModes:   accessModes,
			ClaimRef:      claimRef,
			VolumeMode:    volumeMode,
			Age:           age,
			Labels:        pv.Labels,
		})
	}

	return result, nil
}

// GetReplicaSets returns all ReplicaSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetReplicaSets(ctx context.Context, contextName, namespace string) ([]ReplicaSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	rsList, err := client.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ReplicaSet
	for _, rs := range rsList.Items {
		replicas := int32(0)
		if rs.Spec.Replicas != nil {
			replicas = *rs.Spec.Replicas
		}
		ownerName, ownerKind := "", ""
		if len(rs.OwnerReferences) > 0 {
			ownerName = rs.OwnerReferences[0].Name
			ownerKind = rs.OwnerReferences[0].Kind
		}
		result = append(result, ReplicaSet{
			Name:          rs.Name,
			Namespace:     rs.Namespace,
			Cluster:       contextName,
			Replicas:      replicas,
			ReadyReplicas: rs.Status.ReadyReplicas,
			OwnerName:     ownerName,
			OwnerKind:     ownerKind,
			Age:           formatAge(rs.CreationTimestamp.Time),
			Labels:        rs.Labels,
		})
	}

	return result, nil
}

// GetStatefulSets returns all StatefulSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetStatefulSets(ctx context.Context, contextName, namespace string) ([]StatefulSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	ssList, err := client.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []StatefulSet
	for _, ss := range ssList.Items {
		replicas := int32(0)
		if ss.Spec.Replicas != nil {
			replicas = *ss.Spec.Replicas
		}
		status := "running"
		if ss.Status.ReadyReplicas < replicas {
			status = "deploying"
		}
		if replicas > 0 && ss.Status.ReadyReplicas == 0 {
			status = "failed"
		}
		image := ""
		if len(ss.Spec.Template.Spec.Containers) > 0 {
			image = ss.Spec.Template.Spec.Containers[0].Image
		}
		result = append(result, StatefulSet{
			Name:          ss.Name,
			Namespace:     ss.Namespace,
			Cluster:       contextName,
			Replicas:      replicas,
			ReadyReplicas: ss.Status.ReadyReplicas,
			Status:        status,
			Image:         image,
			Age:           formatAge(ss.CreationTimestamp.Time),
			Labels:        ss.Labels,
		})
	}

	return result, nil
}

// GetDaemonSets returns all DaemonSets in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetDaemonSets(ctx context.Context, contextName, namespace string) ([]DaemonSet, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	dsList, err := client.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []DaemonSet
	for _, ds := range dsList.Items {
		status := "running"
		if ds.Status.NumberReady < ds.Status.DesiredNumberScheduled {
			status = "degraded"
		}
		if ds.Status.DesiredNumberScheduled > 0 && ds.Status.NumberReady == 0 {
			status = "failed"
		}
		result = append(result, DaemonSet{
			Name:             ds.Name,
			Namespace:        ds.Namespace,
			Cluster:          contextName,
			DesiredScheduled: ds.Status.DesiredNumberScheduled,
			CurrentScheduled: ds.Status.CurrentNumberScheduled,
			Ready:            ds.Status.NumberReady,
			Status:           status,
			Age:              formatAge(ds.CreationTimestamp.Time),
			Labels:           ds.Labels,
		})
	}

	return result, nil
}

// GetCronJobs returns all CronJobs in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetCronJobs(ctx context.Context, contextName, namespace string) ([]CronJob, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	cronList, err := client.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []CronJob
	for _, cj := range cronList.Items {
		lastSchedule := ""
		if cj.Status.LastScheduleTime != nil {
			lastSchedule = formatAge(cj.Status.LastScheduleTime.Time) + " ago"
		}
		suspend := false
		if cj.Spec.Suspend != nil {
			suspend = *cj.Spec.Suspend
		}
		result = append(result, CronJob{
			Name:         cj.Name,
			Namespace:    cj.Namespace,
			Cluster:      contextName,
			Schedule:     cj.Spec.Schedule,
			Suspend:      suspend,
			Active:       len(cj.Status.Active),
			LastSchedule: lastSchedule,
			Age:          formatAge(cj.CreationTimestamp.Time),
			Labels:       cj.Labels,
		})
	}

	return result, nil
}

// GetIngresses returns all Ingresses in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetIngresses(ctx context.Context, contextName, namespace string) ([]Ingress, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	ingList, err := client.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []Ingress
	for _, ing := range ingList.Items {
		var hosts []string
		for _, rule := range ing.Spec.Rules {
			if rule.Host != "" {
				hosts = append(hosts, rule.Host)
			}
		}
		var address string
		if len(ing.Status.LoadBalancer.Ingress) > 0 {
			lb := ing.Status.LoadBalancer.Ingress[0]
			if lb.Hostname != "" {
				address = lb.Hostname
			} else if lb.IP != "" {
				address = lb.IP
			}
		}
		ingressClass := ""
		if ing.Spec.IngressClassName != nil {
			ingressClass = *ing.Spec.IngressClassName
		}
		result = append(result, Ingress{
			Name:      ing.Name,
			Namespace: ing.Namespace,
			Cluster:   contextName,
			Class:     ingressClass,
			Hosts:     hosts,
			Address:   address,
			Age:       formatAge(ing.CreationTimestamp.Time),
			Labels:    ing.Labels,
		})
	}

	return result, nil
}

// GetNetworkPolicies returns all NetworkPolicies in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetNetworkPolicies(ctx context.Context, contextName, namespace string) ([]NetworkPolicy, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	npList, err := client.NetworkingV1().NetworkPolicies(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []NetworkPolicy
	for _, np := range npList.Items {
		var policyTypes []string
		for _, pt := range np.Spec.PolicyTypes {
			policyTypes = append(policyTypes, string(pt))
		}
		podSelector := ""
		if len(np.Spec.PodSelector.MatchLabels) > 0 {
			var parts []string
			for k, v := range np.Spec.PodSelector.MatchLabels {
				parts = append(parts, k+"="+v)
			}
			podSelector = strings.Join(parts, ",")
		} else {
			podSelector = "(all pods)"
		}
		result = append(result, NetworkPolicy{
			Name:        np.Name,
			Namespace:   np.Namespace,
			Cluster:     contextName,
			PolicyTypes: policyTypes,
			PodSelector: podSelector,
			Age:         formatAge(np.CreationTimestamp.Time),
			Labels:      np.Labels,
		})
	}

	return result, nil
}

// GetResourceQuotas returns all ResourceQuotas in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetResourceQuotas(ctx context.Context, contextName, namespace string) ([]ResourceQuota, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	quotas, err := client.CoreV1().ResourceQuotas(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ResourceQuota
	for _, quota := range quotas.Items {
		age := formatAge(quota.CreationTimestamp.Time)

		// Convert resource quantities to strings
		hard := make(map[string]string)
		for name, quantity := range quota.Status.Hard {
			hard[string(name)] = quantity.String()
		}

		used := make(map[string]string)
		for name, quantity := range quota.Status.Used {
			used[string(name)] = quantity.String()
		}

		result = append(result, ResourceQuota{
			Name:        quota.Name,
			Namespace:   quota.Namespace,
			Cluster:     contextName,
			Hard:        hard,
			Used:        used,
			Age:         age,
			Labels:      quota.Labels,
			Annotations: quota.Annotations,
		})
	}

	return result, nil
}

// GetLimitRanges returns all LimitRanges in a namespace or all namespaces if namespace is empty
func (m *MultiClusterClient) GetLimitRanges(ctx context.Context, contextName, namespace string) ([]LimitRange, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	limitRanges, err := client.CoreV1().LimitRanges(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []LimitRange
	for _, lr := range limitRanges.Items {
		age := formatAge(lr.CreationTimestamp.Time)

		var limits []LimitRangeItem
		for _, limit := range lr.Spec.Limits {
			item := LimitRangeItem{
				Type: string(limit.Type),
			}

			// Convert Default
			if limit.Default != nil {
				item.Default = make(map[string]string)
				for name, quantity := range limit.Default {
					item.Default[string(name)] = quantity.String()
				}
			}

			// Convert DefaultRequest
			if limit.DefaultRequest != nil {
				item.DefaultRequest = make(map[string]string)
				for name, quantity := range limit.DefaultRequest {
					item.DefaultRequest[string(name)] = quantity.String()
				}
			}

			// Convert Max
			if limit.Max != nil {
				item.Max = make(map[string]string)
				for name, quantity := range limit.Max {
					item.Max[string(name)] = quantity.String()
				}
			}

			// Convert Min
			if limit.Min != nil {
				item.Min = make(map[string]string)
				for name, quantity := range limit.Min {
					item.Min[string(name)] = quantity.String()
				}
			}

			limits = append(limits, item)
		}

		result = append(result, LimitRange{
			Name:      lr.Name,
			Namespace: lr.Namespace,
			Cluster:   contextName,
			Limits:    limits,
			Age:       age,
			Labels:    lr.Labels,
		})
	}

	return result, nil
}

// ResourceQuotaSpec represents the desired spec for creating/updating a ResourceQuota
type ResourceQuotaSpec struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	Hard        map[string]string `json:"hard"` // Resource limits to set
	Labels      map[string]string `json:"labels,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"` // Reservation metadata
}

// CreateOrUpdateResourceQuota creates or updates a ResourceQuota in a namespace
func (m *MultiClusterClient) CreateOrUpdateResourceQuota(ctx context.Context, contextName string, spec ResourceQuotaSpec) (*ResourceQuota, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	// Convert string values to resource quantities
	hard := make(corev1.ResourceList)
	for name, value := range spec.Hard {
		quantity, err := resource.ParseQuantity(value)
		if err != nil {
			return nil, fmt.Errorf("invalid quantity for %s: %v", name, err)
		}
		hard[corev1.ResourceName(name)] = quantity
	}

	// Build the ResourceQuota object
	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:        spec.Name,
			Namespace:   spec.Namespace,
			Labels:      spec.Labels,
			Annotations: spec.Annotations,
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard: hard,
		},
	}

	// Try to get existing quota first
	existing, err := client.CoreV1().ResourceQuotas(spec.Namespace).Get(ctx, spec.Name, metav1.GetOptions{})
	if err == nil {
		// Update existing quota
		existing.Spec.Hard = hard
		if spec.Labels != nil {
			existing.Labels = spec.Labels
		}
		if spec.Annotations != nil {
			if existing.Annotations == nil {
				existing.Annotations = make(map[string]string)
			}
			for k, v := range spec.Annotations {
				existing.Annotations[k] = v
			}
		}
		updated, err := client.CoreV1().ResourceQuotas(spec.Namespace).Update(ctx, existing, metav1.UpdateOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to update ResourceQuota: %v", err)
		}

		// Convert to our response type
		resultHard := make(map[string]string)
		for name, quantity := range updated.Status.Hard {
			resultHard[string(name)] = quantity.String()
		}
		used := make(map[string]string)
		for name, quantity := range updated.Status.Used {
			used[string(name)] = quantity.String()
		}

		return &ResourceQuota{
			Name:        updated.Name,
			Namespace:   updated.Namespace,
			Cluster:     contextName,
			Hard:        resultHard,
			Used:        used,
			Age:         formatAge(updated.CreationTimestamp.Time),
			Labels:      updated.Labels,
			Annotations: updated.Annotations,
		}, nil
	}

	// Create new quota
	created, err := client.CoreV1().ResourceQuotas(spec.Namespace).Create(ctx, quota, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create ResourceQuota: %v", err)
	}

	// Convert to our response type
	resultHard := make(map[string]string)
	for name, quantity := range created.Spec.Hard {
		resultHard[string(name)] = quantity.String()
	}

	return &ResourceQuota{
		Name:        created.Name,
		Namespace:   created.Namespace,
		Cluster:     contextName,
		Hard:        resultHard,
		Used:        make(map[string]string), // New quota has no usage yet
		Age:         formatAge(created.CreationTimestamp.Time),
		Labels:      created.Labels,
		Annotations: created.Annotations,
	}, nil
}

// DeleteResourceQuota deletes a ResourceQuota from a namespace
func (m *MultiClusterClient) DeleteResourceQuota(ctx context.Context, contextName, namespace, name string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	err = client.CoreV1().ResourceQuotas(namespace).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete ResourceQuota: %v", err)
	}

	return nil
}

// GetPodLogs returns logs from a pod
func (m *MultiClusterClient) GetPodLogs(ctx context.Context, contextName, namespace, podName, container string, tailLines int64) (string, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return "", err
	}

	opts := &corev1.PodLogOptions{}
	if tailLines > 0 {
		opts.TailLines = &tailLines
	}
	if container != "" {
		opts.Container = container
	}

	req := client.CoreV1().Pods(namespace).GetLogs(podName, opts)
	logs, err := req.DoRaw(ctx)
	if err != nil {
		return "", err
	}

	return string(logs), nil
}

// formatAge formats a time.Time as a human-readable age string
func formatAge(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	duration := time.Since(t)
	if duration.Hours() > 24 {
		return fmt.Sprintf("%dd", int(duration.Hours()/24))
	} else if duration.Hours() > 1 {
		return fmt.Sprintf("%dh", int(duration.Hours()))
	} else {
		return fmt.Sprintf("%dm", int(duration.Minutes()))
	}
}

// GetCachedHealth returns all cached cluster health data without making any
// network calls. Returns a map of context-name → *ClusterHealth. Entries that
// have never been checked are simply absent from the map.
func (m *MultiClusterClient) GetCachedHealth() map[string]*ClusterHealth {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string]*ClusterHealth, len(m.healthCache))
	for k, v := range m.healthCache {
		result[k] = v
	}
	return result
}

// GetAllClusterHealth returns health status for all clusters
func (m *MultiClusterClient) GetAllClusterHealth(ctx context.Context) ([]ClusterHealth, error) {
	clusters, err := m.ListClusters(ctx)
	if err != nil {
		return nil, err
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]ClusterHealth, 0, len(clusters))

	for _, cluster := range clusters {
		wg.Add(1)
		go func(c ClusterInfo) {
			defer wg.Done()
			health, _ := m.GetClusterHealth(ctx, c.Name)
			if health != nil {
				mu.Lock()
				results = append(results, *health)
				mu.Unlock()
			}
		}(cluster)
	}

	wg.Wait()
	return results, nil
}

// CheckSecurityIssues finds pods with security misconfigurations
func (m *MultiClusterClient) CheckSecurityIssues(ctx context.Context, contextName, namespace string) ([]SecurityIssue, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	pods, err := client.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var issues []SecurityIssue
	for _, pod := range pods.Items {
		for _, container := range pod.Spec.Containers {
			sc := container.SecurityContext
			podSC := pod.Spec.SecurityContext

			// Check for privileged containers
			if sc != nil && sc.Privileged != nil && *sc.Privileged {
				issues = append(issues, SecurityIssue{
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Cluster:   contextName,
					Issue:     "Privileged container",
					Severity:  "high",
					Details:   fmt.Sprintf("Container '%s' running in privileged mode", container.Name),
				})
			}

			// Check for running as root
			runAsRoot := false
			if sc != nil && sc.RunAsUser != nil && *sc.RunAsUser == 0 {
				runAsRoot = true
			} else if sc == nil && podSC != nil && podSC.RunAsUser != nil && *podSC.RunAsUser == 0 {
				runAsRoot = true
			}
			if runAsRoot {
				issues = append(issues, SecurityIssue{
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Cluster:   contextName,
					Issue:     "Running as root",
					Severity:  "high",
					Details:   fmt.Sprintf("Container '%s' running as root user (UID 0)", container.Name),
				})
			}

			// Check for missing security context
			if sc == nil && podSC == nil {
				issues = append(issues, SecurityIssue{
					Name:      pod.Name,
					Namespace: pod.Namespace,
					Cluster:   contextName,
					Issue:     "Missing security context",
					Severity:  "low",
					Details:   fmt.Sprintf("Container '%s' has no security context defined", container.Name),
				})
			}
		}

		// Check for host network
		if pod.Spec.HostNetwork {
			issues = append(issues, SecurityIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Issue:     "Host network enabled",
				Severity:  "medium",
				Details:   "Pod using host network namespace",
			})
		}

		// Check for host PID
		if pod.Spec.HostPID {
			issues = append(issues, SecurityIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Issue:     "Host PID enabled",
				Severity:  "medium",
				Details:   "Pod sharing host PID namespace",
			})
		}
	}

	return issues, nil
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// NVIDIAOperatorStatus represents the status of NVIDIA GPU and Network operators
type NVIDIAOperatorStatus struct {
	Cluster         string               `json:"cluster"`
	GPUOperator     *GPUOperatorInfo     `json:"gpuOperator,omitempty"`
	NetworkOperator *NetworkOperatorInfo `json:"networkOperator,omitempty"`
}

// GPUOperatorInfo represents NVIDIA GPU Operator ClusterPolicy status
type GPUOperatorInfo struct {
	Installed     bool                `json:"installed"`
	Version       string              `json:"version,omitempty"`
	State         string              `json:"state,omitempty"` // ready, notReady, disabled
	Ready         bool                `json:"ready"`
	Components    []OperatorComponent `json:"components,omitempty"`
	DriverVersion string              `json:"driverVersion,omitempty"`
	CUDAVersion   string              `json:"cudaVersion,omitempty"`
	Namespace     string              `json:"namespace,omitempty"`
}

// NetworkOperatorInfo represents NVIDIA Network Operator NicClusterPolicy status
type NetworkOperatorInfo struct {
	Installed  bool                `json:"installed"`
	Version    string              `json:"version,omitempty"`
	State      string              `json:"state,omitempty"` // ready, notReady, disabled
	Ready      bool                `json:"ready"`
	Components []OperatorComponent `json:"components,omitempty"`
	Namespace  string              `json:"namespace,omitempty"`
}

// OperatorComponent represents a component of the NVIDIA operators
type OperatorComponent struct {
	Name   string `json:"name"`
	Status string `json:"status"` // ready, pending, error, disabled
	Reason string `json:"reason,omitempty"`
}

// GetNVIDIAOperatorStatus fetches the status of NVIDIA GPU and Network operators
func (m *MultiClusterClient) GetNVIDIAOperatorStatus(ctx context.Context, contextName string) (*NVIDIAOperatorStatus, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	status := &NVIDIAOperatorStatus{
		Cluster: contextName,
	}

	// GPU Operator ClusterPolicy GVR
	clusterPolicyGVR := schema.GroupVersionResource{
		Group:    "nvidia.com",
		Version:  "v1",
		Resource: "clusterpolicies",
	}

	// Try to get ClusterPolicy (GPU Operator)
	clusterPolicies, err := dynamicClient.Resource(clusterPolicyGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(clusterPolicies.Items) > 0 {
		cp := clusterPolicies.Items[0]
		gpuInfo := &GPUOperatorInfo{
			Installed: true,
		}

		// Get metadata
		if labels := cp.GetLabels(); labels != nil {
			if version, ok := labels["app.kubernetes.io/version"]; ok {
				gpuInfo.Version = version
			}
		}
		gpuInfo.Namespace = cp.GetNamespace()
		if gpuInfo.Namespace == "" {
			gpuInfo.Namespace = "gpu-operator"
		}

		// Get status
		if statusObj, found, _ := unstructuredNestedMap(cp.Object, "status"); found {
			if state, ok := statusObj["state"].(string); ok {
				gpuInfo.State = state
				gpuInfo.Ready = strings.EqualFold(state, "ready")
			}
		}

		// Get driver version from spec
		if spec, found, _ := unstructuredNestedMap(cp.Object, "spec"); found {
			if driver, found, _ := unstructuredNestedMap(spec, "driver"); found {
				if version, ok := driver["version"].(string); ok {
					gpuInfo.DriverVersion = version
				}
			}
			if toolkit, found, _ := unstructuredNestedMap(spec, "toolkit"); found {
				if version, ok := toolkit["version"].(string); ok {
					// CUDA version often embedded in toolkit version
					gpuInfo.CUDAVersion = version
				}
			}
		}

		// Get component states from status.conditions
		if conditions, found, _ := unstructuredNestedSlice(cp.Object, "status", "conditions"); found {
			for _, cond := range conditions {
				if condMap, ok := cond.(map[string]interface{}); ok {
					component := OperatorComponent{}
					if t, ok := condMap["type"].(string); ok {
						component.Name = t
					}
					if status, ok := condMap["status"].(string); ok {
						if strings.EqualFold(status, "True") {
							component.Status = "ready"
						} else {
							component.Status = "pending"
						}
					}
					if reason, ok := condMap["reason"].(string); ok {
						component.Reason = reason
					}
					if component.Name != "" {
						gpuInfo.Components = append(gpuInfo.Components, component)
					}
				}
			}
		}

		status.GPUOperator = gpuInfo
	}

	// Network Operator NicClusterPolicy GVR
	nicClusterPolicyGVR := schema.GroupVersionResource{
		Group:    "mellanox.com",
		Version:  "v1alpha1",
		Resource: "nicclusterpolicies",
	}

	// Try to get NicClusterPolicy (Network Operator)
	nicPolicies, err := dynamicClient.Resource(nicClusterPolicyGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(nicPolicies.Items) > 0 {
		ncp := nicPolicies.Items[0]
		netInfo := &NetworkOperatorInfo{
			Installed: true,
		}

		// Get metadata
		if labels := ncp.GetLabels(); labels != nil {
			if version, ok := labels["app.kubernetes.io/version"]; ok {
				netInfo.Version = version
			}
		}
		netInfo.Namespace = ncp.GetNamespace()
		if netInfo.Namespace == "" {
			netInfo.Namespace = "nvidia-network-operator"
		}

		// Get status
		if statusObj, found, _ := unstructuredNestedMap(ncp.Object, "status"); found {
			if state, ok := statusObj["state"].(string); ok {
				netInfo.State = state
				netInfo.Ready = strings.EqualFold(state, "ready")
			}
		}

		// Get component states
		if conditions, found, _ := unstructuredNestedSlice(ncp.Object, "status", "conditions"); found {
			for _, cond := range conditions {
				if condMap, ok := cond.(map[string]interface{}); ok {
					component := OperatorComponent{}
					if t, ok := condMap["type"].(string); ok {
						component.Name = t
					}
					if status, ok := condMap["status"].(string); ok {
						if strings.EqualFold(status, "True") {
							component.Status = "ready"
						} else {
							component.Status = "pending"
						}
					}
					if reason, ok := condMap["reason"].(string); ok {
						component.Reason = reason
					}
					if component.Name != "" {
						netInfo.Components = append(netInfo.Components, component)
					}
				}
			}
		}

		status.NetworkOperator = netInfo
	}

	return status, nil
}

// Helper function to get nested map from unstructured object
func unstructuredNestedMap(obj map[string]interface{}, fields ...string) (map[string]interface{}, bool, error) {
	var val interface{} = obj
	for _, field := range fields {
		if m, ok := val.(map[string]interface{}); ok {
			var found bool
			val, found = m[field]
			if !found {
				return nil, false, nil
			}
		} else {
			return nil, false, nil
		}
	}
	if result, ok := val.(map[string]interface{}); ok {
		return result, true, nil
	}
	return nil, false, nil
}

// Helper function to get nested slice from unstructured object
func unstructuredNestedSlice(obj map[string]interface{}, fields ...string) ([]interface{}, bool, error) {
	var val interface{} = obj
	for _, field := range fields {
		if m, ok := val.(map[string]interface{}); ok {
			var found bool
			val, found = m[field]
			if !found {
				return nil, false, nil
			}
		} else {
			return nil, false, nil
		}
	}
	if result, ok := val.([]interface{}); ok {
		return result, true, nil
	}
	return nil, false, nil
}
