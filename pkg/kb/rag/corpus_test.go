package rag

import (
	"strings"
	"testing"
)

func TestParseCorpus_ValidPayload(t *testing.T) {
	payload := []byte(`{
		"version": "1",
		"count": 2,
		"missions": [
			{"path":"a","title":"Install Prometheus","description":"metrics","category":"observability","tags":["monitoring"],"cncfProjects":["prometheus"]},
			{"path":"b","title":"Install Grafana","description":"dashboards"}
		]
	}`)
	docs, err := ParseCorpus(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 2 {
		t.Fatalf("expected 2 docs, got %d", len(docs))
	}
	if docs[0].Title != "Install Prometheus" || docs[1].Title != "Install Grafana" {
		t.Fatalf("unexpected titles: %q, %q", docs[0].Title, docs[1].Title)
	}
	if len(docs[0].Tags) != 1 || docs[0].Tags[0] != "monitoring" {
		t.Errorf("tags not decoded: %v", docs[0].Tags)
	}
	if len(docs[0].Projects) != 1 || docs[0].Projects[0] != "prometheus" {
		t.Errorf("projects not decoded: %v", docs[0].Projects)
	}
}

func TestParseCorpus_VersionAsNumber(t *testing.T) {
	// Version has varied between string and number across generations; both
	// forms must decode without error.
	payload := []byte(`{"version": 7, "count": 1, "missions": [{"path":"a","title":"Foo"}]}`)
	docs, err := ParseCorpus(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 1 {
		t.Fatalf("expected 1 doc, got %d", len(docs))
	}
}

func TestParseCorpus_SkipsMissingTitles(t *testing.T) {
	payload := []byte(`{
		"count": 3,
		"missions": [
			{"path":"a","title":"Kept"},
			{"path":"b","title":""},
			{"path":"c"}
		]
	}`)
	docs, err := ParseCorpus(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 1 {
		t.Fatalf("expected 1 doc after title filter, got %d", len(docs))
	}
	if docs[0].Title != "Kept" {
		t.Errorf("wrong doc kept: %+v", docs[0])
	}
}

func TestParseCorpus_EmptyMissions(t *testing.T) {
	docs, err := ParseCorpus([]byte(`{"count":0,"missions":[]}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(docs) != 0 {
		t.Fatalf("expected zero docs, got %d", len(docs))
	}
}

func TestParseCorpus_InvalidJSON(t *testing.T) {
	_, err := ParseCorpus([]byte("not json"))
	if err == nil {
		t.Fatal("expected error for invalid JSON, got nil")
	}
	if !strings.Contains(err.Error(), "parse kb index") {
		t.Errorf("expected wrapped error message, got %q", err.Error())
	}
}

func TestChunkDocument_FullDocumentProducesThreeChunks(t *testing.T) {
	d := Document{
		Title:       "Install cert-manager",
		Description: "TLS on kubernetes",
		Category:    "security",
		Tags:        []string{"tls", "certificates"},
		Projects:    []string{"cert-manager"},
	}
	chunks := chunkDocument(4, d)
	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d: %+v", len(chunks), chunks)
	}
	kinds := map[string]string{}
	for _, c := range chunks {
		if c.DocIndex != 4 {
			t.Errorf("chunk DocIndex = %d, want 4", c.DocIndex)
		}
		kinds[c.Kind] = c.Text
	}
	if kinds["title"] != "Install cert-manager" {
		t.Errorf("title chunk wrong: %q", kinds["title"])
	}
	if kinds["description"] != "TLS on kubernetes" {
		t.Errorf("description chunk wrong: %q", kinds["description"])
	}
	// meta concatenates projects, tags, and category
	meta := kinds["meta"]
	for _, expect := range []string{"cert-manager", "tls", "certificates", "security"} {
		if !strings.Contains(meta, expect) {
			t.Errorf("expected meta to contain %q, got %q", expect, meta)
		}
	}
}

func TestChunkDocument_TitleOnly(t *testing.T) {
	chunks := chunkDocument(0, Document{Title: "Only Title"})
	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0].Kind != "title" || chunks[0].Text != "Only Title" {
		t.Errorf("wrong chunk: %+v", chunks[0])
	}
}

func TestChunkDocument_EmptyDocumentProducesNoChunks(t *testing.T) {
	chunks := chunkDocument(0, Document{})
	if len(chunks) != 0 {
		t.Fatalf("expected 0 chunks for empty doc, got %d: %+v", len(chunks), chunks)
	}
}

func TestChunkDocument_MetaFromTagsOnly(t *testing.T) {
	// A document with only tags (no projects, no category) should still get a
	// meta chunk.
	chunks := chunkDocument(2, Document{Title: "T", Tags: []string{"observability"}})
	var meta string
	found := false
	for _, c := range chunks {
		if c.Kind == "meta" {
			meta = c.Text
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a meta chunk, got %+v", chunks)
	}
	if !strings.Contains(meta, "observability") {
		t.Errorf("meta missing tag: %q", meta)
	}
}

func TestChunkDocument_NoMetaWhenAllEmpty(t *testing.T) {
	// Title + description but no metadata fields: only 2 chunks.
	chunks := chunkDocument(0, Document{Title: "T", Description: "D"})
	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d: %+v", len(chunks), chunks)
	}
	for _, c := range chunks {
		if c.Kind == "meta" {
			t.Errorf("did not expect meta chunk, got %+v", c)
		}
	}
}
