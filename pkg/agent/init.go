package agent

import (
	"github.com/kubestellar/console/pkg/agent/kube"
	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/mcp"
)

func init() {
	// Wire up the ai package function pointers to agent implementations
	ai.GetRegistry = func() ai.Registry {
		return GetRegistry()
	}
	ai.InitializeProviders = InitializeProviders
	ai.SetClusterContextProviders = func(bridge interface{}, k8sClient interface{}) {
		// Type assert back to concrete types
		var b *mcp.Bridge
		if bridge != nil {
			b = bridge.(*mcp.Bridge)
		}
		var k *k8s.MultiClusterClient
		if k8sClient != nil {
			k = k8sClient.(*k8s.MultiClusterClient)
		}
		kube.SetClusterContextProviders(b, k)
	}
	ai.GetConfigManager = func() interface{} {
		return GetConfigManager()
	}
}
