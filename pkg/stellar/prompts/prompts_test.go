package prompts

import (
	"strings"
	"testing"
)

func TestPromptConstantsAreNonEmpty(t *testing.T) {
	prompts := map[string]string{
		"QuickAsk":           QuickAsk,
		"EventNarration":     EventNarration,
		"Digest":             Digest,
		"MissionExecution":   MissionExecution,
		"ObserverCheck":      ObserverCheck,
		"WatchFollowThrough": WatchFollowThrough,
	}

	for name, prompt := range prompts {
		if strings.TrimSpace(prompt) == "" {
			t.Fatalf("%s should not be empty", name)
		}
	}
}

func TestQuickAskIncludesWatchToken(t *testing.T) {
	if !strings.Contains(QuickAsk, "WATCH:") {
		t.Fatal("QuickAsk should contain WATCH:")
	}
}

func TestObserverCheckIncludesRequiredTokens(t *testing.T) {
	for _, token := range []string{"SURFACE:", "NOTHING", "SUGGEST:"} {
		if !strings.Contains(ObserverCheck, token) {
			t.Fatalf("ObserverCheck should contain %s", token)
		}
	}
}
