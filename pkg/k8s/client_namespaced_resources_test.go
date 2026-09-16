package k8s

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestGetServices(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "svc1", Namespace: "default"},
		Spec: corev1.ServiceSpec{
			Type:  corev1.ServiceTypeClusterIP,
			Ports: []corev1.ServicePort{{Port: 80}},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(svc)
	m.clients["c1"] = fakeCS

	svcs, err := m.GetServices(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetServices failed: %v", err)
	}

	if len(svcs) != 1 {
		t.Fatalf("Expected 1 service, got %d", len(svcs))
	}
	if svcs[0].Name != "svc1" {
		t.Errorf("Expected svc1, got %s", svcs[0].Name)
	}
	if svcs[0].Type != "ClusterIP" {
		t.Errorf("Expected ClusterIP, got %s", svcs[0].Type)
	}
}

// TestGetServices_EndpointsAndLoadBalancer verifies the fix for
// issue #6150 (endpoint count is based on the actual core/v1 Endpoints
// object, not the number of services) and issue #6153 (LoadBalancer
// services with no ingress populated are reported as Provisioning).

func TestGetServices_EndpointsAndLoadBalancer(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Service with two ready backend addresses across two subsets.
	svcWithEndpoints := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "with-eps", Namespace: "default"},
		Spec: corev1.ServiceSpec{
			Type:  corev1.ServiceTypeClusterIP,
			Ports: []corev1.ServicePort{{Port: 80}},
		},
	}
	epsForSvc := &corev1.Endpoints{
		ObjectMeta: metav1.ObjectMeta{Name: "with-eps", Namespace: "default"},
		Subsets: []corev1.EndpointSubset{
			{Addresses: []corev1.EndpointAddress{{IP: "10.0.0.1"}, {IP: "10.0.0.2"}}},
			{Addresses: []corev1.EndpointAddress{{IP: "10.0.0.3"}}},
		},
	}

	// Service with a matching Endpoints object that has zero addresses.
	svcNoPods := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "no-pods", Namespace: "default"},
		Spec: corev1.ServiceSpec{
			Type:  corev1.ServiceTypeClusterIP,
			Ports: []corev1.ServicePort{{Port: 80}},
		},
	}
	epsNoPods := &corev1.Endpoints{
		ObjectMeta: metav1.ObjectMeta{Name: "no-pods", Namespace: "default"},
		Subsets:    nil,
	}

	// LoadBalancer service that is still being provisioned (no ingress).
	svcLBPending := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "lb-pending", Namespace: "default"},
		Spec: corev1.ServiceSpec{
			Type:  corev1.ServiceTypeLoadBalancer,
			Ports: []corev1.ServicePort{{Port: 80}},
		},
	}

	// LoadBalancer service that has an ingress IP assigned.
	svcLBReady := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "lb-ready", Namespace: "default"},
		Spec: corev1.ServiceSpec{
			Type:  corev1.ServiceTypeLoadBalancer,
			Ports: []corev1.ServicePort{{Port: 80}},
		},
		Status: corev1.ServiceStatus{
			LoadBalancer: corev1.LoadBalancerStatus{
				Ingress: []corev1.LoadBalancerIngress{{IP: "203.0.113.9"}},
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(
		svcWithEndpoints, epsForSvc,
		svcNoPods, epsNoPods,
		svcLBPending,
		svcLBReady,
	)
	m.clients["c1"] = fakeCS

	svcs, err := m.GetServices(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetServices failed: %v", err)
	}

	byName := map[string]Service{}
	for _, s := range svcs {
		byName[s.Name] = s
	}

	// Expected endpoint counts per the fix for #6150.
	const (
		expectedWithEpsCount = 3 // 2 + 1 addresses across two subsets
		expectedNoPodsCount  = 0
	)
	if got := byName["with-eps"].Endpoints; got != expectedWithEpsCount {
		t.Errorf("with-eps: expected %d endpoints, got %d", expectedWithEpsCount, got)
	}
	if got := byName["no-pods"].Endpoints; got != expectedNoPodsCount {
		t.Errorf("no-pods: expected %d endpoints, got %d", expectedNoPodsCount, got)
	}

	// Fix for #6153: LB without ingress = Provisioning, blank externalIP.
	if got := byName["lb-pending"].LBStatus; got != LBStatusProvisioning {
		t.Errorf("lb-pending: expected LBStatus %q, got %q", LBStatusProvisioning, got)
	}
	if got := byName["lb-pending"].ExternalIP; got != "" {
		t.Errorf("lb-pending: expected empty ExternalIP, got %q", got)
	}
	if got := byName["lb-ready"].LBStatus; got != LBStatusReady {
		t.Errorf("lb-ready: expected LBStatus %q, got %q", LBStatusReady, got)
	}
	if got := byName["lb-ready"].ExternalIP; got != "203.0.113.9" {
		t.Errorf("lb-ready: expected ExternalIP 203.0.113.9, got %q", got)
	}
}

// TestGetServices_PortDetailsAndSelector verifies issues #6163
// (port names surfaced via PortDetails) and #6164/#6166 (selector
// exposed so the frontend can detect orphaned / misconfigured services).

func TestGetServices_PortDetailsAndSelector(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	const (
		httpPort       = int32(80)
		metricsPort    = int32(9090)
		expectedSelKey = "app"
		expectedSelVal = "web"
	)

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "with-names", Namespace: "default"},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			Selector: map[string]string{expectedSelKey: expectedSelVal},
			Ports: []corev1.ServicePort{
				{Name: "http", Port: httpPort, Protocol: corev1.ProtocolTCP},
				{Name: "metrics", Port: metricsPort, Protocol: corev1.ProtocolTCP},
			},
		},
	}

	fakeCS := k8sfake.NewSimpleClientset(svc)
	m.clients["c1"] = fakeCS

	svcs, err := m.GetServices(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetServices failed: %v", err)
	}
	if len(svcs) != 1 {
		t.Fatalf("expected 1 service, got %d", len(svcs))
	}
	got := svcs[0]

	const expectedPortCount = 2
	if len(got.PortDetails) != expectedPortCount {
		t.Fatalf("expected %d port details, got %d", expectedPortCount, len(got.PortDetails))
	}
	if got.PortDetails[0].Name != "http" || got.PortDetails[0].Port != httpPort {
		t.Errorf("port[0]: expected http/%d, got %s/%d", httpPort, got.PortDetails[0].Name, got.PortDetails[0].Port)
	}
	if got.PortDetails[1].Name != "metrics" || got.PortDetails[1].Port != metricsPort {
		t.Errorf("port[1]: expected metrics/%d, got %s/%d", metricsPort, got.PortDetails[1].Name, got.PortDetails[1].Port)
	}
	if got.Selector[expectedSelKey] != expectedSelVal {
		t.Errorf("selector: expected %s=%s, got %v", expectedSelKey, expectedSelVal, got.Selector)
	}
}

