package handlers

import "github.com/kubestellar/console/pkg/api/handlers/proxy"

// Aliases keep route registration and existing call sites working after the
// upstream-provider proxy handlers moved into their own
// pkg/api/handlers/proxy subpackage (epic #23685 phase 1). New code should
// import pkg/api/handlers/proxy directly.

// Type aliases for the proxy handler structs.
type (
	CardProxyHandler            = proxy.CardProxyHandler
	QuantumProxyHandler         = proxy.QuantumProxyHandler
	KagentProxyHandler          = proxy.KagentProxyHandler
	KagentiProviderProxyHandler = proxy.KagentiProviderProxyHandler
	KubaraCatalogHandler        = proxy.KubaraCatalogHandler
)

// Constructors delegate to the proxy subpackage.
var (
	NewCardProxyHandler            = proxy.NewCardProxyHandler
	NewQuantumProxyHandler         = proxy.NewQuantumProxyHandler
	NewKagentProxyHandler          = proxy.NewKagentProxyHandler
	NewKagentiProviderProxyHandler = proxy.NewKagentiProviderProxyHandler
	NewKubaraCatalogHandler        = proxy.NewKubaraCatalogHandler
)

// Package-level fiber handlers delegate to the proxy subpackage.
var (
	GA4CollectProxy        = proxy.GA4CollectProxy
	GA4ScriptProxy         = proxy.GA4ScriptProxy
	UmamiScriptProxy       = proxy.UmamiScriptProxy
	UmamiCollectProxy      = proxy.UmamiCollectProxy
	YouTubePlaylistHandler = proxy.YouTubePlaylistHandler
	YouTubeThumbnailProxy  = proxy.YouTubeThumbnailProxy
)
