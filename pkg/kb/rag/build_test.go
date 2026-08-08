package rag

import (
	"math"
	"strings"
	"testing"
)

func TestDefaultDim_MatchesInternal(t *testing.T) {
	if DefaultDim != defaultDim {
		t.Fatalf("DefaultDim (%d) must mirror internal defaultDim (%d)", DefaultDim, defaultDim)
	}
	if DefaultDim <= 0 {
		t.Fatalf("DefaultDim must be positive, got %d", DefaultDim)
	}
}

func TestNewDefaultRetriever_BuildsQueryableRetriever(t *testing.T) {
	docs := miniCorpus()
	r := NewDefaultRetriever(docs)
	if r == nil {
		t.Fatal("NewDefaultRetriever returned nil")
	}
	if r.Len() != len(docs) {
		t.Fatalf("Len() = %d, want %d", r.Len(), len(docs))
	}

	// The default retriever must be immediately searchable and return sensible
	// hits for an on-topic query (cert-manager is doc 0 in miniCorpus).
	hits := r.Search("cert-manager tls", 3)
	if len(hits) == 0 {
		t.Fatal("expected at least one hit from NewDefaultRetriever")
	}
	if !strings.Contains(strings.ToLower(hits[0].Document.Title), "cert manager") {
		t.Errorf("top hit should be the cert-manager doc, got %q", hits[0].Document.Title)
	}
}

func TestNewDefaultRetriever_EmptyCorpus(t *testing.T) {
	r := NewDefaultRetriever(nil)
	if r == nil {
		t.Fatal("NewDefaultRetriever(nil) returned nil")
	}
	if r.Len() != 0 {
		t.Fatalf("Len() = %d, want 0", r.Len())
	}
	if hits := r.Search("anything", 5); hits != nil {
		t.Errorf("empty corpus should return nil hits, got %v", hits)
	}
}

func TestNewDefaultRetrieverFromIndex_ValidPayload(t *testing.T) {
	payload := []byte(`{
		"version": "1",
		"count": 2,
		"missions": [
			{"path":"a","title":"Install Prometheus","description":"metrics collection","category":"observability","tags":["monitoring"],"cncfProjects":["prometheus"]},
			{"path":"b","title":"Install Grafana","description":"visualization dashboards","category":"observability","tags":["dashboards"],"cncfProjects":["grafana"]}
		]
	}`)
	r, err := NewDefaultRetrieverFromIndex(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r == nil {
		t.Fatal("retriever is nil")
	}
	if r.Len() != 2 {
		t.Fatalf("Len() = %d, want 2", r.Len())
	}
	hits := r.Search("prometheus", 2)
	if len(hits) == 0 {
		t.Fatal("expected hits for 'prometheus'")
	}
}

func TestNewDefaultRetrieverFromIndex_SkipsTitlelessMissions(t *testing.T) {
	// ParseCorpus drops entries without a title; the retriever should reflect that.
	payload := []byte(`{
		"missions": [
			{"path":"a","title":"Has Title"},
			{"path":"b","title":""}
		]
	}`)
	r, err := NewDefaultRetrieverFromIndex(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Len() != 1 {
		t.Fatalf("expected 1 doc after title filter, got %d", r.Len())
	}
}

func TestNewDefaultRetrieverFromIndex_MalformedJSON(t *testing.T) {
	_, err := NewDefaultRetrieverFromIndex([]byte(`{not json`))
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
	if !strings.Contains(err.Error(), "parse kb index") {
		t.Errorf("error should be wrapped by ParseCorpus, got %q", err.Error())
	}
}

func TestRetriever_Len(t *testing.T) {
	// Len is trivially safe on an empty retriever built the low-level way.
	empty := NewRetriever(nil, NewHashEmbedder(nil, DefaultDim), 0)
	if empty.Len() != 0 {
		t.Errorf("empty retriever Len() = %d, want 0", empty.Len())
	}

	docs := miniCorpus()
	r := NewDefaultRetriever(docs)
	if got, want := r.Len(), len(docs); got != want {
		t.Errorf("Len() = %d, want %d", got, want)
	}
}

func TestRankOrLast(t *testing.T) {
	// rank == 0 signals "absent"; it must sort after any real rank.
	if got := rankOrLast(0); got != math.MaxInt32 {
		t.Errorf("rankOrLast(0) = %d, want MaxInt32", got)
	}
	for _, rank := range []int{1, 2, 42, math.MaxInt32 - 1} {
		if got := rankOrLast(rank); got != rank {
			t.Errorf("rankOrLast(%d) = %d, want %d", rank, got, rank)
		}
	}
	// Present ranks must sort ahead of absent ranks.
	if rankOrLast(1) >= rankOrLast(0) {
		t.Error("present rank (1) must sort ahead of absent rank (0)")
	}
}