func TestGetConfigMapsAndSecrets(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:        "cm1",
			Namespace:   "default",
			Labels:      map[string]string{"app": "demo"},
			Annotations: map[string]string{"owner": "team-a"},
		},
		Data:       map[string]string{"config.yaml": "value"},
		BinaryData: map[string][]byte{"cert.pem": []byte("abc")},
	}
	sec := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:        "sec1",
			Namespace:   "default",
			Labels:      map[string]string{"tier": "backend"},
			Annotations: map[string]string{"managed-by": "test"},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{"token": []byte("secret")},
	}

	fakeCS := k8sfake.NewSimpleClientset(cm, sec)
	m.clients["c1"] = fakeCS

	cms, err := m.GetConfigMaps(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetConfigMaps failed: %v", err)
	}
	if len(cms) != 1 {
		t.Fatalf("Expected 1 CM, got %d", len(cms))
	}
	if cms[0].Cluster != "c1" || cms[0].DataCount != 2 || cms[0].Labels["app"] != "demo" || cms[0].Annotations["owner"] != "team-a" {
		t.Fatalf("unexpected ConfigMap projection: %+v", cms[0])
	}

	secs, err := m.GetSecrets(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("GetSecrets failed: %v", err)
	}
	if len(secs) != 1 {
		t.Fatalf("Expected 1 Secret, got %d", len(secs))
	}
	if secs[0].Cluster != "c1" || secs[0].Type != string(corev1.SecretTypeOpaque) || secs[0].DataCount != 1 || secs[0].Labels["tier"] != "backend" || secs[0].Annotations["managed-by"] != "test" {
		t.Fatalf("unexpected Secret projection: %+v", secs[0])
	}
}

