package handlers

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/rewards"
	"github.com/kubestellar/console/pkg/store"
)

// Phase 2 of RFC #8862 — public, unauthenticated contributor-tier badge.
//
// Serves a shields.io-style SVG pill that GitHub READMEs embed via Camo
// (GitHub's image proxy). Tier comes from the same scored-contribution flow
// that powers /api/rewards/github, mapped through pkg/rewards.GetContributorLevel
// (ported in Phase 1).
//
// Notes: public route (no JWTAuth); rate-limited by the existing publicLimiter
// (60 req/min/IP); SVG everywhere including errors so Camo always has something
// to show; max-age=3600 on success so a user's tier doesn't get re-fetched
// every README render; no-store on errors so transient failures don't stick.

// Badge rendering + transport constants.
const (
	badgeContentType         = "image/svg+xml; charset=utf-8" // success Content-Type
	badgeCacheMaxAgeSeconds  = 3600                           // 1h — tier rarely flips
	badgeCacheControlSuccess = "public, max-age=3600"         // matches badgeCacheMaxAgeSeconds
	badgeCacheControlError   = "no-store"                     // transient errors: do not cache
	badgeLoginHashPrefixLen  = 16                             // 16 hex = 64b SHA-256 prefix for analytics
	badgeLabelText           = "kubestellar"                  // left-hand segment, tier-agnostic
	badgeUnknownTierName     = "unknown"                      // no GitHub activity / 404
	badgeUnknownTierColor    = "#9e9e9e"                      // observer-gray hex
	badgeErrorTierName       = "error"                        // upstream 5xx / timeout
	badgeErrorTierColor      = "#e05d44"                      // shields.io red
	badgeLabelColor          = "#555"                         // shields.io dark-gray label
	badgeHeightPx            = 20                             // SVG pill height
	badgeLabelWidthPx        = 82                             // tuned for "kubestellar" (11 chars)
	badgeValueWidthPx        = 82                             // increased for "Commander" + icon
	badgeTotalWidthPx        = badgeLabelWidthPx + badgeValueWidthPx
	badgeLabelMidPx          = badgeLabelWidthPx / 2 // text-anchor centre of label
	badgeValueMidPx          = badgeLabelWidthPx + (badgeValueWidthPx / 2) + 6
	badgeTextBaselinePx      = 14 // y offset for main text
	badgeTextShadowPx        = 15 // y offset for drop shadow
	badgeFontSizePx          = 11 // shields.io default
	badgeCornerRadiusPx      = 3  // shields.io default
	badgeIconX               = badgeLabelWidthPx + 6
	badgeIconY               = 3
	badgeIconSize            = 14
)

// Named HTTP statuses so the three render paths are self-documenting.
const (
	badgeStatusOK      = fiber.StatusOK
	badgeStatusBadGate = fiber.StatusBadGateway
)

// badgeRewardsFetcher is the narrow seam BadgeHandler depends on. Defining
// it as an interface lets the test substitute a fake without importing the
// whole RewardsHandler's transitive dependencies. cacheHit reports whether
// the response came from the in-memory cache; used for GA4 analytics only.
type badgeRewardsFetcher interface {
	fetchUserRewardsForBadge(login string) (resp *GitHubRewardsResponse, cacheHit bool, err error)
}

// errBadgeUnknownLogin signals an empty/404 upstream. Handler maps this to
// the "unknown" tier SVG (200, cached) instead of an error SVG (502, no-store).
var errBadgeUnknownLogin = errors.New("unknown github login")

// fetchUserRewardsForBadge adapts RewardsHandler to badgeRewardsFetcher.
// Shares the authenticated path's cache map + TTL (rewardsCacheTTL); unlike
// GetGitHubRewards it does NOT fall back to stale cache on upstream failure
// because the badge handler needs to pick between success/unknown/error.
func (h *RewardsHandler) fetchUserRewardsForBadge(login string) (*GitHubRewardsResponse, bool, error) {
	h.mu.RLock()
	if entry, ok := h.cache[login]; ok && time.Since(entry.fetchedAt) < rewardsCacheTTL {
		h.mu.RUnlock()
		if entry.response == nil {
			return nil, true, errBadgeUnknownLogin
		}
		resp := *entry.response
		return &resp, true, nil
	}
	h.mu.RUnlock()

	token := h.resolveToken()
	resp, err := h.fetchUserRewards(login, token)
	if err != nil {
		// Treat "not found"/"unprocessable" as unknown-login so the caller
		// renders the gray badge instead of the red error one.
		msg := err.Error()
		if strings.Contains(msg, "404") || strings.Contains(msg, "422") {
			return nil, false, errBadgeUnknownLogin
		}
		return nil, false, err
	}

	// Populate the shared cache so later authenticated or badge calls
	// don't re-hit GitHub.
	h.mu.Lock()
	h.cache[login] = &rewardsCacheEntry{
		response:  resp,
		fetchedAt: time.Now(),
	}
	h.mu.Unlock()

	return resp, false, nil
}

