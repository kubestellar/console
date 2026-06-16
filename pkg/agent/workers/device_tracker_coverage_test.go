package workers

import (
	"sync"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
)

// newTestDeviceTracker creates a minimal DeviceTracker for unit tests.
func newTestDeviceTracker() *DeviceTracker {
	return &DeviceTracker{
		history:   make(map[string][]DeviceSnapshot),
		maxCounts: make(map[string]DeviceCounts),
		alerts:    make(map[string]*DeviceAlert),
		stopCh:    make(chan struct{}),
	}
}

func TestParseDeviceCounts_NoLabels(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{GPUCount: 2}

	counts := dt.parseDeviceCounts(node)
	if counts.GPUCount != 2 {
		t.Errorf("expected GPUCount=2, got %d", counts.GPUCount)
	}
	if counts.SRIOVCapable || counts.RDMAAvailable || counts.MellanoxPresent {
		t.Error("expected all booleans to be false with no labels")
	}
}

func TestParseDeviceCounts_SRIOVCapable(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"feature.node.kubernetes.io/sriov.capable": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.SRIOVCapable {
		t.Error("expected SRIOVCapable=true")
	}
}

func TestParseDeviceCounts_SRIOVConfigured(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"network.sriov.configured": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.SRIOVCapable {
		t.Error("expected SRIOVCapable=true from sriov.configured")
	}
}

func TestParseDeviceCounts_SRIOVFalseValue(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"feature.node.kubernetes.io/sriov.capable": "false",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if counts.SRIOVCapable {
		t.Error("expected SRIOVCapable=false when label value is 'false'")
	}
}

func TestParseDeviceCounts_RDMAAvailable(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"network.rdma.available": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.RDMAAvailable {
		t.Error("expected RDMAAvailable=true")
	}
}

func TestParseDeviceCounts_RDMACapable(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"feature.node.kubernetes.io/rdma.capable": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.RDMAAvailable {
		t.Error("expected RDMAAvailable=true from rdma.capable label")
	}
}

func TestParseDeviceCounts_MellanoxPresent(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"feature.node.kubernetes.io/pci-15b3.present": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.MellanoxPresent {
		t.Error("expected MellanoxPresent=true")
	}
	if counts.InfiniBandCount != 1 {
		t.Errorf("expected InfiniBandCount=1, got %d", counts.InfiniBandCount)
	}
}

func TestParseDeviceCounts_NVIDIANICPresent(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"feature.node.kubernetes.io/pci-10de.sriov": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.NVIDIANICPresent {
		t.Error("expected NVIDIANICPresent=true")
	}
	if counts.NICCount != 1 {
		t.Errorf("expected NICCount=1, got %d", counts.NICCount)
	}
}

func TestParseDeviceCounts_NVMEDetected(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"feature.node.kubernetes.io/storage-nonrotationaldisk": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if counts.NVMECount != 1 {
		t.Errorf("expected NVMECount=1, got %d", counts.NVMECount)
	}
}

func TestParseDeviceCounts_NVMEFromNvmeLabel(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"feature.node.kubernetes.io/nvme": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if counts.NVMECount != 1 {
		t.Errorf("expected NVMECount=1 from nvme label, got %d", counts.NVMECount)
	}
}

func TestParseDeviceCounts_SpectrumScale(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"scale.spectrum.ibm.com/daemon": "running",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.SpectrumScale {
		t.Error("expected SpectrumScale=true")
	}
}

func TestParseDeviceCounts_MOFEDReady(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"nvidia.com/mofed.wait": "false",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.MOFEDReady {
		t.Error("expected MOFEDReady=true when mofed.wait=false")
	}
}

func TestParseDeviceCounts_MOFEDNotReady(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"nvidia.com/mofed.wait": "true",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if counts.MOFEDReady {
		t.Error("expected MOFEDReady=false when mofed.wait=true")
	}
}

func TestParseDeviceCounts_GPUDriverReady(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"nvidia.com/gpu-driver-upgrade-state": "upgrade-done",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if !counts.GPUDriverReady {
		t.Error("expected GPUDriverReady=true")
	}
}

