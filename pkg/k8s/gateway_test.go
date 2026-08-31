package k8s

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestListGateways(t *testing.T) {
	now := metav1.Now()
	validGateway := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "gateway.networking.k8s.io/v1",
			"kind":       "Gateway",
			"metadata": map[string]interface{}{
				"name":              "gw1",
				"namespace":         "default",
				"creationTimestamp": now.Time.Format(time.RFC3339),
			},
			"spec": map[string]interface{}{
				"gatewayClassName": "cls1",
				"listeners": []interface{}{
					map[string]interface{}{
						"name":     "http",
						"protocol": "HTTP",
						"port":     int64(80),
						"hostname": "*.example.com",
					},
				},
			},
			"status": map[string]interface{}{
				"addresses": []interface{}{
					map[string]interface{}{"value": "1.2.3.4"},
				},
				"conditions": []interface{}{
					map[string]interface{}{
						"type":   "Programmed",
						"status": "True",
					},
				},
			},
		},
	}

	tests := []struct {
		name          string
		contextName   string
		setupClient   func(*testing.T, dynamic.Interface)
		expectedCount int
		validate      func(*testing.T, []v1alpha1.Gateway)
	}{
		{
			name:        "Valid Gateway",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
					// fmt.Printf("Reactor: resource=%s\n", action.GetResource().Resource)
					if action.GetResource().Resource != "gateways" {
						return false, nil, nil
					}
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{"kind": "GatewayList", "apiVersion": "gateway.networking.k8s.io/v1"},
						Items:  []unstructured.Unstructured{*validGateway},
					}, nil
				})
			},
			expectedCount: 1,
			validate: func(t *testing.T, gws []v1alpha1.Gateway) {
				gw := gws[0]
				if gw.Name != "gw1" {
					t.Errorf("Expected gw1, got %s", gw.Name)
				}
				if gw.GatewayClass != "cls1" {
					t.Errorf("Expected cls1, got %s", gw.GatewayClass)
				}
				if len(gw.Listeners) != 1 || gw.Listeners[0].Port != 80 {
					t.Errorf("Unexpected listeners: %+v", gw.Listeners)
				}
				if len(gw.Addresses) != 1 || gw.Addresses[0] != "1.2.3.4" {
					t.Errorf("Unexpected addresses: %+v", gw.Addresses)
				}
				if gw.Status != "Programmed" {
					t.Errorf("Expected Programmed status, got %s", gw.Status)
				}
			},
		},
		{
			name:        "Empty List",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
					if action.GetResource().Resource != "gateways" {
						return false, nil, nil
					}
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{"kind": "GatewayList", "apiVersion": "gateway.networking.k8s.io/v1"},
						Items:  []unstructured.Unstructured{},
					}, nil
				})
			},
			expectedCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, _ := NewMultiClusterClient("")
			m.rawConfig = &api.Config{Contexts: map[string]*api.Context{tt.contextName: {Cluster: "cluster1"}}}

			scheme := runtime.NewScheme()
			gvr := schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"}
			fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, map[schema.GroupVersionResource]string{
				gvr: "GatewayList",
			})
			tt.setupClient(t, fakeDyn)
			m.dynamicClients[tt.contextName] = fakeDyn

			// We need to inject dummy typed client to make ListGateways iterate over this cluster
			m.clients[tt.contextName] = k8sfake.NewSimpleClientset()

			gws, err := m.ListGateways(context.Background())
			if err != nil {
				t.Fatalf("ListGateways failed: %v", err)
			}

			if gws.TotalCount != tt.expectedCount {
				t.Errorf("Expected %d gateways, got %d", tt.expectedCount, gws.TotalCount)
			}
			if tt.validate != nil && gws.TotalCount > 0 {
				tt.validate(t, gws.Items)
			}
		})
	}
}