// BadgeHandler serves the public contributor-tier badge SVG.
type BadgeHandler struct {
	fetcher badgeRewardsFetcher
	store   store.Store
}

// NewBadgeHandler wraps a fetcher (usually *RewardsHandler) and a store
// and exposes GetBadge.
func NewBadgeHandler(fetcher badgeRewardsFetcher, s store.Store) *BadgeHandler {
	return &BadgeHandler{fetcher: fetcher, store: s}
}

// totalPointsFromResponse keeps the coin lookup in one place so the test
// fake can model it without duplicating shape knowledge.
func totalPointsFromResponse(resp *GitHubRewardsResponse) int {
	if resp == nil {
		return 0
	}
	return resp.TotalPoints
}

// GetBadge renders an SVG tier badge for :github_login (public, rate-limited).
func (h *BadgeHandler) GetBadge(c *fiber.Ctx) error {
	login := strings.TrimSpace(c.Params("github_login"))
	if login == "" {
		return renderBadgeSVG(c, badgeStatusBadGate, badgeErrorTierName, badgeErrorTierColor, "", badgeCacheControlError)
	}

	// Privacy Check (#8862 Phase 5): only score users who have logged into
	// the console at least once. Prevents drive-by scraping of GitHub logins
	// that have no affiliation with the project.
	if h.store != nil {
		user, err := h.store.GetUserByGitHubLogin(login)
		if err != nil {
			slog.Error("[rewards/badge] store lookup failed", "login", login, "error", err)
			return renderBadgeSVG(c, badgeStatusBadGate, badgeErrorTierName, badgeErrorTierColor, "", badgeCacheControlError)
		}
		if user == nil {
			// Unknown to console -> return the gray "unknown" badge immediately
			// without hitting GitHub.
			return renderBadgeSVG(c, badgeStatusOK, badgeUnknownTierName, badgeUnknownTierColor, "", badgeCacheControlSuccess)
		}

		resp, cacheHit, err := h.fetcher.fetchUserRewardsForBadge(login)
		if err != nil {
			slog.Error("[rewards/badge] live rewards fetch failed", "login", login, "error", err)
			return renderBadgeSVG(c, http.StatusBadGateway, badgeErrorTierName, badgeErrorTierColor, "", badgeCacheControlError)
		}

		// Fetch local console rewards (daily logins, onboarding, etc.) and add to
		// the live GitHub total to get the unified rank seen in the UI.
		storeRewards, err := h.store.GetUserRewards(user.GitHubID)
		if err != nil {
			slog.Error("[rewards/badge] store rewards fetch failed", "login", login, "userId", user.GitHubID, "error", err)
			// Fall back to GitHub-only points rather than failing the badge
			storeRewards = &store.UserRewards{}
		}

		totalPoints := totalPointsFromResponse(resp) + storeRewards.Coins + storeRewards.BonusPoints
		tier := rewards.GetContributorLevel(totalPoints)
		fill := tierColorHex(tier.Color)

		emitBadgeFetchedEvent(login, tier.Name, cacheHit)
		return renderBadgeSVG(c, badgeStatusOK, tier.Name, fill, tier.IconPath, badgeCacheControlSuccess)
	}

	resp, cacheHit, err := h.fetcher.fetchUserRewardsForBadge(login)
	switch {
	case errors.Is(err, errBadgeUnknownLogin):
		emitBadgeFetchedEvent(login, badgeUnknownTierName, cacheHit)
		return renderBadgeSVG(c, badgeStatusOK, badgeUnknownTierName, badgeUnknownTierColor, "", badgeCacheControlSuccess)
	case err != nil:
		slog.Error("[rewards/badge] upstream fetch failed", "login", login, "error", err)
		emitBadgeFetchedEvent(login, badgeErrorTierName, cacheHit)
		return renderBadgeSVG(c, badgeStatusBadGate, badgeErrorTierName, badgeErrorTierColor, "", badgeCacheControlError)
	}

	tier := rewards.GetContributorLevel(totalPointsFromResponse(resp))
	fill := tierColorHex(tier.Color)

	emitBadgeFetchedEvent(login, tier.Name, cacheHit)
	return renderBadgeSVG(c, badgeStatusOK, tier.Name, fill, tier.IconPath, badgeCacheControlSuccess)
}

// tierColorHex maps a Tailwind color-family name (from Tier.Color) to a
// concrete hex. Kept here (not in pkg/rewards) because it's a rendering
// concern — the tier data itself stays style-agnostic.
func tierColorHex(color string) string {
	switch color {
	case "gray":
		return "#6b7280"
	case "blue":
		return "#3b82f6"
	case "cyan":
		return "#06b6d4"
	case "green":
		return "#10b981"
	case "purple":
		return "#8b5cf6"
	case "orange":
		return "#f97316"
	case "red":
		return "#ef4444"
	case "yellow":
		return "#f59e0b"
	}
	// Unrecognized family — fall back to unknown-gray so the badge still
	// renders rather than emitting invalid SVG.
	return badgeUnknownTierColor
}

