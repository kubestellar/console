package handlers

import "github.com/kubestellar/console/pkg/api/handlers/ops"

// Aliases keep route registration and existing call sites working after the
// air-gap/manifest/notifications/onboarding/ping/self-upgrade/timeline/
// token-usage handler files moved into their own pkg/api/handlers/ops
// subpackage (epic #23685 phase 1). New code should import
// pkg/api/handlers/ops directly.
//
// DashboardHandler and its demo-data helpers (IsDemoMode, DemoResponse,
// GetDemo*) stay at root: DashboardHandler depends on the unexported
// isValidCardType helper in cards.go, and the demo-data helpers are used
// throughout the still-flat k8s-resource handlers (crds.go, namespaces.go,
// gateway.go, etc.) that a separate, concurrent epic #23685 slice is moving
// into pkg/api/handlers/k8s. Moving demo_data.go/dashboard.go here would
// force a cross-slice dependency, so they were intentionally left in place.

// Type aliases for the ops handler structs.
type (
	AirGapHandler       = ops.AirGapHandler
	ManifestHandler     = ops.ManifestHandler
	NotificationHandler = ops.NotificationHandler
	OnboardingHandler   = ops.OnboardingHandler
	SelfUpgradeHandler  = ops.SelfUpgradeHandler
	TimelineHandler     = ops.TimelineHandler
	TokenUsageHandler   = ops.TokenUsageHandler
)

// Constructors delegate to the ops subpackage.
var (
	NewAirGapHandler       = ops.NewAirGapHandler
	NewManifestHandler     = ops.NewManifestHandler
	NewNotificationHandler = ops.NewNotificationHandler
	NewOnboardingHandler   = ops.NewOnboardingHandler
	NewSelfUpgradeHandler  = ops.NewSelfUpgradeHandler
	NewTimelineHandler     = ops.NewTimelineHandler
	NewTokenUsageHandler   = ops.NewTokenUsageHandler
)

// PingHandler is a package-level fiber handler that delegates to the ops
// subpackage.
var PingHandler = ops.PingHandler
