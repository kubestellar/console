// Package kagent provides HTTP handlers for kagent.dev and kagenti CRD
// listing endpoints. It is extracted from the monolithic pkg/agent package
// to reduce file count and improve testability (#17124).
package kagent

import (
	"time"

	"github.com/kubestellar/console/pkg/agent/httputil"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// DynamicClientGetter abstracts the ability to obtain a dynamic Kubernetes
// client for a given cluster context. This is the only dependency on the
// broader k8s client system.
type DynamicClientGetter interface {
	GetDynamicClient(contextName string) (dynamic.Interface, error)
}

// Handlers provides HTTP handlers for KAgent CRD listing endpoints.
type Handlers struct {
	Ctx    httputil.HandlerContext
	Client DynamicClientGetter // nil means no cluster access
}

// --- Constants ---

const (
	crdTimeout        = 30 * time.Second
	crdPerCallTimeout = 15 * time.Second
)

// --- GVR definitions (kagent.dev) ---

var (
	AgentGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha2", Resource: "agents",
	}
	ModelConfigGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha2", Resource: "modelconfigs",
	}
	ModelProviderConfigGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha2", Resource: "modelproviderconfigs",
	}
	ToolServerGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha1", Resource: "toolservers",
	}
	RemoteMCPServerGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha1", Resource: "remotemcpservers",
	}
	MemoryGVR = schema.GroupVersionResource{
		Group: "kagent.dev", Version: "v1alpha1", Resource: "memories",
	}
)

// --- GVR definitions (kagenti) ---

var (
	KagentiAgentGVR = schema.GroupVersionResource{
		Group: "agent.kagenti.dev", Version: "v1alpha1", Resource: "agents",
	}
	KagentiBuildGVR = schema.GroupVersionResource{
		Group: "agent.kagenti.dev", Version: "v1alpha1", Resource: "agentbuilds",
	}
	KagentiCardGVR = schema.GroupVersionResource{
		Group: "agent.kagenti.dev", Version: "v1alpha1", Resource: "agentcards",
	}
	KagentiToolGVR = schema.GroupVersionResource{
		Group: "mcp.kagenti.com", Version: "v1alpha1", Resource: "mcpservers",
	}
)

// --- Response types (kagent CRDs) ---

type CRDAgent struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Cluster        string `json:"cluster"`
	AgentType      string `json:"agentType"`
	Runtime        string `json:"runtime"`
	Status         string `json:"status"`
	ModelConfigRef string `json:"modelConfigRef"`
	ToolCount      int    `json:"toolCount"`
}

type CRDTool struct {
	Name            string           `json:"name"`
	Namespace       string           `json:"namespace"`
	Cluster         string           `json:"cluster"`
	Kind            string           `json:"kind"`
	URL             string           `json:"url"`
	Config          string           `json:"config"`
	DiscoveredTools []DiscoveredTool `json:"discoveredTools"`
}

type DiscoveredTool struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CRDModel struct {
	Name             string            `json:"name"`
	Namespace        string            `json:"namespace"`
	Cluster          string            `json:"cluster"`
	Kind             string            `json:"kind"`
	Provider         string            `json:"provider"`
	Model            string            `json:"model"`
	DiscoveredModels []DiscoveredModel `json:"discoveredModels,omitempty"`
}

type DiscoveredModel struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CRDMemory struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster"`
	Provider  string `json:"provider"`
}

// --- Response types (kagenti) ---

type Agent struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Status        string `json:"status"`
	Replicas      int64  `json:"replicas"`
	ReadyReplicas int64  `json:"readyReplicas"`
	Framework     string `json:"framework"`
	Protocol      string `json:"protocol"`
	Image         string `json:"image"`
	CreatedAt     string `json:"createdAt"`
}

type Build struct {
	Name           string `json:"name"`
	Namespace      string `json:"namespace"`
	Status         string `json:"status"`
	Source         string `json:"source"`
	Pipeline       string `json:"pipeline"`
	Mode           string `json:"mode"`
	StartTime      string `json:"startTime"`
	CompletionTime string `json:"completionTime"`
}

type Card struct {
	Name            string   `json:"name"`
	Namespace       string   `json:"namespace"`
	AgentName       string   `json:"agentName"`
	Skills          []string `json:"skills"`
	Capabilities    []string `json:"capabilities"`
	SyncPeriod      string   `json:"syncPeriod"`
	IdentityBinding string   `json:"identityBinding"`
}

type Tool struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	ToolPrefix    string `json:"toolPrefix"`
	TargetRef     string `json:"targetRef"`
	HasCredential bool   `json:"hasCredential"`
}