func TestListHTTPRoutes(t *testing.T) {
	now := metav1.Now()
	validRoute := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "gateway.networking.k8s.io/v1",
			"kind":       "HTTPRoute",
			"metadata": map[string]interface{}{
				"name":              "route1",
				"namespace":         "default",
				"creationTimestamp": now.Time.Format(time.RFC3339),
			},
			"spec": map[string]interface{}{
				"hostnames": []interface{}{"example.com"},
				"parentRefs": []interface{}{
					map[string]interface{}{
						"kind": "Gateway",
						"name": "gw1",
					},
				},
			},
			"status": map[string]interface{}{
				"parents": []interface{}{
					map[string]interface{}{
						"conditions": []interface{}{
							map[string]interface{}{
								"type":   "Accepted",
								"status": "True",
							},
						},
					},
				},
			},
		},
	}

	tests := []struct {
		name          string
		contextName   string
		setupClient   func(*testing.T, dynamic.Interface)
		expectedCount int
		validate      func(*testing.T, []v1alpha1.HTTPRoute)
	}{
		{
			name:        "Valid HTTPRoute",
			contextName: "c1",
			setupClient: func(t *testing.T, c dynamic.Interface) {
				fakeC := c.(*dynamicfake.FakeDynamicClient)
				fakeC.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
					if action.GetResource().Resource != "httproutes" {
						return false, nil, nil
					}
					return true, &unstructured.UnstructuredList{
						Object: map[string]interface{}{"kind": "HTTPRouteList", "apiVersion": "gateway.networking.k8s.io/v1"},
						Items:  []unstructured.Unstructured{*validRoute},
					}, nil
				})
			},
			expectedCount: 1,
			validate: func(t *testing.T, routes []v1alpha1.HTTPRoute) {
				r := routes[0]
				if r.Name != "route1" {
					t.Errorf("Expected route1, got %s", r.Name)
				}
				if len(r.Hostnames) != 1 || r.Hostnames[0] != "example.com" {
					t.Errorf("Unexpected hostnames: %+v", r.Hostnames)
				}
				if r.Status != "Accepted" {
					t.Errorf("Expected Accepted status, got %s", r.Status)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, _ := NewMultiClusterClient("")
			m.rawConfig = &api.Config{Contexts: map[string]*api.Context{tt.contextName: {Cluster: "cluster1"}}}

			scheme := runtime.NewScheme()
			gvr := schema.GroupVersionResource{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "httproutes"}
			fakeDyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, map[schema.GroupVersionResource]string{
				gvr: "HTTPRouteList",
			})
			tt.setupClient(t, fakeDyn)
			m.dynamicClients[tt.contextName] = fakeDyn
			m.clients[tt.contextName] = k8sfake.NewSimpleClientset()

			routes, err := m.ListHTTPRoutes(context.Background())
			if err != nil {
				t.Fatalf("ListHTTPRoutes failed: %v", err)
			}

			if routes.TotalCount != tt.expectedCount {
				t.Errorf("Expected %d routes, got %d", tt.expectedCount, routes.TotalCount)
			}
			if tt.validate != nil && routes.TotalCount > 0 {
				tt.validate(t, routes.Items)
			}
		})
	}
}

