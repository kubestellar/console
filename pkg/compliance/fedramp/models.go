// Package fedramp implements FedRAMP authorization readiness scoring.
package fedramp

// ControlBaseline represents a FedRAMP control at a specific impact level.
type ControlBaseline struct {
	ID          string `json:"id"`          // e.g., AC-1, SC-7
	Family      string `json:"family"`      // control family
	Name        string `json:"name"`
	ImpactLevel string `json:"impact_level"` // low, moderate, high
	Status      string `json:"status"`       // satisfied, partially_satisfied, planned, other
	POAMEntry   bool   `json:"poam_entry"`   // has Plan of Action & Milestones entry
	Evidence    string `json:"evidence"`
}

// POAMItem represents a Plan of Action & Milestones entry.
type POAMItem struct {
	ID              string `json:"id"`
	ControlID       string `json:"control_id"`
	Weakness        string `json:"weakness"`
	Severity        string `json:"severity"` // high, moderate, low
	ScheduledDate   string `json:"scheduled_date"`
	MilestonStatus  string `json:"milestone_status"` // open, closed, delayed
	ResponsibleRole string `json:"responsible_role"`
}

// ReadinessScore represents the FedRAMP readiness assessment.
type ReadinessScore struct {
	OverallScore        int    `json:"overall_score"` // 0-100
	ImpactLevel         string `json:"impact_level"`  // low, moderate, high
	TotalControls       int    `json:"total_controls"`
	SatisfiedControls   int    `json:"satisfied_controls"`
	PartialControls     int    `json:"partial_controls"`
	PlannedControls     int    `json:"planned_controls"`
	OpenPOAMs           int    `json:"open_poams"`
	ClosedPOAMs         int    `json:"closed_poams"`
	AuthorizationStatus string `json:"authorization_status"` // not_started, in_progress, ato_granted, ato_conditional
	EvaluatedAt         string `json:"evaluated_at"`
}
