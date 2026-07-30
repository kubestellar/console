package federation

import "testing"

func TestRegistry_RegisterOverwriteReplacesProviderAndAllReturnsCopy(t *testing.T) {
	Reset()
	defer Reset()

	first := &fakeProvider{name: ProviderOCM}
	replacement := &fakeProvider{name: ProviderOCM}
	Register(first)
	Register(replacement)

	got, ok := Get(ProviderOCM)
	if !ok || got != replacement {
		t.Fatalf("Get should return replacement provider: ok=%v got=%v", ok, got)
	}

	all := All()
	if len(all) != 1 {
		t.Fatalf("All returned %d providers, want 1", len(all))
	}
	all[0] = first

	got, ok = Get(ProviderOCM)
	if !ok || got != replacement {
		t.Fatalf("mutating All() result should not affect registry: ok=%v got=%v", ok, got)
	}
}
