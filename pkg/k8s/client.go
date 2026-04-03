package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
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
	authFailureCacheTTL       = 10 * time.Minute // longer TTL for auth errors to avoid exec-plugin spam (#3158)
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
	inClusterName   string               // Detected friendly name for in-cluster (e.g. "fmaas-vllm-d")
	slowClusters    map[string]time.Time // clusters that recently timed out (reduced timeout)
}

// IsInCluster returns true if the server is running inside a Kubernetes cluster
// (i.e., has a valid in-cluster ServiceAccount config).
func (m *MultiClusterClient) IsInCluster() bool {
	return m.inClusterConfig != nil
}

// SetDynamicClient injects a dynamic client for a cluster (for testing)
func (m *MultiClusterClient) SetDynamicClient(cluster string, client dynamic.Interface) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.dynamicClients == nil {
		m.dynamicClients = make(map[string]dynamic.Interface)
	}
	m.dynamicClients[cluster] = client
}

// SetClient injects a typed client for a cluster (for testing)
func (m *MultiClusterClient) SetClient(cluster string, client kubernetes.Interface) {
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.clients == nil {
		m.clients = make(map[string]kubernetes.Interface)
	}
	m.clients[cluster] = client
}

// SetRawConfig sets the raw kubeconfig (for testing)
func (m *MultiClusterClient) SetRawConfig(config *api.Config) {
	if m == nil {
		return
	}
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
	if m == nil {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.clients == nil {
		m.clients = make(map[string]kubernetes.Interface)
	}
	m.clients[contextName] = client
}

// InjectDynamicClient injects a dynamic client for a cluster (for testing)
func (m *MultiClusterClient) InjectDynamicClient(contextName string, client dynamic.Interface) {
	if m == nil {
		return
	}
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
	Name           string `json:"name"`
	Context        string `json:"context"`
	Server         string `json:"server,omitempty"`
	User           string `json:"user,omitempty"`
	Namespace      string `json:"namespace,omitempty"`
	AuthMethod     string `json:"authMethod,omitempty"` // exec, token, certificate, auth-provider, unknown
	Healthy        bool   `json:"healthy"`
	HealthUnknown  bool   `json:"healthUnknown,omitempty"`  // true if no health data collected yet (initializing)
	NeverConnected bool   `json:"neverConnected,omitempty"` // true if cluster failed every health probe since startup
	Source         string `json:"source,omitempty"`
	NodeCount      int    `json:"nodeCount,omitempty"`
	PodCount       int    `json:"podCount,omitempty"`
	IsCurrent      bool   `json:"isCurrent,omitempty"`
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
	// External reachability — TCP probe to the API server URL from this host (#4202)
	ExternallyReachable *bool `json:"externallyReachable,omitempty"`
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

// FlatcarNodeInfo represents a Kubernetes node running Flatcar Container Linux.
// Only nodes whose OSImage contains "flatcar" (case-insensitive) are returned.
type FlatcarNodeInfo struct {
	NodeName      string `json:"nodeName"`
	Cluster       string `json:"cluster"`
	OSImage       string `json:"osImage"`
	KernelVersion string `json:"kernelVersion"`
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
			slog.Info("Using in-cluster config (no kubeconfig file found)")
			client.inClusterConfig = inClusterConfig
			client.inClusterName = detectInClusterName(inClusterConfig)
			slog.Info(fmt.Sprintf("Detected in-cluster name: %s", client.inClusterName))
		}
	}

	return client, nil
}