func TestParseDeviceCounts_GPUDriverNotReady(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		Labels: map[string]string{
			"nvidia.com/gpu-driver-upgrade-state": "upgrading",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if counts.GPUDriverReady {
		t.Error("expected GPUDriverReady=false when state is 'upgrading'")
	}
}

func TestParseDeviceCounts_MultipleLabels(t *testing.T) {
	dt := newTestDeviceTracker()
	node := k8s.NodeInfo{
		GPUCount: 4,
		Labels: map[string]string{
			"feature.node.kubernetes.io/sriov.capable":            "true",
			"network.rdma.available":                              "true",
			"feature.node.kubernetes.io/pci-15b3.present":         "true",
			"feature.node.kubernetes.io/pci-10de.sriov":           "true",
			"nvidia.com/gpu-driver-upgrade-state":                  "upgrade-done",
			"nvidia.com/mofed.wait":                                "false",
			"feature.node.kubernetes.io/storage-nonrotationaldisk": "true",
			"scale.spectrum.ibm.com/daemon":                        "ok",
		},
	}
	counts := dt.parseDeviceCounts(node)
	if counts.GPUCount != 4 {
		t.Errorf("GPUCount: expected 4, got %d", counts.GPUCount)
	}
	if !counts.SRIOVCapable {
		t.Error("expected SRIOVCapable=true")
	}
	if !counts.RDMAAvailable {
		t.Error("expected RDMAAvailable=true")
	}
	if !counts.MellanoxPresent {
		t.Error("expected MellanoxPresent=true")
	}
	if !counts.NVIDIANICPresent {
		t.Error("expected NVIDIANICPresent=true")
	}
	if !counts.GPUDriverReady {
		t.Error("expected GPUDriverReady=true")
	}
	if !counts.MOFEDReady {
		t.Error("expected MOFEDReady=true")
	}
	if counts.NVMECount != 1 {
		t.Errorf("NVMECount: expected 1, got %d", counts.NVMECount)
	}
	if !counts.SpectrumScale {
		t.Error("expected SpectrumScale=true")
	}
	if counts.InfiniBandCount != 1 {
		t.Errorf("InfiniBandCount: expected 1, got %d", counts.InfiniBandCount)
	}
	if counts.NICCount != 1 {
		t.Errorf("NICCount: expected 1, got %d", counts.NICCount)
	}
}

// --- checkForBoolDrop tests ---

func TestCheckForBoolDrop_NeverActive(t *testing.T) {
	dt := newTestDeviceTracker()
	alert := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", false, false)
	if alert != nil {
		t.Error("expected no alert when capability was never active")
	}
}

func TestCheckForBoolDrop_StillActive(t *testing.T) {
	dt := newTestDeviceTracker()
	alert := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", true, true)
	if alert != nil {
		t.Error("expected no alert when capability is still active")
	}
}

func TestCheckForBoolDrop_ClearsExistingAlertWhenStillActive(t *testing.T) {
	dt := newTestDeviceTracker()
	// Simulate pre-existing alert
	alertKey := "cluster1/node1/sriov"
	dt.alerts[alertKey] = &DeviceAlert{ID: alertKey}

	alert := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", true, true)
	if alert != nil {
		t.Error("expected no alert when capability is still active")
	}
	if _, exists := dt.alerts[alertKey]; exists {
		t.Error("expected existing alert to be deleted when capability is still active")
	}
}

func TestCheckForBoolDrop_NewAlert(t *testing.T) {
	dt := newTestDeviceTracker()
	alert := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", true, false)

	if alert == nil {
		t.Fatal("expected an alert for bool drop")
	}
	if alert.Severity != "warning" {
		t.Errorf("expected severity=warning, got %q", alert.Severity)
	}
	if alert.NodeName != "node1" {
		t.Errorf("expected NodeName=node1, got %q", alert.NodeName)
	}
	if alert.Cluster != "cluster1" {
		t.Errorf("expected Cluster=cluster1, got %q", alert.Cluster)
	}
	if alert.DeviceType != "sriov" {
		t.Errorf("expected DeviceType=sriov, got %q", alert.DeviceType)
	}
	if alert.PreviousCount != 1 || alert.CurrentCount != 0 {
		t.Errorf("expected prev=1 curr=0, got prev=%d curr=%d", alert.PreviousCount, alert.CurrentCount)
	}
}

func TestCheckForBoolDrop_CriticalForGPUDriver(t *testing.T) {
	dt := newTestDeviceTracker()
	alert := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "gpu-driver", true, false)

	if alert == nil {
		t.Fatal("expected alert")
	}
	if alert.Severity != "critical" {
		t.Errorf("expected severity=critical for gpu-driver, got %q", alert.Severity)
	}
}

