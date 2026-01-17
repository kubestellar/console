package k8s

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

// MultiClusterClient manages connections to multiple Kubernetes clusters
type MultiClusterClient struct {
	mu              sync.RWMutex
	kubeconfig      string
	clients         map[string]*kubernetes.Clientset
	configs         map[string]*rest.Config
	rawConfig       *api.Config
	healthCache     map[string]*ClusterHealth
	cacheTTL        time.Duration
	cacheTime       map[string]time.Time
	watcher         *fsnotify.Watcher
	stopWatch       chan struct{}
	onReload        func() // Callback when config is reloaded
	inClusterConfig *rest.Config // In-cluster config when running inside k8s
}

// ClusterInfo represents basic cluster information
type ClusterInfo struct {
	Name      string `json:"name"`
	Context   string `json:"context"`
	Server    string `json:"server,omitempty"`
	User      string `json:"user,omitempty"`
	Healthy   bool   `json:"healthy"`
	Source    string `json:"source,omitempty"`
	NodeCount int    `json:"nodeCount,omitempty"`
	PodCount  int    `json:"podCount,omitempty"`
	IsCurrent bool   `json:"isCurrent,omitempty"`
}

// ClusterHealth represents cluster health status
type ClusterHealth struct {
	Cluster    string   `json:"cluster"`
	Healthy    bool     `json:"healthy"`
	APIServer  string   `json:"apiServer,omitempty"`
	NodeCount  int      `json:"nodeCount"`
	ReadyNodes int      `json:"readyNodes"`
	PodCount   int      `json:"podCount,omitempty"`
	Issues     []string `json:"issues,omitempty"`
	CheckedAt  string   `json:"checkedAt,omitempty"`
}

// PodInfo represents pod information
type PodInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster,omitempty"`
	Status    string `json:"status"`
	Ready     string `json:"ready"`
	Restarts  int    `json:"restarts"`
	Age       string `json:"age"`
	Node      string `json:"node,omitempty"`
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

// GPUNode represents a node with GPU resources
type GPUNode struct {
	Name         string `json:"name"`
	Cluster      string `json:"cluster"`
	GPUType      string `json:"gpuType"`
	GPUCount     int    `json:"gpuCount"`
	GPUAllocated int    `json:"gpuAllocated"`
}

// Deployment represents a Kubernetes deployment with rollout status
type Deployment struct {
	Name              string `json:"name"`
	Namespace         string `json:"namespace"`
	Cluster           string `json:"cluster,omitempty"`
	Status            string `json:"status"` // running, deploying, failed
	Replicas          int32  `json:"replicas"`
	ReadyReplicas     int32  `json:"readyReplicas"`
	UpdatedReplicas   int32  `json:"updatedReplicas"`
	AvailableReplicas int32  `json:"availableReplicas"`
	Progress          int    `json:"progress"` // 0-100
	Image             string `json:"image,omitempty"`
	Age               string `json:"age,omitempty"`
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
		kubeconfig:  kubeconfig,
		clients:     make(map[string]*kubernetes.Clientset),
		configs:     make(map[string]*rest.Config),
		healthCache: make(map[string]*ClusterHealth),
		cacheTTL:    30 * time.Second,
		cacheTime:   make(map[string]time.Time),
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
			m.clients = make(map[string]*kubernetes.Clientset)
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
	m.clients = make(map[string]*kubernetes.Clientset)
	m.configs = make(map[string]*rest.Config)
	m.healthCache = make(map[string]*ClusterHealth)
	m.cacheTime = make(map[string]time.Time)
	return nil
}

// StartWatching starts watching the kubeconfig file for changes
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

func (m *MultiClusterClient) watchLoop() {
	// Debounce timer to avoid reloading multiple times for rapid changes
	var debounceTimer *time.Timer
	debounceDelay := 500 * time.Millisecond

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
					// Debounce: reset timer on each event
					if debounceTimer != nil {
						debounceTimer.Stop()
					}
					debounceTimer = time.AfterFunc(debounceDelay, func() {
						log.Printf("Kubeconfig changed, reloading...")
						if err := m.LoadConfig(); err != nil {
							log.Printf("Error reloading kubeconfig: %v", err)
						} else {
							log.Printf("Kubeconfig reloaded successfully")
							// Notify listeners
							m.mu.RLock()
							callback := m.onReload
							m.mu.RUnlock()
							if callback != nil {
								callback()
							}
						}
					})
				}
			}
		case err, ok := <-m.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Kubeconfig watcher error: %v", err)
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

// GetClient returns a kubernetes client for the specified context
func (m *MultiClusterClient) GetClient(contextName string) (*kubernetes.Clientset, error) {
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

	// Set reasonable timeouts
	config.Timeout = 10 * time.Second

	client, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create client for context %s: %w", contextName, err)
	}

	m.clients[contextName] = client
	m.configs[contextName] = config
	return client, nil
}

