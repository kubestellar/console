package rag

import (
	"encoding/json"
	"fmt"
)

// kbIndexFile mirrors the shape of the knowledge base's fixes/index.json, the
// aggregated catalog of every mission and runbook. Building the corpus from
// this single file (rather than reading ~1600 mission JSONs) keeps startup
// fast and the dependency surface tiny.
type kbIndexFile struct {
	// Version is intentionally ignored (it has varied between string and number
	// across index generations); decoded as raw to stay tolerant.
	Version  json.RawMessage `json:"version"`
	Count    int             `json:"count"`
	Missions []Document      `json:"missions"`
}

// ParseCorpus decodes a fixes/index.json payload into Documents. Entries
// without a title are skipped as unusable for retrieval.
func ParseCorpus(indexJSON []byte) ([]Document, error) {
	var f kbIndexFile
	if err := json.Unmarshal(indexJSON, &f); err != nil {
		return nil, fmt.Errorf("parse kb index: %w", err)
	}
	docs := make([]Document, 0, len(f.Missions))
	for _, m := range f.Missions {
		if m.Title == "" {
			continue
		}
		docs = append(docs, m)
	}
	return docs, nil
}

// chunkDocument splits a document into late-chunking units. The query is later
// matched against each chunk independently and the document takes its best
// chunk's score, so a query about an install step matches even when the title
// is generic.
func chunkDocument(docIndex int, d Document) []Chunk {
	chunks := make([]Chunk, 0, 3)
	if d.Title != "" {
		chunks = append(chunks, Chunk{DocIndex: docIndex, Kind: "title", Text: d.Title})
	}
	if d.Description != "" {
		chunks = append(chunks, Chunk{DocIndex: docIndex, Kind: "description", Text: d.Description})
	}
	meta := ""
	for _, p := range d.Projects {
		meta += p + " "
	}
	for _, t := range d.Tags {
		meta += t + " "
	}
	if d.Category != "" {
		meta += d.Category
	}
	if meta != "" {
		chunks = append(chunks, Chunk{DocIndex: docIndex, Kind: "meta", Text: meta})
	}
	return chunks
}
