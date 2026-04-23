// Package baa implements Business Associate Agreement tracking
// for HIPAA compliance across cloud providers and clusters.
package baa

// Agreement represents a Business Associate Agreement record.
type Agreement struct {
	ID              string   `json:"id"`
	Provider        string   `json:"provider"`
	ProviderType    string   `json:"provider_type"` // cloud, saas, managed_service, consulting
	BAASignedDate   string   `json:"baa_signed_date"`
	BAAExpiryDate   string   `json:"baa_expiry_date"`
	CoveredClusters []string `json:"covered_clusters"`
	ContactName     string   `json:"contact_name"`
	ContactEmail    string   `json:"contact_email"`
	Status          string   `json:"status"` // active, expiring_soon, expired, pending
	Notes           string   `json:"notes"`
}

// ExpiryAlert represents a BAA expiry warning.
type ExpiryAlert struct {
	AgreementID string `json:"agreement_id"`
	Provider    string `json:"provider"`
	ExpiryDate  string `json:"expiry_date"`
	DaysLeft    int    `json:"days_left"`
	Severity    string `json:"severity"` // critical (≤30d), warning (≤60d), info (≤90d)
}

// Summary is the overall BAA tracking summary.
type Summary struct {
	TotalAgreements  int `json:"total_agreements"`
	ActiveAgreements int `json:"active_agreements"`
	ExpiringSoon     int `json:"expiring_soon"`
	Expired          int `json:"expired"`
	Pending          int `json:"pending"`
	CoveredClusters  int `json:"covered_clusters"`
	UncoveredClusters int `json:"uncovered_clusters"`
	ActiveAlerts     int `json:"active_alerts"`
	EvaluatedAt      string `json:"evaluated_at"`
}
