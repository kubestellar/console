package stellar

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

func readListLimit(c *fiber.Ctx) int {
	limit := stellarDefaultListLimit
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	if limit > stellarMaxListLimit {
		limit = stellarMaxListLimit
	}
	return limit
}

func readListOffset(c *fiber.Ctx) int {
	offset := 0
	if raw := strings.TrimSpace(c.Query("offset")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			offset = v
		}
	}
	return offset
}

func resolveStellarUserID(c *fiber.Ctx) string {
	if id := middleware.GetUserID(c); id != uuid.Nil {
		return id.String()
	}
	if login := middleware.GetGitHubLogin(c); login != "" {
		return login
	}
	return ""
}

func writeSSE(w *bufio.Writer, event string, data interface{}) error {
	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload); err != nil {
		return err
	}
	return w.Flush()
}

func estimateTokens(text string) int {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) == 0 {
		return 0
	}
	// Approximation that is deterministic and cheap: ~4 chars/token.
	return len(runes)/4 + 1
}

func extractObservationSuggest(detail string) string {
	raw := strings.TrimSpace(detail)
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToUpper(raw), "SUGGEST:") {
		return strings.TrimSpace(raw[len("SUGGEST:"):])
	}
	return ""
}

func firstOrUnknown(items []string) string {
	if len(items) == 0 {
		return "unknown"
	}
	return items[0]
}

func (h *Handler) resolveProviderAndModel(ctx context.Context, userID, preferredProvider, preferredModel string) (providers.ResolvedProvider, error) {
	if h.providerRegistry == nil {
		h.providerRegistry = providers.NewRegistry()
	}
	userCfg, err := h.resolveUserProvider(ctx, userID)
	if err != nil {
		return providers.ResolvedProvider{}, err
	}
	return h.providerRegistry.Resolve(preferredProvider, preferredModel, userCfg), nil
}

func (h *Handler) resolveUserProvider(ctx context.Context, userID string) (*providers.ResolvedUserProvider, error) {
	providerStore, ok := h.store.(interface {
		GetUserDefaultProvider(context.Context, string) (*store.StellarProviderConfig, error)
	})
	if !ok {
		return nil, nil
	}
	cfg, err := providerStore.GetUserDefaultProvider(ctx, userID)
	if err != nil || cfg == nil {
		return nil, err
	}
	rawKey := ""
	if len(cfg.APIKeyEnc) > 0 {
		rawKey, err = providers.DecryptAPIKey(cfg.APIKeyEnc)
		if err != nil {
			return nil, err
		}
	}
	def := providers.ProviderDefaults[cfg.Provider]
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = def.BaseURL
	}
	validatedBaseURL, err := validateStellarProviderBaseURL(cfg.Provider, baseURL)
	if err != nil {
		return nil, err
	}
	var p providers.Provider
	switch cfg.Provider {
	case "ollama":
		p = providers.NewOllama(validatedBaseURL)
	case "anthropic":
		p = providers.NewAnthropicProvider(rawKey)
	default:
		p = providers.NewOpenAICompat(validatedBaseURL, rawKey, cfg.Provider)
	}
	model := cfg.Model
	if model == "" {
		model = def.DefaultModel
	}
	return &providers.ResolvedUserProvider{Provider: p, Model: model, ConfigID: cfg.ID}, nil
}

func scoreAndSortMemories(memories []store.StellarMemoryEntry) []store.StellarMemoryEntry {
	scored := make([]store.StellarMemoryEntry, 0, len(memories))
	scored = append(scored, memories...)
	sort.Slice(scored, func(i, j int) bool {
		iScore := memoryScore(scored[i])
		jScore := memoryScore(scored[j])
		if iScore == jScore {
			return scored[i].CreatedAt.After(scored[j].CreatedAt)
		}
		return iScore > jScore
	})
	return scored
}

func memoryScore(memory store.StellarMemoryEntry) float64 {
	hours := time.Since(memory.CreatedAt).Hours()
	return float64(memory.Importance*10) - hours
}

func priorityLabel(priority int) string {
	switch {
	case priority <= 3:
		return "HIGH"
	case priority <= 6:
		return "MED"
	default:
		return "LOW"
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func splitEventObjectKind(object string) string {
	parts := strings.SplitN(strings.TrimSpace(object), "/", 2)
	if len(parts) == 2 {
		return parts[0]
	}
	return "Object"
}

func splitEventObjectName(object string) string {
	parts := strings.SplitN(strings.TrimSpace(object), "/", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "unknown"
}

func inferSeverity(eventType, reason string) string {
	if strings.EqualFold(strings.TrimSpace(eventType), "warning") {
		if isCriticalReason(reason) {
			return "critical"
		}
		return "warning"
	}
	return "info"
}

func isCriticalReason(reason string) bool {
	criticals := []string{"OOM", "BackOff", "Failed", "FailedMount", "Evicted", "NodeNotReady", "CrashLoopBackOff"}
	for _, candidate := range criticals {
		if strings.Contains(reason, candidate) {
			return true
		}
	}
	return false
}

func isDestructiveAction(t string) bool {
	return t == "DeleteCluster" || t == "DeletePod" || t == "CordonNode"
}

func ptr[T any](v T) *T { return &v }

func truncateString(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
