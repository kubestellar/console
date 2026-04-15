package agent

import (
	"testing"
)

// TestGenerateRuleBasedEnrichmentsRootCause verifies that every category
// handled by generateRuleBasedEnrichments populates a non-empty RootCause.
// Regression coverage for #8090: rule-based enrichments previously left
// RootCause empty while AI-generated enrichments populated it.
func TestGenerateRuleBasedEnrichmentsRootCause(t *testing.T) {
	cases := []struct {
		name     string
		category string
	}{
		{"event-correlation", "event-correlation"},
		{"cascade-impact", "cascade-impact"},
		{"config-drift", "config-drift"},
		{"resource-imbalance", "resource-imbalance"},
		{"restart-correlation", "restart-correlation"},
		{"cluster-delta", "cluster-delta"},
		{"rollout-tracker", "rollout-tracker"},
		{"default", "some-unknown-category"},
	}

	w := &InsightWorker{}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			insights := []InsightSummary{{
				ID:               "test-" + tc.category,
				Category:         tc.category,
				Title:            "Test insight",
				Description:      "Test description",
				Severity:         "warning",
				AffectedClusters: []string{"cluster-a", "cluster-b"},
			}}

			enrichments := w.generateRuleBasedEnrichments(insights)
			if len(enrichments) != 1 {
				t.Fatalf("expected 1 enrichment, got %d", len(enrichments))
			}

			e := enrichments[0]
			if e.RootCause == "" {
				t.Errorf("category %q: RootCause is empty, expected a non-empty rule-based root cause", tc.category)
			}
			if e.Description == "" {
				t.Errorf("category %q: Description is empty", tc.category)
			}
			if e.Remediation == "" {
				t.Errorf("category %q: Remediation is empty", tc.category)
			}
			if e.Provider != "rules" {
				t.Errorf("category %q: Provider = %q, want %q", tc.category, e.Provider, "rules")
			}
		})
	}
}
