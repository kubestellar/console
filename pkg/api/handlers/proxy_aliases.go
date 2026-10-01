package handlers

import "github.com/kubestellar/console/pkg/api/handlers/proxy"

// Aliases keep route registration and existing call sites working after the
// upstream-provider proxy handlers moved into their own
// pkg/api/handlers/proxy subpackage (epic #23685 phase 1). New code should
// import pkg/api/handlers/proxy directly.

// Type aliases for the proxy handler structs that still have a caller.
// The 5 type aliases from the original phase-1 shim were swept after phase 2
// migrated callers to pkg/api/handlers/proxy directly (#23896) — the 5
// handler-struct type aliases had no remaining qualified or sibling-file
// references.

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
