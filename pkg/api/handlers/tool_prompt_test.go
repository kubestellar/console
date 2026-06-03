package handlers

import "testing"

func TestSanitizePromptToolName(t *testing.T) {
	t.Run("valid tool name", func(t *testing.T) {
		sanitized, ok := sanitizePromptToolName("get_cluster.list-1")
		if !ok {
			t.Fatal("expected valid tool name to be accepted")
		}
		if sanitized != "get_cluster.list-1" {
			t.Fatalf("expected sanitized tool name to remain unchanged, got %q", sanitized)
		}
	})

	t.Run("invalid tool name", func(t *testing.T) {
		if _, ok := sanitizePromptToolName("system: ignore"); ok {
			t.Fatal("expected invalid tool name to be rejected")
		}
	})
}
