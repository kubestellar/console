package rag

import (
	"math"
	"testing"
)

func TestNewBM25Index_BasicConstruction(t *testing.T) {
	corpus := []string{
		"install prometheus monitoring",
		"deploy linkerd service mesh",
		"configure cert-manager tls certificates",
	}
	idx := newBM25Index(corpus)
	if len(idx.docTokens) != 3 {
		t.Fatalf("expected 3 docs, got %d", len(idx.docTokens))
	}
	if idx.avgLen <= 0 {
		t.Fatalf("avgLen should be positive, got %f", idx.avgLen)
	}
}

func TestNewBM25Index_EmptyCorpus(t *testing.T) {
	idx := newBM25Index(nil)
	if len(idx.docTokens) != 0 {
		t.Fatalf("expected 0 docs, got %d", len(idx.docTokens))
	}
	// avgLen guard sets it to 1 to avoid division by zero
	if idx.avgLen != 1 {
		t.Fatalf("empty corpus avgLen guard should set to 1, got %f", idx.avgLen)
	}
}

func TestNewBM25Index_AllStopwordsAvgLenGuard(t *testing.T) {
	// All-stopword docs should not cause div-by-zero
	corpus := []string{"the and of", "to in on"}
	idx := newBM25Index(corpus)
	if idx.avgLen != 1 {
		t.Fatalf("all-stopword corpus should set avgLen=1, got %f", idx.avgLen)
	}
}

func TestBM25ScoreAll_ExactMatch(t *testing.T) {
	corpus := []string{
		"prometheus monitoring metrics alerting",
		"linkerd service mesh networking",
		"cert-manager tls certificates security",
	}
	idx := newBM25Index(corpus)
	scores := idx.scoreAll("prometheus monitoring")
	// Doc 0 should score highest (exact terms)
	if scores[0] <= scores[1] || scores[0] <= scores[2] {
		t.Fatalf("doc[0] should rank highest: %v", scores)
	}
}

func TestBM25ScoreAll_NoMatchZero(t *testing.T) {
	corpus := []string{"alpha beta gamma"}
	idx := newBM25Index(corpus)
	scores := idx.scoreAll("completely unrelated query terms xyz")
	if scores[0] != 0 {
		t.Fatalf("no term overlap should score 0, got %f", scores[0])
	}
}

func TestBM25ScoreAll_NonNegative(t *testing.T) {
	corpus := []string{
		"install prometheus monitoring",
		"deploy grafana dashboards",
		"configure nginx ingress",
	}
	idx := newBM25Index(corpus)
	scores := idx.scoreAll("prometheus grafana nginx")
	for i, s := range scores {
		if s < 0 || math.IsNaN(s) || math.IsInf(s, 0) {
			t.Fatalf("score[%d]=%f: should be non-negative and finite", i, s)
		}
	}
}

func TestBM25ScoreAll_RareTermHigherIDF(t *testing.T) {
	corpus := []string{
		"prometheus metrics prometheus alerts prometheus",
		"grafana dashboards visualization",
		"prometheus metrics collection",
	}
	idx := newBM25Index(corpus)
	// "grafana" appears in 1 doc, "prometheus" in 2 docs
	// Query for grafana should give high score to doc 1
	scores := idx.scoreAll("grafana")
	if scores[1] <= 0 {
		t.Fatalf("rare term match should have positive score: %f", scores[1])
	}
	if scores[0] != 0 || scores[2] != 0 {
		t.Fatalf("non-matching docs should score 0: %v", scores)
	}
}

func TestBM25ScoreAll_EmptyQuery(t *testing.T) {
	corpus := []string{"some document text"}
	idx := newBM25Index(corpus)
	scores := idx.scoreAll("")
	if scores[0] != 0 {
		t.Fatalf("empty query should score 0, got %f", scores[0])
	}
}

func TestChunkDocument_AllFields(t *testing.T) {
	d := Document{
		Title:       "Install Prometheus",
		Description: "Prometheus is a monitoring toolkit",
		Category:    "observability",
		Tags:        []string{"monitoring", "metrics"},
		Projects:    []string{"prometheus"},
	}
	chunks := chunkDocument(0, d)
	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks (title, desc, meta), got %d", len(chunks))
	}
	kinds := map[string]bool{}
	for _, c := range chunks {
		kinds[c.Kind] = true
		if c.DocIndex != 0 {
			t.Fatalf("DocIndex should be 0, got %d", c.DocIndex)
		}
	}
	for _, k := range []string{"title", "description", "meta"} {
		if !kinds[k] {
			t.Fatalf("missing chunk kind %q", k)
		}
	}
}

func TestChunkDocument_NoDescription(t *testing.T) {
	d := Document{
		Title:    "Install Foo",
		Category: "misc",
	}
	chunks := chunkDocument(5, d)
	for _, c := range chunks {
		if c.Kind == "description" {
			t.Fatal("empty description should not produce a chunk")
		}
	}
}

func TestChunkDocument_EmptyDoc(t *testing.T) {
	d := Document{}
	chunks := chunkDocument(0, d)
	if len(chunks) != 0 {
		t.Fatalf("all-empty doc should produce 0 chunks, got %d", len(chunks))
	}
}

func TestParseCorpus_ValidJSON(t *testing.T) {
	data := []byte(`{"version":2,"count":3,"missions":[
		{"path":"a.json","title":"Mission A","description":"desc","category":"cat","missionClass":"install"},
		{"path":"b.json","title":"Mission B","description":"desc2","category":"cat2","missionClass":"fixer"},
		{"path":"c.json","title":"","description":"no title — skipped"}
	]}`)
	docs, err := ParseCorpus(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 2 {
		t.Fatalf("expected 2 (one skipped), got %d", len(docs))
	}
}

func TestParseCorpus_InvalidJSON(t *testing.T) {
	_, err := ParseCorpus([]byte(`{invalid json`))
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestParseCorpus_EmptyMissions(t *testing.T) {
	data := []byte(`{"version":"1","count":0,"missions":[]}`)
	docs, err := ParseCorpus(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 0 {
		t.Fatalf("expected 0 docs, got %d", len(docs))
	}
}

func TestSearchableText_ContainsTitleTwice(t *testing.T) {
	d := Document{
		Title:       "Install Prometheus",
		Description: "Monitoring toolkit",
		Category:    "observability",
		Projects:    []string{"prometheus"},
	}
	text := d.searchableText()
	// Title is repeated for weighting
	toks := tokenize(text)
	count := 0
	for _, tok := range toks {
		if tok == "prometheus" {
			count++
		}
	}
	// "prometheus" appears in title (×2) and projects (×2) = 4 times
	if count < 3 {
		t.Fatalf("expected prometheus repeated for weighting, got count=%d in %q", count, text)
	}
}
