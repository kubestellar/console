package federation

import "sync"

// registry holds the process-wide set of federation Providers. It is
// intentionally package-local; callers go through Register / All / Get so
// that tests can manipulate the set deterministically via Reset.
//
// PR A ships with the registry empty. Each subsequent provider PR (OCM in B,
// Karmada in C, CAPI in D, Clusternet/Liqo/KubeAdmiral in E) registers its
// own plugin in an init() on its package, and the cmd/kc-agent binary
// imports those packages with a blank identifier to trigger registration.
// Until PR B lands, the server returns empty slices for every read.
var (
	registryMu sync.RWMutex
	registry   = map[FederationProviderName]Provider{}
)

// Register adds p to the global registry. Overwrite is allowed to make test
// injection (and future hot-reload) straightforward; production providers
// each register a unique Name() so collisions never occur. Panics on a nil
// provider to catch init-order bugs loudly rather than silently swallowing.
func Register(p Provider) {
	if p == nil {
		panic("federation.Register: nil provider")
	}
	registryMu.Lock()
	defer registryMu.Unlock()
	registry[p.Name()] = p
}

// All returns every registered Provider in a stable iteration order. The
// returned slice is a copy — callers may mutate it without affecting the
// registry. Iteration order is lexicographic by provider name so test
// assertions don't flake on Go map randomization.
func All() []Provider {
	registryMu.RLock()
	defer registryMu.RUnlock()

	out := make([]Provider, 0, len(registry))
	for _, p := range registry {
		out = append(out, p)
	}
	sortProviders(out)
	return out
}

// Get returns the Provider registered under name, if any.
func Get(name FederationProviderName) (Provider, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	p, ok := registry[name]
	return p, ok
}

// Reset empties the registry. Exported only for tests — production code
// never calls it. Providers are expected to register once at init-time and
// remain for the process lifetime.
func Reset() {
	registryMu.Lock()
	defer registryMu.Unlock()
	registry = map[FederationProviderName]Provider{}
}

// sortProviders orders providers by Name() for stable iteration in All().
// Broken out so tests can exercise the ordering without reaching into the
// unexported registry map.
func sortProviders(ps []Provider) {
	// Insertion sort — N is at most 6 in this plan, so this is simpler than
	// sort.Slice and avoids allocating a comparator closure.
	for i := 1; i < len(ps); i++ {
		for j := i; j > 0 && ps[j-1].Name() > ps[j].Name(); j-- {
			ps[j-1], ps[j] = ps[j], ps[j-1]
		}
	}
}