// detectInClusterName tries to determine a friendly name for the local cluster.
// Priority: CLUSTER_NAME env var > OpenShift Infrastructure resource > "in-cluster".
func detectInClusterName(cfg *rest.Config) string {
	// 1. Explicit env var (set via Helm --set clusterName=vllm-d)
	if name := os.Getenv("CLUSTER_NAME"); name != "" {
		return name
	}

	// 2. OpenShift Infrastructure/cluster resource
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	dynClient, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return "in-cluster"
	}

	infraGVR := schema.GroupVersionResource{
		Group:    "config.openshift.io",
		Version:  "v1",
		Resource: "infrastructures",
	}
	infra, err := dynClient.Resource(infraGVR).Get(ctx, "cluster", metav1.GetOptions{})
	if err == nil {
		if status, ok := infra.Object["status"].(map[string]interface{}); ok {
			if apiURL, ok := status["apiServerURL"].(string); ok && apiURL != "" {
				if name := clusterNameFromAPIURL(apiURL); name != "" {
					return name
				}
			}
		}
	}

	return "in-cluster"
}

// clusterNameFromAPIURL extracts a friendly cluster name from an API server URL.
// e.g. "https://api.fmaas-vllm-d.fmaas.res.ibm.com:6443" → "fmaas-vllm-d"
func clusterNameFromAPIURL(apiURL string) string {
	// Remove scheme
	host := apiURL
	if idx := strings.Index(host, "://"); idx >= 0 {
		host = host[idx+3:]
	}
	// Remove port
	if idx := strings.Index(host, ":"); idx >= 0 {
		host = host[:idx]
	}
	// Strip "api." prefix (OpenShift convention)
	host = strings.TrimPrefix(host, "api.")
	// Take the first domain segment as the cluster name
	if idx := strings.Index(host, "."); idx > 0 {
		return host[:idx]
	}
	return host
}

// LoadConfig loads the kubeconfig
func (m *MultiClusterClient) LoadConfig() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// If we have in-cluster config and no kubeconfig file, use that
	if m.inClusterConfig != nil {
		if _, err := os.Stat(m.kubeconfig); os.IsNotExist(err) {
			slog.Info("No kubeconfig file, using in-cluster config only")
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
		slog.Warn(fmt.Sprintf("Warning: could not watch kubeconfig directory: %v", err))
	}

	go m.watchLoop()
	slog.Info(fmt.Sprintf("Watching kubeconfig for changes: %s", m.kubeconfig))
	return nil
}

