package v1alpha1

import (
	"encoding/json"
	"testing"
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestGatewayGVRs(t *testing.T) {
	tests := []struct {
		name     string
		gvr      schema.GroupVersionResource
		expGroup string
		expVer   string
		expRes   string
	}{
		{
			name:     "GatewayGVR",
			gvr:      GatewayGVR,
			expGroup: "gateway.networking.k8s.io",
			expVer:   "v1",
			expRes:   "gateways",
		},
		{
			name:     "GatewayGVRv1beta1",
			gvr:      GatewayGVRv1beta1,
			expGroup: "gateway.networking.k8s.io",
			expVer:   "v1beta1",
			expRes:   "gateways",
		},
		{
			name:     "HTTPRouteGVR",
			gvr:      HTTPRouteGVR,
			expGroup: "gateway.networking.k8s.io",
			expVer:   "v1",
			expRes:   "httproutes",
		},
		{
			name:     "HTTPRouteGVRv1beta1",
			gvr:      HTTPRouteGVRv1beta1,
			expGroup: "gateway.networking.k8s.io",
			expVer:   "v1beta1",
			expRes:   "httproutes",
		},
		{
			name:     "GRPCRouteGVR",
			gvr:      GRPCRouteGVR,
			expGroup: "gateway.networking.k8s.io",
			expVer:   "v1",
			expRes:   "grpcroutes",
		},
		{
			name:     "GatewayClassGVR",
			gvr:      GatewayClassGVR,
			expGroup: "gateway.networking.k8s.io",
			expVer:   "v1",
			expRes:   "gatewayclasses",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.gvr.Group != tc.expGroup {
				t.Errorf("Group = %q, want %q", tc.gvr.Group, tc.expGroup)
			}
			if tc.gvr.Version != tc.expVer {
				t.Errorf("Version = %q, want %q", tc.gvr.Version, tc.expVer)
			}
			if tc.gvr.Resource != tc.expRes {
				t.Errorf("Resource = %q, want %q", tc.gvr.Resource, tc.expRes)
			}
		})
	}
}

func TestGatewayStatusConstants(t *testing.T) {
	tests := []struct {
		name   string
		status GatewayStatus
		want   string
	}{
		{"Accepted", GatewayStatusAccepted, "Accepted"},
		{"Programmed", GatewayStatusProgrammed, "Programmed"},
		{"Pending", GatewayStatusPending, "Pending"},
		{"NotAccepted", GatewayStatusNotAccepted, "NotAccepted"},
		{"Unknown", GatewayStatusUnknown, "Unknown"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.status) != tc.want {
				t.Errorf("status = %q, want %q", tc.status, tc.want)
			}
		})
	}
}

func TestHTTPRouteStatusConstants(t *testing.T) {
	tests := []struct {
		name   string
		status HTTPRouteStatus
		want   string
	}{
		{"Accepted", HTTPRouteStatusAccepted, "Accepted"},
		{"PartiallyValid", HTTPRouteStatusPartiallyValid, "PartiallyValid"},
		{"NotAccepted", HTTPRouteStatusNotAccepted, "NotAccepted"},
		{"Unknown", HTTPRouteStatusUnknown, "Unknown"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if string(tc.status) != tc.want {
				t.Errorf("status = %q, want %q", tc.status, tc.want)
			}
		})
	}
}

func TestGatewayJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := Gateway{
		Name:         "test-gateway",
		Namespace:    "default",
		Cluster:      "cluster-1",
		GatewayClass: "istio",
		Status:       GatewayStatusProgrammed,
		Addresses:    []string{"10.0.0.1", "10.0.0.2"},
		Listeners: []Listener{
			{
				Name:           "http",
				Protocol:       "HTTP",
				Port:           80,
				Hostname:       "example.com",
				AttachedRoutes: 5,
			},
		},
		AttachedRoutes: 10,
		CreatedAt:      now,
		Conditions: []Condition{
			{
				Type:   "Ready",
				Status: "True",
				Reason: "Programmed",
			},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded Gateway
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Status != original.Status {
		t.Errorf("Status = %q, want %q", decoded.Status, original.Status)
	}
	if decoded.AttachedRoutes != original.AttachedRoutes {
		t.Errorf("AttachedRoutes = %d, want %d", decoded.AttachedRoutes, original.AttachedRoutes)
	}
	if len(decoded.Listeners) != len(original.Listeners) {
		t.Errorf("Listeners length = %d, want %d", len(decoded.Listeners), len(original.Listeners))
	}
}

func TestHTTPRouteJSONRoundTrip(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	original := HTTPRoute{
		Name:      "test-route",
		Namespace: "default",
		Cluster:   "cluster-1",
		Hostnames: []string{"api.example.com", "www.example.com"},
		ParentRefs: []RouteParent{
			{
				Kind:      "Gateway",
				Name:      "main-gateway",
				Namespace: "default",
			},
		},
		Rules: []HTTPRouteRule{
			{
				Matches: []HTTPRouteMatch{
					{
						Path:   "/api/v1",
						Method: "GET",
						Headers: map[string]string{
							"X-API-Key": "present",
						},
					},
				},
				BackendRefs: []BackendRef{
					{
						Kind:   "Service",
						Name:   "api-service",
						Port:   8080,
						Weight: 100,
					},
				},
			},
		},
		Status:    HTTPRouteStatusAccepted,
		CreatedAt: now,
		Conditions: []Condition{
			{
				Type:   "Accepted",
				Status: "True",
			},
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded HTTPRoute
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.Status != original.Status {
		t.Errorf("Status = %q, want %q", decoded.Status, original.Status)
	}
	if len(decoded.Hostnames) != len(original.Hostnames) {
		t.Errorf("Hostnames length = %d, want %d", len(decoded.Hostnames), len(original.Hostnames))
	}
	if len(decoded.Rules) != len(original.Rules) {
		t.Errorf("Rules length = %d, want %d", len(decoded.Rules), len(original.Rules))
	}
}

func TestGatewayClassJSONRoundTrip(t *testing.T) {
	original := GatewayClass{
		Name:           "istio",
		Cluster:        "cluster-1",
		ControllerName: "istio.io/gateway-controller",
		Description:    "Istio gateway class",
		Accepted:       true,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded GatewayClass
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Name != original.Name {
		t.Errorf("Name = %q, want %q", decoded.Name, original.Name)
	}
	if decoded.ControllerName != original.ControllerName {
		t.Errorf("ControllerName = %q, want %q", decoded.ControllerName, original.ControllerName)
	}
	if decoded.Accepted != original.Accepted {
		t.Errorf("Accepted = %v, want %v", decoded.Accepted, original.Accepted)
	}
}

func TestGatewayListJSONRoundTrip(t *testing.T) {
	original := GatewayList{
		Items: []Gateway{
			{Name: "gw-1", Namespace: "default", Status: GatewayStatusProgrammed},
			{Name: "gw-2", Namespace: "kube-system", Status: GatewayStatusPending},
		},
		TotalCount: 2,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded GatewayList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
}

func TestHTTPRouteListJSONRoundTrip(t *testing.T) {
	original := HTTPRouteList{
		Items: []HTTPRoute{
			{Name: "route-1", Namespace: "default", Status: HTTPRouteStatusAccepted},
			{Name: "route-2", Namespace: "default", Status: HTTPRouteStatusPartiallyValid},
		},
		TotalCount: 2,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded HTTPRouteList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
}

func TestGatewayClassListJSONRoundTrip(t *testing.T) {
	original := GatewayClassList{
		Items: []GatewayClass{
			{Name: "istio", ControllerName: "istio.io/controller", Accepted: true},
			{Name: "nginx", ControllerName: "nginx.org/controller", Accepted: false},
		},
		TotalCount: 2,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded GatewayClassList
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.TotalCount != original.TotalCount {
		t.Errorf("TotalCount = %d, want %d", decoded.TotalCount, original.TotalCount)
	}
	if len(decoded.Items) != len(original.Items) {
		t.Errorf("Items length = %d, want %d", len(decoded.Items), len(original.Items))
	}
}

func TestClusterGatewaySummaryJSONRoundTrip(t *testing.T) {
	original := ClusterGatewaySummary{
		Cluster:         "cluster-1",
		GatewayCount:    5,
		HTTPRouteCount:  10,
		GRPCRouteCount:  3,
		ProgrammedCount: 4,
		PendingCount:    1,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded ClusterGatewaySummary
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Cluster != original.Cluster {
		t.Errorf("Cluster = %q, want %q", decoded.Cluster, original.Cluster)
	}
	if decoded.GatewayCount != original.GatewayCount {
		t.Errorf("GatewayCount = %d, want %d", decoded.GatewayCount, original.GatewayCount)
	}
	if decoded.HTTPRouteCount != original.HTTPRouteCount {
		t.Errorf("HTTPRouteCount = %d, want %d", decoded.HTTPRouteCount, original.HTTPRouteCount)
	}
}

func TestListenerZeroValues(t *testing.T) {
	var l Listener
	if l.Name != "" {
		t.Errorf("zero Listener.Name = %q, want empty string", l.Name)
	}
	if l.Port != 0 {
		t.Errorf("zero Listener.Port = %d, want 0", l.Port)
	}
	if l.AttachedRoutes != 0 {
		t.Errorf("zero Listener.AttachedRoutes = %d, want 0", l.AttachedRoutes)
	}
}

func TestBackendRefJSONRoundTrip(t *testing.T) {
	original := BackendRef{
		Kind:      "Service",
		Name:      "backend-svc",
		Namespace: "default",
		Port:      8080,
		Weight:    50,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var decoded BackendRef
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	if decoded.Kind != original.Kind {
		t.Errorf("Kind = %q, want %q", decoded.Kind, original.Kind)
	}
	if decoded.Port != original.Port {
		t.Errorf("Port = %d, want %d", decoded.Port, original.Port)
	}
	if decoded.Weight != original.Weight {
		t.Errorf("Weight = %d, want %d", decoded.Weight, original.Weight)
	}
}
