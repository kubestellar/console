package baa

import "time"

// Engine manages BAA tracking and expiry alerting.
type Engine struct {
	agreements []Agreement
	alerts     []ExpiryAlert
}

// NewEngine creates a BAA tracking engine with demo data.
func NewEngine() *Engine {
	e := &Engine{}
	e.agreements = e.buildAgreements()
	e.alerts = e.buildAlerts()
	return e
}

// Agreements returns all BAA records.
func (e *Engine) Agreements() []Agreement { return e.agreements }

// Alerts returns expiry alerts.
func (e *Engine) Alerts() []ExpiryAlert { return e.alerts }

// Summary returns the overall BAA tracking summary.
func (e *Engine) Summary() Summary {
	active, expiring, expired, pending := 0, 0, 0, 0
	coveredSet := map[string]bool{}
	for _, a := range e.agreements {
		switch a.Status {
		case "active":
			active++
		case "expiring_soon":
			expiring++
		case "expired":
			expired++
		case "pending":
			pending++
		}
		for _, c := range a.CoveredClusters {
			coveredSet[c] = true
		}
	}

	const totalClusters = 6 // demo fleet size
	return Summary{
		TotalAgreements:   len(e.agreements),
		ActiveAgreements:  active,
		ExpiringSoon:      expiring,
		Expired:           expired,
		Pending:           pending,
		CoveredClusters:   len(coveredSet),
		UncoveredClusters: totalClusters - len(coveredSet),
		ActiveAlerts:      len(e.alerts),
		EvaluatedAt:       time.Now().UTC().Format(time.RFC3339),
	}
}

func (e *Engine) buildAgreements() []Agreement {
	return []Agreement{
		{
			ID: "baa-001", Provider: "Amazon Web Services", ProviderType: "cloud",
			BAASignedDate: "2025-06-15", BAAExpiryDate: "2027-06-15",
			CoveredClusters: []string{"prod-east", "staging-east"},
			ContactName: "AWS Enterprise Support", ContactEmail: "aws-baa@example.com",
			Status: "active", Notes: "Covers all HIPAA-eligible services in us-east-1",
		},
		{
			ID: "baa-002", Provider: "Google Cloud Platform", ProviderType: "cloud",
			BAASignedDate: "2025-08-01", BAAExpiryDate: "2026-08-01",
			CoveredClusters: []string{"prod-west"},
			ContactName: "GCP Healthcare Team", ContactEmail: "gcp-baa@example.com",
			Status: "active", Notes: "Covers GKE, Cloud SQL, BigQuery in us-west1",
		},
		{
			ID: "baa-003", Provider: "Datadog", ProviderType: "saas",
			BAASignedDate: "2025-03-01", BAAExpiryDate: "2026-05-15",
			CoveredClusters: []string{"prod-east", "prod-west"},
			ContactName: "Datadog Compliance", ContactEmail: "compliance@datadog.example.com",
			Status: "expiring_soon", Notes: "Monitoring and logging for PHI workloads",
		},
		{
			ID: "baa-004", Provider: "Snowflake", ProviderType: "saas",
			BAASignedDate: "2024-01-01", BAAExpiryDate: "2026-01-01",
			CoveredClusters: []string{},
			ContactName: "Snowflake Legal", ContactEmail: "legal@snowflake.example.com",
			Status: "expired", Notes: "Analytics warehouse — BAA lapsed, renewal in progress",
		},
		{
			ID: "baa-005", Provider: "Acme Consulting", ProviderType: "consulting",
			BAASignedDate: "", BAAExpiryDate: "",
			CoveredClusters: []string{"dev-central"},
			ContactName: "Acme Project Manager", ContactEmail: "pm@acme.example.com",
			Status: "pending", Notes: "New vendor onboarding — BAA under legal review",
		},
		{
			ID: "baa-006", Provider: "Azure", ProviderType: "cloud",
			BAASignedDate: "2025-11-01", BAAExpiryDate: "2027-11-01",
			CoveredClusters: []string{"dr-central"},
			ContactName: "Microsoft Enterprise", ContactEmail: "azure-baa@example.com",
			Status: "active", Notes: "Disaster recovery cluster in Central US",
		},
	}
}

func (e *Engine) buildAlerts() []ExpiryAlert {
	return []ExpiryAlert{
		{AgreementID: "baa-003", Provider: "Datadog", ExpiryDate: "2026-05-15", DaysLeft: 22, Severity: "critical"},
		{AgreementID: "baa-004", Provider: "Snowflake", ExpiryDate: "2026-01-01", DaysLeft: 0, Severity: "critical"},
	}
}
