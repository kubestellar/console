package handlers

import "github.com/kubestellar/console/pkg/api/handlers/ops"

// Aliases keep route registration and existing call sites working after the
// air-gap/manifest/notifications/onboarding/ping/self-upgrade/timeline/
// token-usage handler files moved into their own pkg/api/handlers/ops
// subpackage (epic #23685 phase 1). New code should import
// pkg/api/handlers/ops directly.
//
// DashboardHandler and CardHandler did not land here: they form their own
// cohesive dashboard/card CRUD domain and moved to
// pkg/api/handlers/dashboards instead (see dashboards_aliases.go). The
// demo-data helpers (IsDemoMode, DemoResponse, GetDemo*) stay at root
// because they are used throughout the remaining root handlers; the
// canonical implementations now live in internal/httputil.

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
