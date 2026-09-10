package compliance

import "testing"

// TestIsACMMAIContribution covers all four branches of isACMMAIContribution,
// which classifies whether a GitHub issue/PR author + label set counts as an
// AI contribution for ACMM (AI Contribution Maturity Model) scans. Previously
// the function sat at 62.5% — only the aiAuthors true-arm was reachable via
// indirect callers (fetchACMMWeeklyActivity), leaving the [bot] suffix arm,
// the ai-generated label arm, and the false arm untested.
//
// This is the classifier that feeds ACMM's "AI-authored" tallies exposed on
// the maturity dashboard and consumed by acmm-history.json — a
// mis-classification here silently under- or over-counts AI contributions in
// every leaderboard sparkline.
func TestIsACMMAIContribution(t *testing.T) {
	tests := []struct {
		name   string
		labels []acmmLabel
		author string
		want   bool
	}{
		{
			name:   "known aiAuthors entry",
			author: "Copilot",
			want:   true,
		},
		{
			name:   "human aiAuthors entry (clubanderson)",
			author: "clubanderson",
			want:   true,
		},
		{
			name:   "bot-suffix author",
			author: "dependabot[bot]",
			want:   true,
		},
		{
			name:   "explicit ai-generated label wins over unknown human",
			labels: []acmmLabel{{Name: "documentation"}, {Name: aiLabel}},
			author: "somebody-else",
			want:   true,
		},
		{
			name:   "unknown human author with no ai-generated label",
			labels: []acmmLabel{{Name: "bug"}, {Name: "priority/high"}},
			author: "somebody-else",
			want:   false,
		},
		{
			name:   "empty labels + unknown author",
			author: "anon",
			want:   false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isACMMAIContribution(tt.labels, tt.author); got != tt.want {
				t.Fatalf("isACMMAIContribution(%v, %q) = %v, want %v", tt.labels, tt.author, got, tt.want)
			}
		})
	}
}
