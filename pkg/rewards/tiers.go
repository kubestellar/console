// Package rewards is the canonical source for contributor rank tiers.
//
// The contributor ladder (Observer → Explorer → Navigator → Pilot → Commander
// → Captain → Admiral → Legend) was originally defined client-side in
// web/src/types/rewards.ts. Phase 1 of RFC #8862 ports the definition to Go
// so the backend can serve authoritative rank data (e.g. public badge
// endpoint in Phase 2) without the TS and Go copies silently drifting.
//
// The TypeScript side now consumes a generated file at
// web/src/types/rewards.generated.ts (produced by scripts/gen-rewards-types.ts
// from this file). A CI drift check ensures the two stay in lockstep.
//
// See https://github.com/kubestellar/console/issues/8862 for the full RFC.
package rewards

// Point values for GitHub contributions. Shared between pkg/api/handlers
// and the Netlify Functions mirror so scoring logic is consistent across
// all deployment modes (#8862 Phase 4).
const (
	PointsBugIssue     = 300
	PointsFeatureIssue = 100
	PointsOtherIssue   = 50
	PointsPROpened     = 200
	PointsPRMerged     = 500
)

// Tier describes a single rung of the contributor ladder. Fields mirror the
// TypeScript ContributorLevel interface at web/src/types/rewards.ts so that
// the generated TS file is a drop-in replacement for the legacy hand-written
// CONTRIBUTOR_LEVELS constant.
type Tier struct {
	// Rank is the ladder position, 1-indexed (Observer = 1, Legend = 8).
	Rank int `json:"rank"`
	// Name is the human-readable tier label used in UI.
	Name string `json:"name"`
	// Icon is the Lucide icon name rendered next to the tier label.
	Icon string `json:"icon"`
	// IconPath is the raw Lucide SVG path data (d attribute) for the icon.
	// Used by the SVG badge handler to render the icon without external deps.
	IconPath string `json:"iconPath"`
	// MinCoins is the inclusive lower bound of the tier's coin range.
	MinCoins int `json:"minCoins"`
	// Color is a Tailwind color prefix (e.g. "gray", "blue") used by
	// callers that compute derived class names at render time.
	Color string `json:"color"`
	// BgClass is the Tailwind background class for the tier badge.
	BgClass string `json:"bgClass"`
	// TextClass is the Tailwind text color class for the tier badge.
	TextClass string `json:"textClass"`
	// BorderClass is the Tailwind border class for the tier badge.
	BorderClass string `json:"borderClass"`
}

