package agent

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
)

// DeviceCounts tracks hardware device counts for a node
type DeviceCounts struct {
	GPUCount        int  `json:"gpuCount"`
	NICCount        int  `json:"nicCount"`
	NVMECount       int  `json:"nvmeCount"`
	InfiniBandCount int  `json:"infinibandCount"`
	SRIOVCapable    bool `json:"sriovCapable"`    // SR-IOV networking
	RDMAAvailable   bool `json:"rdmaAvailable"`   // RDMA/RoCE capability
	MellanoxPresent bool `json:"mellanoxPresent"` // Mellanox NIC (pci-15b3)
	NVIDIANICPresent bool `json:"nvidiaNicPresent"` // NVIDIA NIC (pci-10de)
	SpectrumScale   bool `json:"spectrumScale"`   // IBM Spectrum Scale daemon
	MOFEDReady      bool `json:"mofedReady"`      // Mellanox OFED driver ready
	GPUDriverReady  bool `json:"gpuDriverReady"`  // GPU driver ready
}

// DeviceSnapshot represents device counts at a point in time
type DeviceSnapshot struct {
	NodeName  string       `json:"nodeName"`
	Cluster   string       `json:"cluster"`
	Counts    DeviceCounts `json:"counts"`
	Timestamp time.Time    `json:"timestamp"`
}

// DeviceAlert represents a detected device disappearance
type DeviceAlert struct {
	ID           string       `json:"id"`
	NodeName     string       `json:"nodeName"`
	Cluster      string       `json:"cluster"`
	DeviceType   string       `json:"deviceType"` // "gpu", "nic", "nvme", "infiniband"
	PreviousCount int         `json:"previousCount"`
	CurrentCount  int         `json:"currentCount"`
	DroppedCount  int         `json:"droppedCount"`
	FirstSeen    time.Time    `json:"firstSeen"`
	LastSeen     time.Time    `json:"lastSeen"`
	Severity     string       `json:"severity"` // "warning", "critical"
}

// DeviceAlertsResponse is the HTTP response format
type DeviceAlertsResponse struct {
	Alerts    []DeviceAlert `json:"alerts"`
	NodeCount int           `json:"nodeCount"`
	Timestamp string        `json:"timestamp"`
}

// DeviceTracker tracks hardware device counts over time to detect disappearances
type DeviceTracker struct {
	k8sClient *k8s.MultiClusterClient

	// Historical snapshots per node (key: "cluster/nodeName")
	history   map[string][]DeviceSnapshot
	// Maximum counts ever seen per node (baseline)
	maxCounts map[string]DeviceCounts
	// Current alerts
	alerts    map[string]*DeviceAlert

	mu        sync.RWMutex
	stopCh    chan struct{}

	// Broadcast function for WebSocket updates
	broadcast func(msgType string, payload interface{})
}

// NewDeviceTracker creates a new device tracker
func NewDeviceTracker(k8sClient *k8s.MultiClusterClient, broadcast func(string, interface{})) *DeviceTracker {
	return &DeviceTracker{
		k8sClient: k8sClient,
		history:   make(map[string][]DeviceSnapshot),
		maxCounts: make(map[string]DeviceCounts),
		alerts:    make(map[string]*DeviceAlert),
		stopCh:    make(chan struct{}),
		broadcast: broadcast,
	}
}

// Start begins periodic device tracking
func (t *DeviceTracker) Start() {
	go t.runLoop()
}

// Stop stops the device tracker
func (t *DeviceTracker) Stop() {
	close(t.stopCh)
}

func (t *DeviceTracker) runLoop() {
	// Initial scan
	t.scanDevices()

	ticker := time.NewTicker(60 * time.Second) // Check every minute
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			t.scanDevices()
		case <-t.stopCh:
			return
		}
	}
}

