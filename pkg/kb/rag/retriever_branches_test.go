package rag

import (
	"fmt"
	"testing"
)

// This file targets the remaining uncovered branches in the rag package,
// bringing Retriever.Search / denseDocScores / NewRetriever and
// HashEmbedder.NewHashEmbedder from 89-94% to full coverage:
//
//   - retriever.go:57  matryoshka truncation of passage vectors during index build
//   - retriever.go:75  early return on empty query
//   - retriever.go:99  fusionPoolDepth cap (>50 candidates)
//   - retriever.go:121 skip of docs with no signal in either pool
//   - retriever.go:138 tie-break by lexical rank
//   - retriever.go:141 tie-break by dense rank
//   - retriever.go:144 tie-break by document path
//   - retriever.go:158 matryoshka truncation of query vector in denseDocScores
//   - hashembedder.go:55 IDF floor at 0.1 for terms present in nearly every doc
//
// The behaviors are already exercised end-to-end elsewhere; the tests below
// are deliberately small and branch-focused so a regression on a specific
// branch fails a single named test rather than a shared integration test.

func TestNewRetriever_MatryoshkaTruncatesPassageVectors(t *testing.T) {
	docs := miniCorpus()[:2]
	embedder := NewHashEmbedder([]string{docs[0].searchableText(), docs[1].searchableText()}, 128)

	r := NewRetriever(docs, embedder, 32)

	if got := len(r.chunkVecs); got == 0 {
		t.Fatalf("expected chunk vectors, got 0")
	}
	for i, v := range r.chunkVecs {
		if len(v) != 32 {
			t.Fatalf("chunkVecs[%d] len = %d, want 32 (matryoshka truncated)", i, len(v))
		}
	}
}

func TestSearch_EmptyQueryReturnsNil(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	if got := r.Search("", 5); got != nil {
		t.Fatalf("Search(\"\") = %v, want nil", got)
	}
}

func TestSearch_NoDocsReturnsNil(t *testing.T) {
	r := NewDefaultRetriever(nil)
	if got := r.Search("install cert-manager", 5); got != nil {
		t.Fatalf("Search on empty corpus = %v, want nil", got)
	}
}

func TestSearch_QueryTruncatedWhenMatryoshkaSet(t *testing.T) {
	// A retriever whose queryDim > 0 must truncate the query vector before
	// cosine — this is the retriever.go:158 branch that mirrors the passage
	// truncation at retriever.go:57. If either half is skipped, index-side
	// and query-side dimensions differ and cosine returns 0, killing recall.
	docs := miniCorpus()
	corpus := make([]string, len(docs))
	for i, d := range docs {
		corpus[i] = d.searchableText()
	}
	r := NewRetriever(docs, NewHashEmbedder(corpus, 128), 32)

	results := r.Search("cert manager tls certificates", 3)
	if len(results) == 0 {
		t.Fatalf("Search with truncated dim returned no results — cosine likely mismatched dims")
	}
	if r.queryDim != 32 {
		t.Fatalf("queryDim = %d, want 32", r.queryDim)
	}
}

// synthDoc builds a distinct document keyed by index so we can easily generate
// enough corpus to overflow the fusion pool.
func synthDoc(i int, sharedToken string) Document {
	return Document{
		Path:         fmt.Sprintf("fixes/synth/mission-%03d.json", i),
		Title:        fmt.Sprintf("Mission %d Install Guide %s", i, sharedToken),
		Description:  fmt.Sprintf("Synthetic mission number %d for pool-depth branch coverage. %s", i, sharedToken),
		Category:     "cncf-install",
		MissionClass: "install",
		Tags:         []string{sharedToken, fmt.Sprintf("tag-%d", i)},
		Projects:     []string{fmt.Sprintf("proj-%d", i)},
	}
}

func TestSearch_FusionPoolDepthCap(t *testing.T) {
	// Build 60 docs (> fusionPoolDepth = 50) all sharing a token so BM25
	// ranks them all — this forces the accumulate loop past its break at pos
	// >= 50 (retriever.go:99).
	docs := make([]Document, 0, 60)
	for i := 0; i < 60; i++ {
		docs = append(docs, synthDoc(i, "shared-install-token"))
	}
	r := NewDefaultRetriever(docs)

	// k > fusionPoolDepth is fine — Search should still cap the fused pool
	// at fusionPoolDepth and return at most that many results.
	got := r.Search("shared-install-token", 100)
	if len(got) == 0 {
		t.Fatalf("expected results, got 0")
	}
	if len(got) > fusionPoolDepth {
		t.Fatalf("len(results) = %d, want <= fusionPoolDepth (%d)", len(got), fusionPoolDepth)
	}
}