func TestGetConfigMapsAndSecrets_ReturnClientErrors(t *testing.T) {
	tests := []struct {
		name     string
		resource string
		call     func(*MultiClusterClient) error
	}{
		{
			name:     "configmaps list error",
			resource: "configmaps",
			call: func(m *MultiClusterClient) error {
				_, err := m.GetConfigMaps(context.Background(), "c1", "default")
				return err
			},
		},
		{
			name:     "secrets list error",
			resource: "secrets",
			call: func(m *MultiClusterClient) error {
				_, err := m.GetSecrets(context.Background(), "c1", "default")
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, _ := NewMultiClusterClient("")
			fakeCS := k8sfake.NewSimpleClientset()
			fakeCS.PrependReactor("list", tt.resource, func(action k8stesting.Action) (bool, k8sruntime.Object, error) {
				return true, nil, context.DeadlineExceeded
			})
			m.clients["c1"] = fakeCS

			if err := tt.call(m); err == nil {
				t.Fatalf("expected error when listing %s", tt.resource)
			}
		})
	}
}

func TestGetIngressesAndNetworkPolicies(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	ing := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{Name: "ing1", Namespace: "default"},
	}
	np := &networkingv1.NetworkPolicy{
		ObjectMeta: metav1.ObjectMeta{Name: "np1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(ing, np)
	m.clients["c1"] = fakeCS

	ings, _ := m.GetIngresses(context.Background(), "c1", "default")
	if len(ings) != 1 {
		t.Errorf("Expected 1 Ingress, got %d", len(ings))
	}

	nps, _ := m.GetNetworkPolicies(context.Background(), "c1", "default")
	if len(nps) != 1 {
		t.Errorf("Expected 1 NP, got %d", len(nps))
	}
}

func TestGetServiceAccounts(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{Name: "sa1", Namespace: "default"},
	}
	fakeCS := k8sfake.NewSimpleClientset(sa)
	m.clients["c1"] = fakeCS
	sas, _ := m.GetServiceAccounts(context.Background(), "c1", "default")
	if len(sas) != 1 {
		t.Errorf("Expected 1 SA, got %d", len(sas))
	}
}

func TestGetPVCsAndPVs(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: "pvc1", Namespace: "default"},
		Status:     corev1.PersistentVolumeClaimStatus{Phase: corev1.ClaimBound},
	}
	pv := &corev1.PersistentVolume{
		ObjectMeta: metav1.ObjectMeta{Name: "pv1"},
		Status:     corev1.PersistentVolumeStatus{Phase: corev1.VolumeBound},
	}

	fakeCS := k8sfake.NewSimpleClientset(pvc, pv)
	m.clients["c1"] = fakeCS

	pvcs, _ := m.GetPVCs(context.Background(), "c1", "default")
	if len(pvcs) != 1 {
		t.Errorf("Expected 1 PVC, got %d", len(pvcs))
	}

	pvs, _ := m.GetPVs(context.Background(), "c1")
	if len(pvs) != 1 {
		t.Errorf("Expected 1 PV, got %d", len(pvs))
	}
}

func TestGetResourceQuotasAndLimitRanges(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	rq := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{Name: "rq1", Namespace: "default"},
	}
	lr := &corev1.LimitRange{
		ObjectMeta: metav1.ObjectMeta{Name: "lr1", Namespace: "default"},
	}

	fakeCS := k8sfake.NewSimpleClientset(rq, lr)
	m.clients["c1"] = fakeCS

	rqs, _ := m.GetResourceQuotas(context.Background(), "c1", "default")
	if len(rqs) != 1 {
		t.Errorf("Expected 1 RQ, got %d", len(rqs))
	}

	lrs, _ := m.GetLimitRanges(context.Background(), "c1", "default")
	if len(lrs) != 1 {
		t.Errorf("Expected 1 LR, got %d", len(lrs))
	}
}

func TestCreateOrUpdateResourceQuota(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	fakeCS := k8sfake.NewSimpleClientset()
	m.clients["c1"] = fakeCS

	spec := ResourceQuotaSpec{
		Name:      "rq1",
		Namespace: "default",
		Hard:      map[string]string{"cpu": "1"},
	}

	rq, err := m.CreateOrUpdateResourceQuota(context.Background(), "c1", spec)
	if err != nil {
		t.Fatalf("CreateOrUpdateResourceQuota (create) failed: %v", err)
	}
	if rq.Name != "rq1" {
		t.Errorf("Expected rq1, got %s", rq.Name)
	}

	// Test update
	spec.Hard["cpu"] = "2"
	rq, err = m.CreateOrUpdateResourceQuota(context.Background(), "c1", spec)
	if err != nil {
		t.Fatalf("CreateOrUpdateResourceQuota (update) failed: %v", err)
	}
	// In the update path, the code uses updated.Status.Hard, which might be empty in fake client
	// But the function should complete without error
}