func TestCheckForBoolDrop_CriticalForMOFED(t *testing.T) {
	dt := newTestDeviceTracker()
	alert := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "mofed-driver", true, false)

	if alert == nil {
		t.Fatal("expected alert")
	}
	if alert.Severity != "critical" {
		t.Errorf("expected severity=critical for mofed-driver, got %q", alert.Severity)
	}
}

func TestCheckForBoolDrop_ExistingAlertUpdated(t *testing.T) {
	dt := newTestDeviceTracker()
	// First call creates
	first := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", true, false)
	if first == nil {
		t.Fatal("expected initial alert")
	}
	firstSeen := first.FirstSeen

	// Second call updates LastSeen
	second := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", true, false)
	if second == nil {
		t.Fatal("expected updated alert")
	}
	if second.FirstSeen != firstSeen {
		t.Error("expected FirstSeen to remain unchanged")
	}
	if second.LastSeen.Before(firstSeen) {
		t.Error("expected LastSeen to be >= FirstSeen")
	}
}

func TestCheckForBoolDrop_BecameActiveAgainClearsAlert(t *testing.T) {
	dt := newTestDeviceTracker()
	// Create alert
	dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", true, false)

	// Capability comes back
	alert := dt.checkForBoolDrop("cluster1/node1", "node1", "cluster1", "sriov", true, true)
	if alert != nil {
		t.Error("expected no alert when capability is restored")
	}
	alertKey := "cluster1/node1/sriov"
	if _, exists := dt.alerts[alertKey]; exists {
		t.Error("expected alert to be cleared when capability is restored")
	}
}

// --- processSnapshot tests ---

func TestProcessSnapshot_AddsHistory(t *testing.T) {
	dt := newTestDeviceTracker()
	snap := DeviceSnapshot{
		NodeName: "node1",
		Cluster:  "cluster1",
		Counts:   DeviceCounts{GPUCount: 2},
	}

	dt.processSnapshot(snap)

	key := "cluster1/node1"
	dt.mu.RLock()
	defer dt.mu.RUnlock()
	if len(dt.history[key]) != 1 {
		t.Errorf("expected 1 history entry, got %d", len(dt.history[key]))
	}
}

func TestProcessSnapshot_TruncatesHistory(t *testing.T) {
	dt := newTestDeviceTracker()
	key := "cluster1/node1"

	// Pre-fill with 1440 entries
	dt.mu.Lock()
	dt.history[key] = make([]DeviceSnapshot, 1440)
	dt.mu.Unlock()

	snap := DeviceSnapshot{
		NodeName: "node1",
		Cluster:  "cluster1",
		Counts:   DeviceCounts{GPUCount: 1},
	}
	dt.processSnapshot(snap)

	dt.mu.RLock()
	defer dt.mu.RUnlock()
	if len(dt.history[key]) != 1440 {
		t.Errorf("expected history capped at 1440, got %d", len(dt.history[key]))
	}
}

// --- GetAlerts tests ---

func TestGetAlerts_NilTracker(t *testing.T) {
	var dt *DeviceTracker
	resp := dt.GetAlerts()
	if resp.Alerts == nil {
		t.Error("expected non-nil alerts slice")
	}
	if len(resp.Alerts) != 0 {
		t.Errorf("expected 0 alerts, got %d", len(resp.Alerts))
	}
}

