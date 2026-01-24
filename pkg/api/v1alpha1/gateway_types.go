// Package v1alpha1 contains API type definitions for KubeStellar Console CRDs
package v1alpha1

import (
	"time"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Gateway API Group Version Resources
var (
	// GatewayGVR is the GroupVersionResource for Gateway API Gateway (v1)
	GatewayGVR = schema.GroupVersionResource{
		Group:    "gateway.networking.k8s.io",
		Version:  "v1",
		Resource: "gateways",
	}

	// GatewayGVRv1beta1 is the GroupVersionResource for Gateway API Gateway (v1beta1 fallback)
	GatewayGVRv1beta1 = schema.GroupVersionResource{
		Group:    "gateway.networking.k8s.io",
		Version:  "v1beta1",
		Resource: "gateways",
	}

	// HTTPRouteGVR is the GroupVersionResource for Gateway API HTTPRoute (v1)
	HTTPRouteGVR = schema.GroupVersionResource{
		Group:    "gateway.networking.k8s.io",
		Version:  "v1",
		Resource: "httproutes",
	}

	// HTTPRouteGVRv1beta1 is the GroupVersionResource for Gateway API HTTPRoute (v1beta1 fallback)
	HTTPRouteGVRv1beta1 = schema.GroupVersionResource{
		Group:    "gateway.networking.k8s.io",
		Version:  "v1beta1",
		Resource: "httproutes",
	}

	// GRPCRouteGVR is the GroupVersionResource for Gateway API GRPCRoute
	GRPCRouteGVR = schema.GroupVersionResource{
		Group:    "gateway.networking.k8s.io",
		Version:  "v1",
		Resource: "grpcroutes",
	}

	// GatewayClassGVR is the GroupVersionResource for Gateway API GatewayClass
	GatewayClassGVR = schema.GroupVersionResource{
		Group:    "gateway.networking.k8s.io",
		Version:  "v1",
		Resource: "gatewayclasses",
	}
)

// GatewayStatus represents the status of a Gateway
type GatewayStatus string

const (
	GatewayStatusAccepted    GatewayStatus = "Accepted"
	GatewayStatusProgrammed  GatewayStatus = "Programmed"
	GatewayStatusPending     GatewayStatus = "Pending"
	GatewayStatusNotAccepted GatewayStatus = "NotAccepted"
	GatewayStatusUnknown     GatewayStatus = "Unknown"
)

// Gateway represents a Kubernetes Gateway API Gateway resource
type Gateway struct {
	Name           string        `json:"name"`
	Namespace      string        `json:"namespace"`
	Cluster        string        `json:"cluster"`
	GatewayClass   string        `json:"gatewayClass"`
	Status         GatewayStatus `json:"status"`
	Addresses      []string      `json:"addresses,omitempty"`
	Listeners      []Listener    `json:"listeners,omitempty"`
	AttachedRoutes int           `json:"attachedRoutes"`
	CreatedAt      time.Time     `json:"createdAt"`
	Conditions     []Condition   `json:"conditions,omitempty"`
}

// Listener represents a Gateway listener
type Listener struct {
	Name           string `json:"name"`
	Protocol       string `json:"protocol"`
	Port           int32  `json:"port"`
	Hostname       string `json:"hostname,omitempty"`
	AttachedRoutes int    `json:"attachedRoutes"`
}

// HTTPRouteStatus represents the status of an HTTPRoute
type HTTPRouteStatus string

const (
	HTTPRouteStatusAccepted       HTTPRouteStatus = "Accepted"
	HTTPRouteStatusPartiallyValid HTTPRouteStatus = "PartiallyValid"
	HTTPRouteStatusNotAccepted    HTTPRouteStatus = "NotAccepted"
	HTTPRouteStatusUnknown        HTTPRouteStatus = "Unknown"
)

// HTTPRoute represents a Kubernetes Gateway API HTTPRoute resource
type HTTPRoute struct {
	Name         string          `json:"name"`
	Namespace    string          `json:"namespace"`
	Cluster      string          `json:"cluster"`
	Hostnames    []string        `json:"hostnames,omitempty"`
	ParentRefs   []RouteParent   `json:"parentRefs,omitempty"`
	Rules        []HTTPRouteRule `json:"rules,omitempty"`
	Status       HTTPRouteStatus `json:"status"`
	CreatedAt    time.Time       `json:"createdAt"`
	Conditions   []Condition     `json:"conditions,omitempty"`
}

// RouteParent represents a parent reference for a route
type RouteParent struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

// HTTPRouteRule represents a rule in an HTTPRoute
type HTTPRouteRule struct {
	Matches        []HTTPRouteMatch  `json:"matches,omitempty"`
	BackendRefs    []BackendRef      `json:"backendRefs,omitempty"`
}

// HTTPRouteMatch represents a match condition in an HTTPRoute rule
type HTTPRouteMatch struct {
	Path    string            `json:"path,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	Method  string            `json:"method,omitempty"`
}

// BackendRef represents a backend reference in a route
type BackendRef struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	Port      int32  `json:"port,omitempty"`
	Weight    int32  `json:"weight,omitempty"`
}

// GatewayClass represents a GatewayClass resource
type GatewayClass struct {
	Name           string   `json:"name"`
	Cluster        string   `json:"cluster"`
	ControllerName string   `json:"controllerName"`
	Description    string   `json:"description,omitempty"`
	Accepted       bool     `json:"accepted"`
}

// GatewayList is a list of Gateways
type GatewayList struct {
	Items      []Gateway `json:"items"`
	TotalCount int       `json:"totalCount"`
}

// HTTPRouteList is a list of HTTPRoutes
type HTTPRouteList struct {
	Items      []HTTPRoute `json:"items"`
	TotalCount int         `json:"totalCount"`
}

// GatewayClassList is a list of GatewayClasses
type GatewayClassList struct {
	Items      []GatewayClass `json:"items"`
	TotalCount int            `json:"totalCount"`
}

// ClusterGatewaySummary provides a per-cluster summary of Gateway API resources
type ClusterGatewaySummary struct {
	Cluster         string `json:"cluster"`
	GatewayCount    int    `json:"gatewayCount"`
	HTTPRouteCount  int    `json:"httpRouteCount"`
	GRPCRouteCount  int    `json:"grpcRouteCount"`
	ProgrammedCount int    `json:"programmedCount"`
	PendingCount    int    `json:"pendingCount"`
}
