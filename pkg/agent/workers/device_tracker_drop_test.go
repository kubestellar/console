package workers

import (
	"sync"
	"testing"
)

// newTestDeviceTrackerDrop creates a minimal DeviceTracker for drop tests.
func newTestDeviceTrackerDrop() *DeviceTracker {
	return &DeviceTracker{
		history:   make(map[string][]DeviceSnapshot),
		maxCounts: make(map[string]DeviceCounts),
		alerts:    make(map[string]*DeviceAlert),
		stopCh:    make(chan struct{}),
		stopOnce:  sync.Once{},
	}
}

// --- checkForDrop tests ---

func TestCheckForDrop_NeverHadDevices(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("c1/n1", "n1", "c1", "gpu", 0, 0)
	if alert != nil {
		t.Error("expected no alert when maxCount is 0 (never had devices)")
	}
}

func TestCheckForDrop_CurrentEqualsMax(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("c1/n1", "n1", "c1", "gpu", 4, 4)
	if alert != nil {
		t.Error("expected no alert when currentCount equals maxCount")
	}
}

func TestCheckForDrop_CurrentExceedsMax(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("c1/n1", "n1", "c1", "nic", 2, 3)
	if alert != nil {
		t.Error("expected no alert when currentCount exceeds maxCount")
	}
}

func TestCheckForDrop_ClearsExistingAlertWhenRecovered(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alertKey := "c1/n1/gpu"
	dt.alerts[alertKey] = &DeviceAlert{ID: alertKey}

	alert := dt.checkForDrop("c1/n1", "n1", "c1", "gpu", 4, 4)
	if alert != nil {
		t.Error("expected no alert when recovered")
	}
	if _, exists := dt.alerts[alertKey]; exists {
		t.Error("expected alert to be deleted when recovered")
	}
}

func TestCheckForDrop_SingleDropWarning(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("c1/n1", "n1", "c1", "nic", 3, 2)

	if alert == nil {
		t.Fatal("expected alert for single drop")
	}
	if alert.Severity != "warning" {
		t.Errorf("expected severity=warning for single non-GPU drop, got %q", alert.Severity)
	}
	if alert.PreviousCount != 3 || alert.CurrentCount != 2 {
		t.Errorf("expected prev=3 curr=2, got prev=%d curr=%d", alert.PreviousCount, alert.CurrentCount)
	}
	if alert.DroppedCount != 1 {
		t.Errorf("expected DroppedCount=1, got %d", alert.DroppedCount)
	}
}

func TestCheckForDrop_MultiDropCritical(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("c1/n1", "n1", "c1", "nic", 4, 2)

	if alert == nil {
		t.Fatal("expected alert for multi-drop")
	}
	if alert.Severity != "critical" {
		t.Errorf("expected severity=critical for multi-drop, got %q", alert.Severity)
	}
	if alert.DroppedCount != 2 {
		t.Errorf("expected DroppedCount=2, got %d", alert.DroppedCount)
	}
}

func TestCheckForDrop_GPUSingleDropIsCritical(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("c1/n1", "n1", "c1", "gpu", 4, 3)

	if alert == nil {
		t.Fatal("expected alert for GPU drop")
	}
	if alert.Severity != "critical" {
		t.Errorf("expected severity=critical for any GPU drop, got %q", alert.Severity)
	}
}

func TestCheckForDrop_UpdatesExistingAlert(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	// Create initial alert
	first := dt.checkForDrop("c1/n1", "n1", "c1", "gpu", 4, 2)
	if first == nil {
		t.Fatal("expected initial alert")
	}
	firstSeen := first.FirstSeen

	// Update with worse drop
	second := dt.checkForDrop("c1/n1", "n1", "c1", "gpu", 4, 1)
	if second == nil {
		t.Fatal("expected updated alert")
	}
	if second.FirstSeen != firstSeen {
		t.Error("expected FirstSeen to remain unchanged on update")
	}
	if second.CurrentCount != 1 {
		t.Errorf("expected CurrentCount=1, got %d", second.CurrentCount)
	}
	if second.DroppedCount != 3 {
		t.Errorf("expected DroppedCount=3, got %d", second.DroppedCount)
	}
}

func TestCheckForDrop_NodeAndClusterFields(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("prod/worker-3", "worker-3", "prod", "nvme", 2, 0)

	if alert == nil {
		t.Fatal("expected alert")
	}
	if alert.NodeName != "worker-3" {
		t.Errorf("expected NodeName=worker-3, got %q", alert.NodeName)
	}
	if alert.Cluster != "prod" {
		t.Errorf("expected Cluster=prod, got %q", alert.Cluster)
	}
	if alert.DeviceType != "nvme" {
		t.Errorf("expected DeviceType=nvme, got %q", alert.DeviceType)
	}
}

func TestCheckForDrop_AlertID(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	alert := dt.checkForDrop("c1/n1", "n1", "c1", "infiniband", 2, 1)
	if alert == nil {
		t.Fatal("expected alert")
	}
	if alert.ID != "c1/n1/infiniband" {
		t.Errorf("expected ID=c1/n1/infiniband, got %q", alert.ID)
	}
}

// --- GetInventory additional tests ---

func TestGetInventory_NilTracker(t *testing.T) {
	var dt *DeviceTracker
	resp := dt.GetInventory()
	if resp.Nodes == nil {
		t.Error("expected non-nil Nodes slice")
	}
	if len(resp.Nodes) != 0 {
		t.Errorf("expected 0 nodes, got %d", len(resp.Nodes))
	}
}

func TestGetInventory_WithData(t *testing.T) {
	dt := newTestDeviceTrackerDrop()
	dt.mu.Lock()
	dt.maxCounts["c1/n1"] = DeviceCounts{GPUCount: 4, NICCount: 2}
	dt.history["c1/n1"] = []DeviceSnapshot{
		{NodeName: "n1", Cluster: "c1", Counts: DeviceCounts{GPUCount: 4, NICCount: 2}},
	}
	dt.mu.Unlock()

	resp := dt.GetInventory()
	if len(resp.Nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(resp.Nodes))
	}
	if resp.Nodes[0].NodeName != "n1" {
		t.Errorf("expected NodeName=n1, got %q", resp.Nodes[0].NodeName)
	}
	if resp.Nodes[0].Cluster != "c1" {
		t.Errorf("expected Cluster=c1, got %q", resp.Nodes[0].Cluster)
	}
	if resp.Nodes[0].Devices.GPUCount != 4 {
		t.Errorf("expected GPUCount=4, got %d", resp.Nodes[0].Devices.GPUCount)
	}
}