// GetClusterHealth returns health status for a cluster
func (m *MultiClusterClient) GetClusterHealth(ctx context.Context, contextName string) (*ClusterHealth, error) {
	// Check cache
	m.mu.RLock()
	if health, ok := m.healthCache[contextName]; ok {
		if time.Since(m.cacheTime[contextName]) < m.cacheTTL {
			m.mu.RUnlock()
			return health, nil
		}
	}
	m.mu.RUnlock()

	client, err := m.GetClient(contextName)
	if err != nil {
		return &ClusterHealth{
			Cluster: contextName,
			Healthy: false,
			Issues:  []string{fmt.Sprintf("Failed to connect: %v", err)},
		}, nil
	}

	health := &ClusterHealth{
		Cluster:   contextName,
		Healthy:   true,
		CheckedAt: time.Now().Format(time.RFC3339),
	}

	// Get nodes
	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		health.Healthy = false
		health.Issues = append(health.Issues, fmt.Sprintf("Failed to list nodes: %v", err))
	} else {
		health.NodeCount = len(nodes.Items)
		for _, node := range nodes.Items {
			for _, condition := range node.Status.Conditions {
				if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
					health.ReadyNodes++
					break
				}
			}
		}
		if health.ReadyNodes < health.NodeCount {
			health.Issues = append(health.Issues, fmt.Sprintf("%d/%d nodes not ready", health.NodeCount-health.ReadyNodes, health.NodeCount))
		}
	}

	// Get pod count
	pods, err := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err == nil {
		health.PodCount = len(pods.Items)
	}

	// Cache the result
	m.mu.Lock()
	m.healthCache[contextName] = health
	m.cacheTime[contextName] = time.Now()
	m.mu.Unlock()

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

		for _, cs := range pod.Status.ContainerStatuses {
			if cs.Ready {
				ready++
			}
			restarts += int(cs.RestartCount)
		}

		result = append(result, PodInfo{
			Name:      pod.Name,
			Namespace: pod.Namespace,
			Cluster:   contextName,
			Status:    string(pod.Status.Phase),
			Ready:     fmt.Sprintf("%d/%d", ready, total),
			Restarts:  restarts,
			Age:       formatDuration(time.Since(pod.CreationTimestamp.Time)),
			Node:      pod.Spec.NodeName,
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

	var issues []PodIssue
	for _, pod := range pods.Items {
		var podIssues []string
		restarts := 0

		// Check container statuses
		for _, cs := range pod.Status.ContainerStatuses {
			restarts += int(cs.RestartCount)

			if cs.State.Waiting != nil {
				reason := cs.State.Waiting.Reason
				if reason == "CrashLoopBackOff" || reason == "ImagePullBackOff" || reason == "ErrImagePull" {
					podIssues = append(podIssues, reason)
				}
			}

			if cs.LastTerminationState.Terminated != nil {
				if cs.LastTerminationState.Terminated.Reason == "OOMKilled" {
					podIssues = append(podIssues, "OOMKilled")
				}
			}

			if cs.RestartCount > 5 {
				podIssues = append(podIssues, fmt.Sprintf("High restarts (%d)", cs.RestartCount))
			}
		}

		// Check pod phase
		if pod.Status.Phase == corev1.PodPending {
			podIssues = append(podIssues, "Pending")
		}
		if pod.Status.Phase == corev1.PodFailed {
			podIssues = append(podIssues, "Failed")
		}

		if len(podIssues) > 0 {
			issues = append(issues, PodIssue{
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Cluster:   contextName,
				Status:    string(pod.Status.Phase),
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
		result = append(result, Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
			Age:       formatDuration(time.Since(event.LastTimestamp.Time)),
		})
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
		result = append(result, Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
			Age:       formatDuration(time.Since(event.LastTimestamp.Time)),
		})
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

	var gpuNodes []GPUNode
	for _, node := range nodes.Items {
		// Check for nvidia.com/gpu in allocatable resources
		gpuQuantity, hasGPU := node.Status.Allocatable["nvidia.com/gpu"]
		if !hasGPU {
			continue
		}

		gpuCount := int(gpuQuantity.Value())
		if gpuCount == 0 {
			continue
		}

		// Determine GPU type from labels
		gpuType := "GPU"
		if label, ok := node.Labels["nvidia.com/gpu.product"]; ok {
			gpuType = label
		} else if label, ok := node.Labels["accelerator"]; ok {
			gpuType = label
		}

		// Get allocated GPUs by checking pods on this node
		pods, err := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("spec.nodeName=%s", node.Name),
		})

		allocated := 0
		if err == nil {
			for _, pod := range pods.Items {
				for _, container := range pod.Spec.Containers {
					if gpuReq, ok := container.Resources.Requests["nvidia.com/gpu"]; ok {
						allocated += int(gpuReq.Value())
					}
				}
			}
		}

		gpuNodes = append(gpuNodes, GPUNode{
			Name:         node.Name,
			Cluster:      contextName,
			GPUType:      gpuType,
			GPUCount:     gpuCount,
			GPUAllocated: allocated,
		})
	}

	return gpuNodes, nil
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
		})
	}

	return result, nil
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
