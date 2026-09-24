package handlers

import "github.com/kubestellar/console/pkg/api/handlers/k8s"

// Aliases keep route registration and existing call sites working after the
// cluster/K8s-state handlers (namespaces, CRDs, topology, GPU, gadget,
// events, Gateway API, MCS, ServiceExports, admission webhooks, card swap,
// orbit missions, and the Medium blog proxy) moved into their own
// pkg/api/handlers/k8s subpackage (epic #23685 phase 1). New code should
// import pkg/api/handlers/k8s directly.

// Type aliases for the k8s handler structs and response/DTO types.
type (
	NamespaceHandler          = k8s.NamespaceHandler
	CRDHandlers               = k8s.CRDHandlers
	CRDSummary                = k8s.CRDSummary
	CRDVersion                = k8s.CRDVersion
	CRDListResponse           = k8s.CRDListResponse
	TopologyHandlers          = k8s.TopologyHandlers
	TopologyNode              = k8s.TopologyNode
	TopologyEdge              = k8s.TopologyEdge
	TopologyGraph             = k8s.TopologyGraph
	TopologyClusterSummary    = k8s.TopologyClusterSummary
	ClusterCapacityProvider   = k8s.ClusterCapacityProvider
	GPUHandler                = k8s.GPUHandler
	GadgetHandler             = k8s.GadgetHandler
	EventHandler              = k8s.EventHandler
	GatewayHandlers           = k8s.GatewayHandlers
	MCSHandlers               = k8s.MCSHandlers
	ServiceExportHandlers     = k8s.ServiceExportHandlers
	ServiceExportSummary      = k8s.ServiceExportSummary
	ServiceExportListResponse = k8s.ServiceExportListResponse
	WebhookHandlers           = k8s.WebhookHandlers
	WebhookSummary            = k8s.WebhookSummary
	WebhookListResponse       = k8s.WebhookListResponse
	SwapHandler               = k8s.SwapHandler
	OrbitMission              = k8s.OrbitMission
	OrbitStep                 = k8s.OrbitStep
	OrbitRunRecord            = k8s.OrbitRunRecord
	OrbitExecutor             = k8s.OrbitExecutor
	OrbitScheduleEntry        = k8s.OrbitScheduleEntry
	OrbitHandler              = k8s.OrbitHandler
	MediumPost                = k8s.MediumPost
)

// Constructors delegate to the k8s subpackage.
var (
	NewNamespaceHandler      = k8s.NewNamespaceHandler
	NewCRDHandlers           = k8s.NewCRDHandlers
	NewTopologyHandlers      = k8s.NewTopologyHandlers
	NewGPUHandler            = k8s.NewGPUHandler
	NewGadgetHandler         = k8s.NewGadgetHandler
	NewEventHandler          = k8s.NewEventHandler
	NewGatewayHandlers       = k8s.NewGatewayHandlers
	NewMCSHandlers           = k8s.NewMCSHandlers
	NewServiceExportHandlers = k8s.NewServiceExportHandlers
	NewWebhookHandlers       = k8s.NewWebhookHandlers
	NewSwapHandler           = k8s.NewSwapHandler
	NewOrbitHandler          = k8s.NewOrbitHandler
)

// Package-level fiber handlers delegate to the k8s subpackage.
var (
	MediumBlogHandler = k8s.MediumBlogHandler
)
