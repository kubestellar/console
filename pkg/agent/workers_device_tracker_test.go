package agent

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestDeviceTracker(t *testing.T) {
	// 1. Setup mock k8s client
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
		Clusters: map[string]*api.Cluster{"cl1": {Server: "s1"}},
	})

	node1 := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node1",
			Labels: map[string]string{
				"nvidia.com/gpu.product": "Tesla T4",
				"pci-15b3.present":       "true",
			},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("2"),
			},
			Capacity: corev1.ResourceList{
				"cpu":    resource.MustParse("8"),
				"memory": resource.MustParse("32Gi"),
			},
			Conditions: []corev1.NodeCondition{
				{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
			},
		},
	}

	fakeCS := fake.NewSimpleClientset(node1)
	m.InjectClient("c1", fakeCS)

	var broadcastedMsg string
	broadcast := func(msg string, payload interface{}) {
		broadcastedMsg = msg
	}

	dt := NewDeviceTracker(m, broadcast)

	// 2. Scan initial state
	dt.scanDevices()

	inventory := dt.GetInventory()
	if len(inventory.Nodes) != 1 {
		t.Fatalf("Expected 1 node in inventory, got %d", len(inventory.Nodes))
	}
	if inventory.Nodes[0].Devices.GPUCount != 2 {
		t.Errorf("Expected 2 GPUs, got %d", inventory.Nodes[0].Devices.GPUCount)
	}

	// 3. Simulate drop (GPU disappearance)
	node1.Status.Allocatable["nvidia.com/gpu"] = resource.MustParse("1")
	fakeCS.CoreV1().Nodes().Update(context.Background(), node1, metav1.UpdateOptions{})

	dt.scanDevices()

	alerts := dt.GetAlerts()
	if len(alerts.Alerts) != 1 {
		t.Errorf("Expected 1 alert, got %d", len(alerts.Alerts))
	}
	if alerts.Alerts[0].DroppedCount != 1 {
		t.Errorf("Expected dropped count 1, got %d", alerts.Alerts[0].DroppedCount)
	}
	if broadcastedMsg != "device_alerts_updated" {
		t.Errorf("Expected broadcast 'device_alerts_updated', got %q", broadcastedMsg)
	}

	// 4. Test ClearAlert
	alertID := alerts.Alerts[0].ID
	dt.ClearAlert(alertID)

	alerts = dt.GetAlerts()
	if len(alerts.Alerts) != 0 {
		t.Error("Alert was not cleared")
	}

	// 5. Test History
	history := dt.GetNodeHistory("c1", "node1")
	if len(history) < 2 {
		t.Errorf("Expected at least 2 snapshots in history, got %d", len(history))
	}
}
