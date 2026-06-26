package rewards

import "testing"

// TestGetContributorLevel_Boundaries verifies the tier lookup matches the
// TS implementation at web/src/types/rewards.ts#getContributorLevel for the
// documented boundary cases (0 coins → Observer, exact threshold → next
// rank, ≥ Legend's MinCoins → Legend).
func TestGetContributorLevel_Boundaries(t *testing.T) {
	tests := []struct {
		name       string
		totalCoins int
		wantName   string
		wantRank   int
	}{
		{"zero coins → Observer", 0, "Observer", 1},
		{"negative coins → Observer", -100, "Observer", 1},
		{"just below Explorer → Observer", 499, "Observer", 1},
		{"exact Explorer threshold → Explorer", 500, "Explorer", 2},
		{"mid Explorer → Explorer", 1999, "Explorer", 2},
		{"exact Navigator threshold → Navigator", 2000, "Navigator", 3},
		{"exact Pilot threshold → Pilot", 5000, "Pilot", 4},
		{"exact Commander threshold → Commander", 15000, "Commander", 5},
		{"exact Captain threshold → Captain", 50000, "Captain", 6},
		{"exact Admiral threshold → Admiral", 150000, "Admiral", 7},
		{"exact Legend threshold → Legend", 500000, "Legend", 8},
		{"far above Legend → Legend", 10000000, "Legend", 8},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := GetContributorLevel(tc.totalCoins)
			if got.Name != tc.wantName || got.Rank != tc.wantRank {
				t.Fatalf("GetContributorLevel(%d) = {Name: %q, Rank: %d}, want {Name: %q, Rank: %d}",
					tc.totalCoins, got.Name, got.Rank, tc.wantName, tc.wantRank)
			}
		})
	}
}

// TestContributorLevels_Invariants locks in the structural properties the
// codegen and every downstream caller relies on: ranks start at 1 and are
// contiguous, MinCoins is strictly ascending, and the slice is non-empty.
// A regression here would break the TS generator and the tier lookup.
func TestContributorLevels_Invariants(t *testing.T) {
	if len(ContributorLevels) == 0 {
		t.Fatal("ContributorLevels is empty; codegen and lookup both require at least one tier")
	}

	for i, tier := range ContributorLevels {
		wantRank := i + 1
		if tier.Rank != wantRank {
			t.Errorf("ContributorLevels[%d].Rank = %d, want %d (ranks must be contiguous starting at 1)",
				i, tier.Rank, wantRank)
		}
		if tier.Name == "" || tier.Icon == "" || tier.Color == "" {
			t.Errorf("ContributorLevels[%d] has empty required field: %+v", i, tier)
		}
		if i > 0 && tier.MinCoins <= ContributorLevels[i-1].MinCoins {
			t.Errorf("ContributorLevels[%d].MinCoins = %d, not greater than previous tier's %d",
				i, tier.MinCoins, ContributorLevels[i-1].MinCoins)
		}
	}

	// First tier must be the 0-threshold default — GetContributorLevel
	// relies on ContributorLevels[0] as the fallback for sub-minimum coin
	// counts.
	if ContributorLevels[0].MinCoins != 0 {
		t.Errorf("ContributorLevels[0].MinCoins = %d, want 0 (Observer is the zero-coins default)",
			ContributorLevels[0].MinCoins)
	}
}
