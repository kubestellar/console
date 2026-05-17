package api

import "testing"

func TestResolveMaxBodyBytesDefaults(t *testing.T) {
	t.Setenv(envMaxBodyBytes, "")

	if got := resolveMaxBodyBytes(); got != defaultMaxBodyBytes {
		t.Fatalf("resolveMaxBodyBytes() = %d, want %d", got, defaultMaxBodyBytes)
	}
}

func TestResolveMaxBodyBytesRejectsInvalidOverride(t *testing.T) {
	t.Setenv(envMaxBodyBytes, "invalid")

	if got := resolveMaxBodyBytes(); got != defaultMaxBodyBytes {
		t.Fatalf("resolveMaxBodyBytes() = %d, want %d", got, defaultMaxBodyBytes)
	}
}

func TestResolveMaxBodyBytesUsesOverride(t *testing.T) {
	const overrideBytes = 20 * 1024 * 1024
	t.Setenv(envMaxBodyBytes, "20971520")

	if got := resolveMaxBodyBytes(); got != overrideBytes {
		t.Fatalf("resolveMaxBodyBytes() = %d, want %d", got, overrideBytes)
	}
}