// reloadAndNotify reloads the kubeconfig and notifies listeners.
// After a successful reload, it re-adds the file to the watcher to handle
// inode changes from atomic writes (old inode watch becomes stale).
func (m *MultiClusterClient) reloadAndNotify() {
	slog.Info("Kubeconfig changed, reloading...")
	if err := m.LoadConfig(); err != nil {
		slog.Info(fmt.Sprintf("Error reloading kubeconfig: %v", err))
		return
	}
	slog.Info("Kubeconfig reloaded successfully")

	// Re-add file watch — after atomic writes (rm+create or rename-over),
	// the old inode-level watch is dead. This re-establishes it on the new inode.
	if m.watcher != nil {
		_ = m.watcher.Remove(m.kubeconfig)
		if err := m.watcher.Add(m.kubeconfig); err != nil {
			slog.Warn(fmt.Sprintf("Warning: could not re-watch kubeconfig file: %v", err))
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
			slog.Error(fmt.Sprintf("Kubeconfig watcher error: %v", err))
		case <-pollTicker.C:
			// Polling fallback: detect changes that fsnotify missed
			info, err := os.Stat(m.kubeconfig)
			if err != nil {
				continue
			}
			if info.ModTime() != lastModTime {
				lastModTime = info.ModTime()
				slog.Info("Kubeconfig change detected by poll (fsnotify missed)")
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

	// If we have in-cluster config, add the local cluster with detected name
	if inClusterConfig != nil {
		name := m.inClusterName
		if name == "" {
			name = "in-cluster"
		}
		clusters = append(clusters, ClusterInfo{
			Name:      name,
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

			// Detect auth method from kubeconfig AuthInfo
			authMethod := "unknown"
			if ai, ok := rawConfig.AuthInfos[contextInfo.AuthInfo]; ok && ai != nil {
				switch {
				case ai.Exec != nil:
					authMethod = "exec"
				case ai.Token != "" || ai.TokenFile != "":
					authMethod = "token"
				case len(ai.ClientCertificateData) > 0 || ai.ClientCertificate != "":
					authMethod = "certificate"
				case ai.AuthProvider != nil:
					authMethod = "auth-provider"
				}
			}

			clusters = append(clusters, ClusterInfo{
				Name:       contextName,
				Context:    contextName,
				Server:     server,
				User:       user,
				AuthMethod: authMethod,
				Source:     "kubeconfig",
				IsCurrent:  contextName == currentContext,
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
		slog.Error(fmt.Sprintf("[Warmup] failed to list clusters: %v", err))
		return
	}

	slog.Info(fmt.Sprintf("[Warmup] probing %d clusters for reachability...", len(clusters)))
	var wg sync.WaitGroup
	for _, cl := range clusters {
		wg.Add(1)
		go func(name, ctxName string) {
			defer wg.Done()
			probeCtx, probeCancel := context.WithTimeout(ctx, clusterProbeTimeout)
			defer probeCancel()

			client, clientErr := m.GetClient(ctxName)
			if clientErr != nil {
				errType := classifyError(clientErr.Error())
				m.mu.Lock()
				m.healthCache[ctxName] = &ClusterHealth{
					Cluster:      name,
					Reachable:    false,
					Healthy:      false,
					ErrorType:    errType,
					ErrorMessage: clientErr.Error(),
					CheckedAt:    time.Now().Format(time.RFC3339),
				}
				m.cacheTime[ctxName] = time.Now()
				m.mu.Unlock()
				if errType == "auth" {
					slog.Info(fmt.Sprintf("[Warmup] %s: auth failure — run credential refresh (e.g. tsh kube login) to restore access", name))
				} else {
					slog.Error(fmt.Sprintf("[Warmup] %s: unreachable (client error)", name))
				}
				return
			}

			_, listErr := client.CoreV1().Namespaces().List(probeCtx, metav1.ListOptions{Limit: 1})
			if listErr != nil {
				errType := classifyError(listErr.Error())
				m.mu.Lock()
				m.healthCache[ctxName] = &ClusterHealth{
					Cluster:      name,
					Reachable:    false,
					Healthy:      false,
					ErrorType:    errType,
					ErrorMessage: listErr.Error(),
					CheckedAt:    time.Now().Format(time.RFC3339),
				}
				m.cacheTime[ctxName] = time.Now()
				m.mu.Unlock()
				if errType == "auth" {
					slog.Info(fmt.Sprintf("[Warmup] %s: auth failure (will cache for %v to avoid exec-plugin spam)", name, authFailureCacheTTL))
				} else {
					slog.Info(fmt.Sprintf("[Warmup] %s: unreachable (%v)", name, listErr))
				}
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
				slog.Info(fmt.Sprintf("[Warmup] %s: reachable", name))
			}
		}(cl.Name, cl.Context)
	}

	// Wait for all probes to finish, but give up when the overall context deadline
	// fires. This prevents a single hung exec-plugin (e.g. oci credential helper)
	// from blocking server startup indefinitely.
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-ctx.Done():
		slog.Info("[Warmup] timed out waiting for all cluster probes — continuing startup")
	}

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
	slog.Info(fmt.Sprintf("[Warmup] done: %d reachable, %d unreachable", reachable, unreachable))
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
			cl.NeverConnected = h.LastSeen == ""
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
	slog.Info(fmt.Sprintf("[Slow] cluster %s marked as slow (reduced timeout for %v)", clusterName, slowClusterTTL))
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

	// Handle in-cluster context specially — accept both "in-cluster" and the detected name
	isInCluster := inClusterConfig != nil && (contextName == "in-cluster" || contextName == m.inClusterName)
	if isInCluster {
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
		isInCluster := m.inClusterConfig != nil && (contextName == "in-cluster" || contextName == m.inClusterName)
		if isInCluster {
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

// ClassifyError determines the error type from an error message.
// Returns one of: "timeout", "auth", "network", "certificate", or "unknown".
