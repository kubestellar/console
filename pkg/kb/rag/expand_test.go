package rag

import (
	"sort"
	"strings"
	"testing"
)

// tokensOf splits an expanded query on whitespace so tests can compare sets
// without depending on internal ordering.
func tokensOf(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Fields(s)
}

func TestExpandQuery_EmptyReturnsEmpty(t *testing.T) {
	if got := expandQuery(""); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}

func TestExpandQuery_NoMatchReturnsOriginal(t *testing.T) {
	q := "some arbitrary phrase"
	if got := expandQuery(q); got != q {
		t.Fatalf("expected unchanged %q, got %q", q, got)
	}
}

func TestExpandQuery_PreservesOriginalPrefix(t *testing.T) {
	q := "Monitor my cluster"
	got := expandQuery(q)
	if !strings.HasPrefix(got, q+" ") {
		t.Fatalf("expected result to start with original query %q, got %q", q, got)
	}
}

func TestExpandQuery_AddsSynonyms(t *testing.T) {
	got := expandQuery("monitor")
	toks := tokensOf(got)
	// original + expansions for "monitor"
	wantContains := []string{"monitor", "monitoring", "prometheus", "grafana", "observability", "metrics"}
	for _, w := range wantContains {
		if !containsToken(toks, w) {
			t.Errorf("expected token %q in %v", w, toks)
		}
	}
}

func TestExpandQuery_NoDuplicateSynonyms(t *testing.T) {
	// "logs" and "logging" cross-reference each other; the result must not
	// contain duplicate tokens.
	got := expandQuery("logs logging")
	toks := tokensOf(got)
	seen := map[string]int{}
	for _, tk := range toks {
		seen[tk]++
	}
	for tk, n := range seen {
		if n > 1 {
			t.Errorf("token %q appears %d times in %v", tk, n, toks)
		}
	}
}

func TestExpandQuery_SynonymEqualToExistingTokenNotDuplicated(t *testing.T) {
	// "ingress" maps to a list that includes "ingress" itself; it must not be
	// re-appended.
	got := expandQuery("ingress")
	toks := tokensOf(got)
	count := 0
	for _, tk := range toks {
		if tk == "ingress" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly one 'ingress' token, got %d in %v", count, toks)
	}
}

func TestExpandQuery_CaseInsensitiveMatch(t *testing.T) {
	// Concept expansions are matched against lowercased tokens (from
	// tokenize), so capitalized inputs must still expand.
	got := expandQuery("Monitoring")
	if !strings.Contains(strings.ToLower(got), "prometheus") {
		t.Fatalf("expected prometheus expansion for 'Monitoring', got %q", got)
	}
}

func TestExpandQuery_MultipleConceptsMerged(t *testing.T) {
	got := expandQuery("tls backup")
	toks := tokensOf(got)
	// From "tls": cert-manager, certificates. From "backup": backups, velero,
	// etcd, disaster-recovery. Verify at least one from each concept is present.
	if !containsToken(toks, "certificates") && !containsToken(toks, "cert-manager") {
		t.Errorf("expected tls expansions in %v", toks)
	}
	if !containsToken(toks, "velero") {
		t.Errorf("expected backup expansions in %v", toks)
	}
}

func TestExpandQuery_ExpansionsAreDeterministic(t *testing.T) {
	// Same input must produce the same output twice — guards against a future
	// refactor that iterates a map without ordering the walk over query tokens.
	q := "monitor logs"
	a := expandQuery(q)
	b := expandQuery(q)
	if a != b {
		t.Fatalf("non-deterministic expansion: %q vs %q", a, b)
	}
	// And the multiset of tokens must be stable.
	ta := tokensOf(a)
	sort.Strings(ta)
	tb := tokensOf(b)
	sort.Strings(tb)
	if strings.Join(ta, " ") != strings.Join(tb, " ") {
		t.Fatalf("token sets differ: %v vs %v", ta, tb)
	}
}

func containsToken(toks []string, want string) bool {
	for _, t := range toks {
		if t == want {
			return true
		}
	}
	return false
}