// ContributorLevels is the ordered (ascending by MinCoins) list of tiers.
// DO NOT reorder or mutate at runtime — the TS codegen depends on the
// source-file order and existing rank numbers are persisted in user data.
var ContributorLevels = []Tier{
	{
		Rank:        1,
		Name:        "Observer",
		Icon:        "Telescope",
		IconPath:    "m19 11-8-8c-.9-.9-2.3-.9-3.2 0L2 9.5a1 1 0 0 0 0 1.4l7.1 7.1a1 1 0 0 0 1.4 0L19 11ZM8.5 8.5 13 13M16 2l5 5M22 22l-3-3M7 22l-1-3M10 22l1-3",
		MinCoins:    0,
		Color:       "gray",
		BgClass:     "bg-gray-500/20",
		TextClass:   "text-muted-foreground",
		BorderClass: "border-gray-500/30",
	},
	{
		Rank:        2,
		Name:        "Explorer",
		Icon:        "Compass",
		IconPath:    "m16.24 7.76-1.41 4.95-4.95 1.41 1.41-4.95 4.95-1.41ZM12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10Z",
		MinCoins:    500,
		Color:       "blue",
		BgClass:     "bg-blue-500/20",
		TextClass:   "text-blue-400",
		BorderClass: "border-blue-500/30",
	},
	{
		Rank:        3,
		Name:        "Navigator",
		Icon:        "Map",
		IconPath:    "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6ZM9 3v15M15 6v15",
		MinCoins:    2000,
		Color:       "cyan",
		BgClass:     "bg-cyan-500/20",
		TextClass:   "text-cyan-400",
		BorderClass: "border-cyan-500/30",
	},
	{
		Rank:        4,
		Name:        "Pilot",
		Icon:        "Rocket",
		IconPath:    "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09ZM12 15l-3.5 3.5M20.3 3.7a2.32 2.32 0 0 0-3.3 0c-1.2 1.2-1.9 2.5-2.2 3.7c-.1.3 0 .6.2.8c.2.2.5.3.8.2c1.2-.3 2.5-1 3.7-2.2a2.32 2.32 0 0 0 0-3.3ZM8.8 15.8l-2.2 2.2M16 8l-3.5 3.5M12 2a21.19 21.19 0 0 0-1 9c0 .7.3 1.4.9 1.9s.9.9 1.9.9c3.1 0 6.2-.3 9-1c.7-.2 1.2-.7 1.4-1.4a21.24 21.24 0 0 0-1-9",
		MinCoins:    5000,
		Color:       "green",
		BgClass:     "bg-green-500/20",
		TextClass:   "text-green-400",
		BorderClass: "border-green-500/30",
	},
	{
		Rank:        5,
		Name:        "Commander",
		Icon:        "Shield",
		IconPath:    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
		MinCoins:    15000,
		Color:       "purple",
		BgClass:     "bg-purple-500/20",
		TextClass:   "text-purple-400",
		BorderClass: "border-purple-500/30",
	},
	{
		Rank:        6,
		Name:        "Captain",
		Icon:        "Star",
		IconPath:    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
		MinCoins:    50000,
		Color:       "orange",
		BgClass:     "bg-orange-500/20",
		TextClass:   "text-orange-400",
		BorderClass: "border-orange-500/30",
	},
	{
		Rank:        7,
		Name:        "Admiral",
		Icon:        "Crown",
		IconPath:    "m2 4 3 10h14l3-10-6 7-4-7-4 7-6-7Zm3 16h14",
		MinCoins:    150000,
		Color:       "red",
		BgClass:     "bg-red-500/20",
		TextClass:   "text-red-400",
		BorderClass: "border-red-500/30",
	},
	{
		Rank:        8,
		Name:        "Legend",
		Icon:        "Sparkles",
		IconPath:    "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z",
		MinCoins:    500000,
		Color:       "yellow",
		BgClass:     "bg-gradient-to-r from-yellow-400/30 via-amber-300/30 to-yellow-500/30",
		TextClass:   "text-yellow-300",
		BorderClass: "border-yellow-400/50",
	},
}

// GetContributorLevel returns the highest Tier whose MinCoins is ≤ totalCoins.
// Mirrors the TS helper at web/src/types/rewards.ts#getContributorLevel.
//
// Behavior contract (kept in sync with the TS side):
//   - totalCoins < 0 or 0 → ContributorLevels[0] (Observer).
//   - totalCoins ≥ ContributorLevels[last].MinCoins → last tier (Legend).
//   - Otherwise, the highest tier whose threshold has been crossed.
//
// The TS helper also returns `next`, `progress`, and `coinsToNext`. Phase 1
// intentionally only ports the current-tier lookup — Phase 2's badge
// endpoint is the first Go caller and it has no use for the progress fields.
// Future callers that need them should add a sibling helper rather than
// bloating this one.
func GetContributorLevel(totalCoins int) Tier {
	current := ContributorLevels[0]
	// Walk from the top tier down and stop at the first one the user has
	// crossed the threshold for. Matches the reverse loop in the TS impl.
	for i := len(ContributorLevels) - 1; i >= 0; i-- {
		if totalCoins >= ContributorLevels[i].MinCoins {
			current = ContributorLevels[i]
			break
		}
	}
	return current
}