func (t *DeviceTracker) scanDevices() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	clusters, err := t.k8sClient.ListClusters(ctx)
	if err != nil {
		log.Printf("[DeviceTracker] Error listing clusters: %v", err)
		return
	}

	newAlerts := false

	for _, cluster := range clusters {
		nodes, err := t.k8sClient.GetNodes(ctx, cluster.Context)
		if err != nil {
			continue
		}

		for _, node := range nodes {
			key := cluster.Name + "/" + node.Name

			// Parse device counts from node labels and known fields
			counts := DeviceCounts{
				GPUCount: node.GPUCount,
			}

			// Parse additional device info from labels
			for labelKey, labelVal := range node.Labels {
				switch {
				// SR-IOV networking
				case strings.Contains(labelKey, "sriov.capable") || strings.Contains(labelKey, "sriov.configured"):
					if labelVal == "true" {
						counts.SRIOVCapable = true
					}
				// RDMA/RoCE capability
				case strings.Contains(labelKey, "rdma.available") || strings.Contains(labelKey, "rdma.capable"):
					if labelVal == "true" {
						counts.RDMAAvailable = true
					}
				// Mellanox NIC (pci-15b3)
				case strings.Contains(labelKey, "pci-15b3.present"):
					if labelVal == "true" {
						counts.MellanoxPresent = true
						counts.InfiniBandCount++ // At least one IB HCA
					}
				// NVIDIA NIC (pci-10de with sriov)
				case strings.Contains(labelKey, "pci-10de.sriov"):
					if labelVal == "true" {
						counts.NVIDIANICPresent = true
						counts.NICCount++
					}
				// NVMe storage
				case strings.Contains(labelKey, "storage-nonrotationaldisk") || strings.Contains(labelKey, "nvme"):
					if labelVal == "true" {
						counts.NVMECount = 1 // Mark as present
					}
				// IBM Spectrum Scale
				case strings.Contains(labelKey, "scale.spectrum.ibm.com/daemon"):
					counts.SpectrumScale = true
				// MOFED driver ready (Mellanox OFED)
				case strings.Contains(labelKey, "mofed.wait"):
					counts.MOFEDReady = labelVal == "false" // wait=false means ready
				// GPU driver ready
				case strings.Contains(labelKey, "gpu-driver-upgrade-state"):
					counts.GPUDriverReady = labelVal == "upgrade-done"
				}
			}

			snapshot := DeviceSnapshot{
				NodeName:  node.Name,
				Cluster:   cluster.Name,
				Counts:    counts,
				Timestamp: time.Now(),
			}

			t.mu.Lock()

			// Update history (keep last 24 hours)
			t.history[key] = append(t.history[key], snapshot)
			if len(t.history[key]) > 1440 { // 24 hours at 1-minute intervals
				t.history[key] = t.history[key][1:]
			}

			// Update max counts (baseline) - track highest values seen
			max := t.maxCounts[key]
			if counts.GPUCount > max.GPUCount {
				max.GPUCount = counts.GPUCount
			}
			if counts.NICCount > max.NICCount {
				max.NICCount = counts.NICCount
			}
			if counts.NVMECount > max.NVMECount {
				max.NVMECount = counts.NVMECount
			}
			if counts.InfiniBandCount > max.InfiniBandCount {
				max.InfiniBandCount = counts.InfiniBandCount
			}
			// Track boolean capabilities (once seen, should stay)
			if counts.SRIOVCapable {
				max.SRIOVCapable = true
			}
			if counts.RDMAAvailable {
				max.RDMAAvailable = true
			}
			if counts.MellanoxPresent {
				max.MellanoxPresent = true
			}
			if counts.NVIDIANICPresent {
				max.NVIDIANICPresent = true
			}
			if counts.SpectrumScale {
				max.SpectrumScale = true
			}
			if counts.MOFEDReady {
				max.MOFEDReady = true
			}
			if counts.GPUDriverReady {
				max.GPUDriverReady = true
			}
			t.maxCounts[key] = max

			// Check for device count drops
			if alert := t.checkForDrop(key, node.Name, cluster.Name, "gpu", max.GPUCount, counts.GPUCount); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForDrop(key, node.Name, cluster.Name, "nic", max.NICCount, counts.NICCount); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForDrop(key, node.Name, cluster.Name, "nvme", max.NVMECount, counts.NVMECount); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForDrop(key, node.Name, cluster.Name, "infiniband", max.InfiniBandCount, counts.InfiniBandCount); alert != nil {
				newAlerts = true
			}

			// Check for capability/driver state changes (was ready, now not ready)
			if alert := t.checkForBoolDrop(key, node.Name, cluster.Name, "sriov", max.SRIOVCapable, counts.SRIOVCapable); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForBoolDrop(key, node.Name, cluster.Name, "rdma", max.RDMAAvailable, counts.RDMAAvailable); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForBoolDrop(key, node.Name, cluster.Name, "mellanox", max.MellanoxPresent, counts.MellanoxPresent); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForBoolDrop(key, node.Name, cluster.Name, "mofed-driver", max.MOFEDReady, counts.MOFEDReady); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForBoolDrop(key, node.Name, cluster.Name, "gpu-driver", max.GPUDriverReady, counts.GPUDriverReady); alert != nil {
				newAlerts = true
			}
			if alert := t.checkForBoolDrop(key, node.Name, cluster.Name, "spectrum-scale", max.SpectrumScale, counts.SpectrumScale); alert != nil {
				newAlerts = true
			}

			t.mu.Unlock()
		}
	}

	// Broadcast if new alerts
	if newAlerts && t.broadcast != nil {
		t.broadcast("device_alerts_updated", t.GetAlerts())
	}
}

