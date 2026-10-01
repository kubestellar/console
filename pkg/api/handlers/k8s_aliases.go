package handlers

import "github.com/kubestellar/console/pkg/api/handlers/k8s"

// Aliases keep route registration and existing call sites working after the
// cluster/K8s-state handlers moved into their own pkg/api/handlers/k8s
// subpackage (epic #23685 phase 1). New code should import
// pkg/api/handlers/k8s directly.
//
// Only entries that still have a caller in this repository are kept here.
// 35 dead type/var aliases from the original phase-1 shim were swept after
// phase 2 migrated route files, tests, and sibling handlers to import the
// k8s subpackage directly (kubestellar/console#23896).

// Type aliases for the k8s handler structs and response/DTO types that
// still have an external or sibling-file caller.
type (
	NamespaceHandler        = k8s.NamespaceHandler
	CRDSummary              = k8s.CRDSummary
	ClusterCapacityProvider = k8s.ClusterCapacityProvider
	LimaInstanceSummary     = k8s.LimaInstanceSummary
	WebhookSummary          = k8s.WebhookSummary
)

// Constructors delegate to the k8s subpackage.
var (
	NewNamespaceHandler = k8s.NewNamespaceHandler
	NewGPUHandler       = k8s.NewGPUHandler
	NewGadgetHandler    = k8s.NewGadgetHandler
	NewEventHandler     = k8s.NewEventHandler
	NewSwapHandler      = k8s.NewSwapHandler
	NewOrbitHandler     = k8s.NewOrbitHandler
)

// Package-level fiber handlers delegate to the k8s subpackage.
var (
	MediumBlogHandler = k8s.MediumBlogHandler
)