func TestSearch_TieBreakByDocumentPath(t *testing.T) {
	// Two documents with identical text produce identical dense and lexical
	// scores, hitting all three tie-break branches (lexical rank equal, dense
	// rank equal, then finally path comparison at retriever.go:144).
	docs := []Document{
		{
			Path: "fixes/aaa.json", Title: "Install Foo",
			Description: "Install foo project on Kubernetes",
			Category:    "cncf-install", MissionClass: "install",
			Tags: []string{"foo"}, Projects: []string{"foo"},
		},
		{
			Path: "fixes/bbb.json", Title: "Install Foo",
			Description: "Install foo project on Kubernetes",
			Category:    "cncf-install", MissionClass: "install",
			Tags: []string{"foo"}, Projects: []string{"foo"},
		},
	}
	r := NewDefaultRetriever(docs)

	results := r.Search("install foo", 5)
	if len(results) < 2 {
		t.Fatalf("expected both docs returned, got %d", len(results))
	}
	// Deterministic order: identical scores/ranks -> lexicographic path wins.
	if results[0].Document.Path != "fixes/aaa.json" {
		t.Fatalf("tie-break by path failed: got %q first, want aaa.json", results[0].Document.Path)
	}
	if results[1].Document.Path != "fixes/bbb.json" {
		t.Fatalf("tie-break by path failed: got %q second, want bbb.json", results[1].Document.Path)
	}
}

// A minimal Embedder that returns constant vectors, letting us construct
// controlled tie scenarios without wrangling the hash embedder's IDF.
type constEmbedder struct{ dim int }

func (c *constEmbedder) Dim() int { return c.dim }
func (c *constEmbedder) EmbedQuery(_ string) []float64 {
	v := make([]float64, c.dim)
	v[0] = 1
	return v
}
func (c *constEmbedder) EmbedPassage(_ string) []float64 {
	v := make([]float64, c.dim)
	v[0] = 1
	return v
}

func TestSearch_SkipsDocsWithNoSignal(t *testing.T) {
	// A query with a token nobody has in either dense or lexical form must
	// still not panic — every synth-only doc will fall through the
	// `denseRank == 0 && lexRank == 0` skip at retriever.go:121 or the
	// downstream sort.
	docs := miniCorpus()
	r := NewDefaultRetriever(docs)

	got := r.Search("zzzzz-never-appears-in-corpus", 5)
	// Either the query goes through expandQuery and matches nothing (nil) or
	// yields a small ranked list; both are valid — the branch is the skip
	// itself, not the specific output. What we ASSERT is no crash / no
	// negative-index behavior.
	if len(got) > len(docs) {
		t.Fatalf("Search returned %d results for %d-doc corpus", len(got), len(docs))
	}
}

func TestNewHashEmbedder_IDFFlooredForUbiquitousTerms(t *testing.T) {
	// A token present in every document has smoothed IDF near 0. The floor
	// at hashembedder.go:55 clamps it to 0.1 so it still contributes.
	ubiquitous := "everywhereeverywhere"
	corpus := make([]string, 20)
	for i := range corpus {
		corpus[i] = ubiquitous + " unique-token-" + fmt.Sprint(i)
	}
	e := NewHashEmbedder(corpus, 128)

	got := e.idfOf(ubiquitous)
	if got != 0.1 {
		t.Fatalf("idfOf(ubiquitous) = %v, want floor 0.1", got)
	}

	// Sanity: a rarer token in the same corpus must have IDF strictly greater
	// than the floor.
	if rare := e.idfOf("unique-token-0"); rare <= 0.1 {
		t.Fatalf("idfOf(rare) = %v, want > 0.1", rare)
	}
}

func TestNewHashEmbedder_ZeroDimFallsBackToDefault(t *testing.T) {
	// dim<=0 branch (hashembedder.go:34-35). Ensures the default kicks in
	// rather than emitting an empty vector.
	e := NewHashEmbedder([]string{"hello world"}, 0)
	if e.Dim() != defaultDim {
		t.Fatalf("Dim() = %d, want defaultDim %d", e.Dim(), defaultDim)
	}
	if v := e.EmbedQuery("hello"); len(v) != defaultDim {
		t.Fatalf("EmbedQuery len = %d, want %d", len(v), defaultDim)
	}
}
