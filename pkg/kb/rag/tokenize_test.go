package rag

import (
	"reflect"
	"testing"
)

func TestTokenize_BasicSplitting(t *testing.T) {
	got := tokenize("Install Cert-Manager on Kubernetes")
	want := []string{"install", "cert", "manager", "kubernetes"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestTokenize_StopwordsRemoved(t *testing.T) {
	got := tokenize("how do I use the kubernetes for my cluster")
	// "how", "do", "use", "the", "for", "my" are stopwords
	want := []string{"kubernetes", "cluster"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestTokenize_ShortTokensDropped(t *testing.T) {
	got := tokenize("I am a go dev")
	// "am", "go" are 2 chars but "am" is a stopword; "go" passes minTokenLen=2
	// "I" and "a" are 1 char — dropped
	// "dev" passes
	for _, tok := range got {
		if len(tok) < minTokenLen {
			t.Fatalf("token %q is shorter than minTokenLen=%d", tok, minTokenLen)
		}
	}
}

func TestTokenize_EmptyInput(t *testing.T) {
	got := tokenize("")
	if len(got) != 0 {
		t.Fatalf("expected empty slice, got %v", got)
	}
}

func TestTokenize_AllStopwords(t *testing.T) {
	got := tokenize("the and of to in on at by")
	if len(got) != 0 {
		t.Fatalf("all-stopword input should produce empty, got %v", got)
	}
}

func TestTokenize_NumericTokens(t *testing.T) {
	got := tokenize("kubernetes 1.28 has port 443")
	// "28", "443" survive (numeric, >= 2 chars); "1" doesn't (len 1)
	// "has" is a stopword
	found := map[string]bool{}
	for _, tok := range got {
		found[tok] = true
	}
	if !found["kubernetes"] {
		t.Fatal("expected 'kubernetes'")
	}
	if !found["443"] {
		t.Fatal("expected '443'")
	}
	if !found["28"] {
		t.Fatal("expected '28'")
	}
}

func TestTokenize_SpecialCharSplitting(t *testing.T) {
	got := tokenize("cert_manager.io/v1alpha2")
	// Split on non-alphanumeric: "cert", "manager", "io", "v1alpha2"
	found := map[string]bool{}
	for _, tok := range got {
		found[tok] = true
	}
	if !found["cert"] {
		t.Fatal("expected 'cert'")
	}
	if !found["manager"] {
		t.Fatal("expected 'manager'")
	}
	if !found["v1alpha2"] {
		t.Fatal("expected 'v1alpha2'")
	}
}

func TestCharTrigrams_Normal(t *testing.T) {
	got := charTrigrams("abc")
	// "#abc#" -> ["#ab", "abc", "bc#"]
	want := []string{"#ab", "abc", "bc#"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestCharTrigrams_Short(t *testing.T) {
	// Single char token: "#a#" has length 3, exactly one trigram
	got := charTrigrams("a")
	if len(got) != 1 || got[0] != "#a#" {
		t.Fatalf("single char: got %v", got)
	}
}

func TestCharTrigrams_Empty(t *testing.T) {
	got := charTrigrams("")
	// "#" + "" + "#" = "##" — length 2, less than 3
	if got != nil {
		t.Fatalf("empty token should return nil, got %v", got)
	}
}

func TestCharTrigrams_LongerToken(t *testing.T) {
	got := charTrigrams("helm")
	// "#helm#" -> ["#he", "hel", "elm", "lm#"]
	if len(got) != 4 {
		t.Fatalf("expected 4 trigrams for 'helm', got %d: %v", len(got), got)
	}
}
