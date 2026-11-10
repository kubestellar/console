package observer

import (
	"context"
	"log/slog"
	"strings"

	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

// resolveProviderForUser returns a Resolve result that prefers the user's
// per-user default provider (saved by the Stellar settings UI in
// stellar_provider_configs) over the global registry default. Falls through to
// the registry's default when the store doesn't implement the lookup or the
// user has no saved provider.
func (o *Observer) resolveProviderForUser(ctx context.Context, userID string) providers.ResolvedProvider {
	if userID == "" {
		return o.registry.Resolve("", "", nil)
	}
	type providerLookup interface {
		GetUserDefaultProvider(ctx context.Context, userID string) (*store.StellarProviderConfig, error)
	}
	lookup, ok := o.store.(providerLookup)
	if !ok {
		return o.registry.Resolve("", "", nil)
	}
	cfg, err := lookup.GetUserDefaultProvider(ctx, userID)
	if err != nil || cfg == nil {
		return o.registry.Resolve("", "", nil)
	}
	// We have a stored config — translate to a transient Provider instance via
	// the registry's known global providers if the name matches. We don't
	// decrypt the api_key here; the registry's global providers are what carry
	// the working creds (loaded from env at startup).
	p, gok := o.registry.GetGlobal(cfg.Provider)
	if !gok {
		// User picked a provider not in the global registry (e.g., their api
		// key is per-user only). Without a usable Provider instance, fall back.
		return o.registry.Resolve("", "", nil)
	}
	model := strings.TrimSpace(cfg.Model)
	userCfg := &providers.ResolvedUserProvider{Provider: p, Model: model, ConfigID: cfg.ID}
	return o.registry.Resolve("", "", userCfg)
}

// resolveScannerProvider returns a provider optimised for background batch
// scans: prefers local Ollama (cheap, no API cost) and falls back to a cloud
// provider when Ollama is unavailable.  Used for proactive nudges and watch
// refresh — paths where the user is not waiting interactively.
func (o *Observer) resolveScannerProvider(ctx context.Context, userID string) providers.ResolvedProvider {
	p, model, err := o.registry.ResolveScannerProvider(ctx, userID)
	if err != nil || p == nil {
		slog.Debug("stellar/observer: scanner provider unavailable, falling back to user provider", "userID", userID, "error", err)
		return o.resolveProviderForUser(ctx, userID)
	}
	return providers.ResolvedProvider{Provider: p, Model: model, Source: "scanner"}
}