// checkForDrop checks if a device count has dropped and creates/updates an alert
// Must be called with lock held
func (t *DeviceTracker) checkForDrop(key, nodeName, cluster, deviceType string, maxCount, currentCount int) *DeviceAlert {
	alertKey := key + "/" + deviceType

	// No drop if max is 0 (never had devices) or current equals max
	if maxCount == 0 || currentCount >= maxCount {
		// Clear any existing alert for this device type
		delete(t.alerts, alertKey)
		return nil
	}

	dropped := maxCount - currentCount
	severity := "warning"
	if dropped > 1 || (deviceType == "gpu" && dropped > 0) {
		severity = "critical"
	}

	now := time.Now()
	if existing, ok := t.alerts[alertKey]; ok {
		existing.CurrentCount = currentCount
		existing.DroppedCount = dropped
		existing.LastSeen = now
		existing.Severity = severity
		return existing
	}

	alert := &DeviceAlert{
		ID:            alertKey,
		NodeName:      nodeName,
		Cluster:       cluster,
		DeviceType:    deviceType,
		PreviousCount: maxCount,
		CurrentCount:  currentCount,
		DroppedCount:  dropped,
		FirstSeen:     now,
		LastSeen:      now,
		Severity:      severity,
	}
	t.alerts[alertKey] = alert

	log.Printf("[DeviceTracker] ALERT: %s on %s/%s dropped from %d to %d",
		deviceType, cluster, nodeName, maxCount, currentCount)

	return alert
}

// checkForBoolDrop checks if a boolean capability has changed from true to false
// Must be called with lock held
func (t *DeviceTracker) checkForBoolDrop(key, nodeName, cluster, deviceType string, wasActive, isActive bool) *DeviceAlert {
	alertKey := key + "/" + deviceType

	// No alert if it was never active or is still active
	if !wasActive || isActive {
		delete(t.alerts, alertKey)
		return nil
	}

	// Capability was active but now isn't - this is a problem
	now := time.Now()
	severity := "warning"
	if deviceType == "gpu-driver" || deviceType == "mofed-driver" {
		severity = "critical" // Driver issues are critical
	}

	if existing, ok := t.alerts[alertKey]; ok {
		existing.LastSeen = now
		existing.Severity = severity
		return existing
	}

	alert := &DeviceAlert{
		ID:            alertKey,
		NodeName:      nodeName,
		Cluster:       cluster,
		DeviceType:    deviceType,
		PreviousCount: 1, // Was present
		CurrentCount:  0, // Now absent
		DroppedCount:  1,
		FirstSeen:     now,
		LastSeen:      now,
		Severity:      severity,
	}
	t.alerts[alertKey] = alert

	log.Printf("[DeviceTracker] ALERT: %s on %s/%s is no longer available",
		deviceType, cluster, nodeName)

	return alert
}