func TestGetAlerts_WithAlerts(t *testing.T) {
	dt := newTestDeviceTracker()
	dt.alerts["cluster1/node1/gpu"] = &DeviceAlert{
		ID:       "cluster1/node1/gpu",
		NodeName: "node1",
		Cluster:  "cluster1",
		Severity: "critical",
	}
	dt.maxCounts["cluster1/node1"] = DeviceCounts{GPUCount: 4}

	resp := dt.GetAlerts()
	if len(resp.Alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(resp.Alerts))
	}
	if resp.Alerts[0].Severity != "critical" {
		t.Errorf("expected severity=critical, got %q", resp.Alerts[0].Severity)
	}
	if resp.NodeCount != 1 {
		t.Errorf("expected NodeCount=1, got %d", resp.NodeCount)
	}
}

func TestGetAlerts_SkipsNilAlert(t *testing.T) {
	dt := newTestDeviceTracker()
	dt.alerts["cluster1/node1/gpu"] = nil // nil entry

	resp := dt.GetAlerts()
	if len(resp.Alerts) != 0 {
		t.Errorf("expected 0 alerts (nil skipped), got %d", len(resp.Alerts))
	}
}

// --- GetNodeHistory tests ---

func TestGetNodeHistory_NilTracker(t *testing.T) {
	var dt *DeviceTracker
	history := dt.GetNodeHistory("cluster1", "node1")
	if history != nil {
		t.Error("expected nil from nil tracker")
	}
}

func TestGetNodeHistory_Found(t *testing.T) {
	dt := newTestDeviceTracker()
	dt.mu.Lock()
	dt.history["cluster1/node1"] = []DeviceSnapshot{
		{NodeName: "node1", Cluster: "cluster1", Counts: DeviceCounts{GPUCount: 2}},
	}
	dt.mu.Unlock()

	history := dt.GetNodeHistory("cluster1", "node1")
	if len(history) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(history))
	}
}

func TestGetNodeHistory_NotFound(t *testing.T) {
	dt := newTestDeviceTracker()
	history := dt.GetNodeHistory("cluster1", "nonexist")
	if len(history) != 0 {
		t.Errorf("expected 0 entries, got %d", len(history))
	}
}

// --- ClearAlert tests ---

func TestClearAlert_Exists(t *testing.T) {
	dt := newTestDeviceTracker()
	dt.alerts["cluster1/node1/gpu"] = &DeviceAlert{ID: "cluster1/node1/gpu"}

	cleared := dt.ClearAlert("cluster1/node1/gpu")
	if !cleared {
		t.Error("expected ClearAlert to return true for existing alert")
	}
	if _, exists := dt.alerts["cluster1/node1/gpu"]; exists {
		t.Error("expected alert to be removed")
	}
}

func TestClearAlert_NotExists(t *testing.T) {
	dt := newTestDeviceTracker()
	cleared := dt.ClearAlert("nonexistent")
	if cleared {
		t.Error("expected ClearAlert to return false for non-existing alert")
	}
}

// --- NewDeviceTracker tests ---

func TestNewDeviceTracker_NilClient(t *testing.T) {
	dt := NewDeviceTracker(nil, func(string, interface{}) {})
	if dt != nil {
		t.Error("expected nil DeviceTracker when k8sClient is nil")
	}
}

// --- concurrent access test ---

func TestDeviceTracker_ConcurrentAccess(t *testing.T) {
	dt := newTestDeviceTracker()
	var wg sync.WaitGroup

	// Concurrent reads and writes
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			dt.GetAlerts()
		}()
		go func() {
			defer wg.Done()
			dt.processSnapshot(DeviceSnapshot{
				NodeName: "node1",
				Cluster:  "cluster1",
				Counts:   DeviceCounts{GPUCount: 1},
			})
		}()
	}
	wg.Wait()
}