func TestDetermineGatewayStatus(t *testing.T) {
	tests := []struct {
		name       string
		conditions []v1alpha1.Condition
		want       v1alpha1.GatewayStatus
	}{
		{
			"Programmed",
			[]v1alpha1.Condition{{Type: "Programmed", Status: "True"}},
			v1alpha1.GatewayStatusProgrammed,
		},
		{
			"Accepted only",
			[]v1alpha1.Condition{{Type: "Accepted", Status: "True"}},
			v1alpha1.GatewayStatusAccepted,
		},
		{
			"Not accepted",
			[]v1alpha1.Condition{{Type: "Accepted", Status: "False"}},
			v1alpha1.GatewayStatusNotAccepted,
		},
		{
			"Empty = Pending",
			[]v1alpha1.Condition{},
			v1alpha1.GatewayStatusPending,
		},
		{
			"Non-matching conditions = Unknown",
			[]v1alpha1.Condition{{Type: "Ready", Status: "True"}},
			v1alpha1.GatewayStatusUnknown,
		},
		{
			"Programmed takes precedence over Accepted",
			[]v1alpha1.Condition{
				{Type: "Accepted", Status: "True"},
				{Type: "Programmed", Status: "True"},
			},
			v1alpha1.GatewayStatusProgrammed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := determineGatewayStatus(tt.conditions); got != tt.want {
				t.Errorf("determineGatewayStatus() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDetermineHTTPRouteStatus(t *testing.T) {
	tests := []struct {
		name       string
		conditions []v1alpha1.Condition
		want       v1alpha1.HTTPRouteStatus
	}{
		{
			"All accepted",
			[]v1alpha1.Condition{
				{Type: "Accepted", Status: "True"},
				{Type: "Accepted", Status: "True"},
			},
			v1alpha1.HTTPRouteStatusAccepted,
		},
		{
			"Partially accepted",
			[]v1alpha1.Condition{
				{Type: "Accepted", Status: "True"},
				{Type: "Accepted", Status: "False"},
			},
			v1alpha1.HTTPRouteStatusPartiallyValid,
		},
		{
			"None accepted",
			[]v1alpha1.Condition{
				{Type: "Accepted", Status: "False"},
			},
			v1alpha1.HTTPRouteStatusNotAccepted,
		},
		{
			"No Accepted conditions = Unknown",
			[]v1alpha1.Condition{
				{Type: "Resolved", Status: "True"},
			},
			v1alpha1.HTTPRouteStatusUnknown,
		},
		{
			"Empty = Unknown",
			[]v1alpha1.Condition{},
			v1alpha1.HTTPRouteStatusUnknown,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := determineHTTPRouteStatus(tt.conditions); got != tt.want {
				t.Errorf("determineHTTPRouteStatus() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParseGatewaysFromList_NonUnstructuredList(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Pass nil to trigger the fallback branch
	result, err := m.parseGatewaysFromList(nil, "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected 0 gateways for nil input, got %d", len(result))
	}
}

func TestParseHTTPRoutesFromList_NonUnstructuredList(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	result, err := m.parseHTTPRoutesFromList(nil, "c1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected 0 routes for nil input, got %d", len(result))
	}
}

// TestIsGatewayCRDNotInstalled locks down the classifier at the top of
// gateway.go that decides whether a per-cluster error is a benign
// "Gateway API CRDs are not installed here" signal (empty-list success)
// or a real failure (auth/network/RBAC) that must be surfaced to the
// caller. Prior to this test the helper was only exercised indirectly
// via ListGateways / ListHTTPRoutesForCluster happy paths, leaving the
// four classification arms (nil, IsNotFound, "no matches for",
// "server could not find") uncovered and vulnerable to a silent
// misclassification — the exact regression pattern of #6510 in mcs.go.
//
// Structured as a table so a future arm addition needs only one row.
func TestIsGatewayCRDNotInstalled(t *testing.T) {
	gvr := schema.GroupVersionResource{
		Group:    "gateway.networking.k8s.io",
		Version:  "v1",
		Resource: "gateways",
	}
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "nil error is not a missing CRD",
			err:  nil,
			want: false,
		},
		{
			// The current helper broadly accepts IsNotFound (unlike
			// mcs.go which specifically excludes object-level NotFounds).
			// Lock the current shape down — if a future refactor
			// tightens this to type-only NotFound (matching MCS's
			// behavior for #6510), this test must be updated in the
			// same commit, not silently drift.
			name: "IsNotFound (any 404) is treated as missing CRD",
			err:  apierrors.NewNotFound(gvr.GroupResource(), "gw-1"),
			want: true,
		},
		{
			name: "server-side RESTMapper 'no matches for' message → missing CRD",
			err:  errors.New("no matches for kind \"Gateway\" in version \"gateway.networking.k8s.io/v1\""),
			want: true,
		},
		{
			name: "server discovery 'the server could not find the requested resource' → missing CRD",
			err:  errors.New("the server could not find the requested resource"),
			want: true,
		},
		{
			// Case-insensitive matching: the helper lowercases the
			// message before substring checks, so mixed-case surface
			// text from a proxy/wrapper must still classify correctly.
			name: "uppercase 'No Matches For' still classifies as missing CRD (case-insensitive)",
			err:  errors.New("No Matches For kind Gateway"),
			want: true,
		},
		{
			name: "generic auth failure must NOT be classified as missing CRD (#6510)",
			err:  errors.New("401 Unauthorized"),
			want: false,
		},
		{
			name: "generic network dial failure must NOT be classified as missing CRD (#6510)",
			err:  errors.New("dial tcp 10.0.0.1:6443: connect: connection refused"),
			want: false,
		},
		{
			name: "RBAC forbidden must NOT be classified as missing CRD",
			err:  errors.New("gateways.gateway.networking.k8s.io is forbidden: user cannot list resource"),
			want: false,
		},
		{
			name: "unrelated internal server error is not a missing CRD",
			err:  errors.New("etcdserver: request timed out"),
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isGatewayCRDNotInstalled(tt.err); got != tt.want {
				t.Errorf("isGatewayCRDNotInstalled(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}