// GetAlerts returns all current device alerts
func (t *DeviceTracker) GetAlerts() DeviceAlertsResponse {
	t.mu.RLock()
	defer t.mu.RUnlock()

	alerts := make([]DeviceAlert, 0, len(t.alerts))
	for _, alert := range t.alerts {
		alerts = append(alerts, *alert)
	}

	return DeviceAlertsResponse{
		Alerts:    alerts,
		NodeCount: len(t.maxCounts),
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

// GetNodeHistory returns device count history for a specific node
func (t *DeviceTracker) GetNodeHistory(cluster, nodeName string) []DeviceSnapshot {
	t.mu.RLock()
	defer t.mu.RUnlock()

	key := cluster + "/" + nodeName
	if history, ok := t.history[key]; ok {
		result := make([]DeviceSnapshot, len(history))
		copy(result, history)
		return result
	}
	return nil
}

// NodeDeviceInventory represents a node's device counts
type NodeDeviceInventory struct {
	NodeName        string       `json:"nodeName"`
	Cluster         string       `json:"cluster"`
	Devices         DeviceCounts `json:"devices"`
	LastSeen        string       `json:"lastSeen"`
}

// DeviceInventoryResponse is the HTTP response for device inventory
type DeviceInventoryResponse struct {
	Nodes     []NodeDeviceInventory `json:"nodes"`
	Timestamp string                `json:"timestamp"`
}

// GetInventory returns all tracked nodes with their device counts
func (t *DeviceTracker) GetInventory() DeviceInventoryResponse {
	t.mu.RLock()
	defer t.mu.RUnlock()

	nodes := make([]NodeDeviceInventory, 0, len(t.maxCounts))
	for key, counts := range t.maxCounts {
		// Parse cluster/nodeName from key
		cluster := ""
		nodeName := key
		for i := 0; i < len(key); i++ {
			if key[i] == '/' {
				cluster = key[:i]
				nodeName = key[i+1:]
				break
			}
		}

		lastSeen := ""
		if history, ok := t.history[key]; ok && len(history) > 0 {
			lastSeen = history[len(history)-1].Timestamp.Format("2006-01-02T15:04:05Z07:00")
		}

		nodes = append(nodes, NodeDeviceInventory{
			NodeName: nodeName,
			Cluster:  cluster,
			Devices:  counts,
			LastSeen: lastSeen,
		})
	}

	return DeviceInventoryResponse{
		Nodes:     nodes,
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

// ClearAlert manually clears an alert (e.g., after power cycle)
func (t *DeviceTracker) ClearAlert(alertID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	if _, ok := t.alerts[alertID]; ok {
		delete(t.alerts, alertID)
		// Also reset the max count to current to prevent re-alerting
		// Extract node key from alert ID (format: "cluster/node/deviceType")
		parts := alertID[:len(alertID)-len("/gpu")-1] // rough extraction
		if counts, ok := t.maxCounts[parts]; ok {
			// Get current counts from latest history
			if history, ok := t.history[parts]; ok && len(history) > 0 {
				latest := history[len(history)-1].Counts
				switch {
				case alertID[len(alertID)-3:] == "gpu":
					counts.GPUCount = latest.GPUCount
				case alertID[len(alertID)-3:] == "nic":
					counts.NICCount = latest.NICCount
				case alertID[len(alertID)-4:] == "nvme":
					counts.NVMECount = latest.NVMECount
				}
				t.maxCounts[parts] = counts
			}
		}
		return true
	}
	return false
}