// badgeTemplateData is the shape the SVG template receives.
type badgeTemplateData struct {
	Label, Value                   string
	LabelColor, ValueColor         string
	Height, LabelWidth, ValueWidth int
	TotalWidth                     int
	LabelMid, ValueMid             int
	TextBaseline, TextShadow       int
	FontSize, CornerRadius         int
	IconPath                       string
	IconX, IconY, IconSize         int
}

// badgeSVGTemplate is a minimal shields.io-style two-segment pill with an optional icon.
// html/template escapes {{.Label}}/{{.Value}} so a crafted tier name could
// never inject raw SVG (defensive — tier names come from our own constant).
var badgeSVGTemplate = template.Must(template.New("badge").Funcs(template.FuncMap{
	"calcIconScale": func(size int) string {
		return fmt.Sprintf("%.3f", float64(size)/24.0)
	},
}).Parse(`<svg xmlns="http://www.w3.org/2000/svg" width="{{.TotalWidth}}" height="{{.Height}}" role="img" aria-label="{{.Label}}: {{.Value}}">
<linearGradient id="s" x2="0" y2="100%">
<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
<stop offset="1" stop-opacity=".1"/>
</linearGradient>
<clipPath id="r"><rect width="{{.TotalWidth}}" height="{{.Height}}" rx="{{.CornerRadius}}" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="{{.LabelWidth}}" height="{{.Height}}" fill="{{.LabelColor}}"/>
<rect x="{{.LabelWidth}}" width="{{.ValueWidth}}" height="{{.Height}}" fill="{{.ValueColor}}"/>
<rect width="{{.TotalWidth}}" height="{{.Height}}" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="{{.FontSize}}">
<text x="{{.LabelMid}}" y="{{.TextShadow}}" fill="#010101" fill-opacity=".3">{{.Label}}</text>
<text x="{{.LabelMid}}" y="{{.TextBaseline}}">{{.Label}}</text>
<text x="{{.ValueMid}}" y="{{.TextShadow}}" fill="#010101" fill-opacity=".3">{{.Value}}</text>
<text x="{{.ValueMid}}" y="{{.TextBaseline}}">{{.Value}}</text>
</g>
{{if .IconPath}}
<g transform="translate({{.IconX}},{{.IconY}}) scale({{calcIconScale .IconSize}})">
<path fill="#fff" d="{{.IconPath}}"/>
</g>
{{end}}
</svg>`))

func init() {
	// Template is initialized above with its FuncMap.
}

// renderBadgeSVG writes the SVG response + headers. All three paths (success,
// unknown, error) go through this single serializer.
func renderBadgeSVG(c *fiber.Ctx, status int, tierName, tierColor, iconPath, cacheControl string) error {
	data := badgeTemplateData{
		Label:        badgeLabelText,
		Value:        tierName,
		LabelColor:   badgeLabelColor,
		ValueColor:   tierColor,
		Height:       badgeHeightPx,
		LabelWidth:   badgeLabelWidthPx,
		ValueWidth:   badgeValueWidthPx,
		TotalWidth:   badgeTotalWidthPx,
		LabelMid:     badgeLabelMidPx,
		ValueMid:     badgeValueMidPx,
		TextBaseline: badgeTextBaselinePx,
		TextShadow:   badgeTextShadowPx,
		FontSize:     badgeFontSizePx,
		CornerRadius: badgeCornerRadiusPx,
		IconPath:     iconPath,
		IconX:        badgeIconX,
		IconY:        badgeIconY,
		IconSize:     badgeIconSize,
	}

	var buf bytes.Buffer
	if err := badgeSVGTemplate.Execute(&buf, data); err != nil {
		slog.Error("[rewards/badge] template execute failed", "error", err)
		c.Set(fiber.HeaderContentType, badgeContentType)
		c.Set(fiber.HeaderCacheControl, badgeCacheControlError)
		return c.Status(http.StatusInternalServerError).SendString(
			`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`,
		)
	}

	c.Set(fiber.HeaderContentType, badgeContentType)
	c.Set(fiber.HeaderCacheControl, cacheControl)
	return c.Status(status).Send(buf.Bytes())
}

// emitBadgeFetchedEvent is the GA4 emission seam. Phase 2 does NOT add an
// outbound network dependency — the codebase has no server-side GA4 helper
// (analytics_proxy.go is a client-forwarding proxy). We log at debug level;
// a future phase can wire mp.google-analytics.com behind the same env-gated
// config as the client proxy without changing this signature.
func emitBadgeFetchedEvent(login, tierName string, cacheHit bool) {
	sum := sha256.Sum256([]byte(login))
	hashHex := hex.EncodeToString(sum[:])
	if len(hashHex) > badgeLoginHashPrefixLen {
		hashHex = hashHex[:badgeLoginHashPrefixLen]
	}
	slog.Debug(
		"[rewards/badge] badge_fetched",
		"tier", tierName,
		"login_hashed", hashHex,
		"cache_hit", cacheHit,
	)
}
