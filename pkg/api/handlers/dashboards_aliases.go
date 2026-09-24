package handlers

import "github.com/kubestellar/console/pkg/api/handlers/dashboards"

// Aliases keep route registration and existing call sites working after the
// dashboard and card CRUD handlers (dashboard.go, cards.go) moved into their
// own pkg/api/handlers/dashboards subpackage (epic #23685). New code should
// import pkg/api/handlers/dashboards directly.

// Type aliases for the dashboard/card handler structs and export DTOs.
type (
	DashboardHandler = dashboards.DashboardHandler
	CardHandler      = dashboards.CardHandler
	DashboardExport  = dashboards.DashboardExport
	CardExport       = dashboards.CardExport
)

// Limits re-exported so existing call sites and tests keep working.
const (
	MaxDashboardsPerUser = dashboards.MaxDashboardsPerUser
	MaxCardsPerDashboard = dashboards.MaxCardsPerDashboard
)

// Constructors delegate to the dashboards subpackage.
var (
	NewDashboardHandler = dashboards.NewDashboardHandler
	NewCardHandler      = dashboards.NewCardHandler
)
