// Package rag implements a self-hosted retrieval system over the KubeStellar
// Console knowledge base (CNCF install missions, fixer missions, and operational
// runbooks). It lets the AI agent retrieve relevant missions semantically
// instead of relying on brittle exact-slug matching.
//
// # Design
//
// The architecture is inspired by modern embedding retrieval stacks (notably
// jina-embeddings-v5) but uses NO external API or proprietary model — everything
// runs in-process so the console keeps working in air-gapped deployments. The
// Jina-inspired techniques applied here are:
//
//   - Asymmetric encoding: queries and passages are embedded differently
//     (EmbedQuery vs EmbedPassage), matching the "Query:"/"Document:" prefix idea.
//   - Matryoshka representation: vectors can be truncated to a smaller dimension
//     (Truncate) and stay useful, trading recall for memory/speed.
//   - Binary quantization: vectors can be packed to 1-bit-per-dim codes
//     (Quantize) for cheap Hamming pre-filtering at scale.
//   - Hybrid retrieval: a dense vector signal is fused with BM25 lexical scoring
//     via Reciprocal Rank Fusion (RRF), which is robust when either signal is
//     weak.
//   - Late chunking: a mission is split into title/description/tag chunks so a
//     query can match the most relevant part, not just the whole-document blob.
//
// The default Embedder (HashEmbedder) is a zero-dependency dense encoder. It is
// deliberately model-free so the package builds and runs anywhere; the Embedder
// interface is the seam where a neural model (ONNX / pure-Go transformer) can be
// dropped in later without touching the retriever.
package rag

// Document is one searchable knowledge-base entry (a mission or runbook).
// It carries enough metadata for the agent to act on the result and to fetch
// the full mission file via Path.
type Document struct {
	Path         string   `json:"path"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Category     string   `json:"category"`
	MissionClass string   `json:"missionClass"`
	Difficulty   string   `json:"difficulty,omitempty"`
	Tags         []string `json:"tags,omitempty"`
	Projects     []string `json:"cncfProjects,omitempty"`
}

// Chunk is a late-chunking unit of a Document. Each chunk is embedded
// independently; a document's score is the best (max) score over its chunks.
type Chunk struct {
	DocIndex int    // index into Retriever.docs
	Kind     string // "title" | "description" | "meta"
	Text     string
}

// Result is a ranked retrieval hit returned to the caller / agent.
type Result struct {
	Document Document `json:"document"`
	Score    float64  `json:"score"`
	// DenseRank and LexicalRank are 1-based ranks in each signal (0 = absent),
	// exposed for debugging/observability of the hybrid fusion.
	DenseRank   int `json:"denseRank"`
	LexicalRank int `json:"lexicalRank"`
}

// searchableText builds the full text representation of a document used for
// lexical (BM25) scoring. Title and project names are repeated to weight them.
func (d Document) searchableText() string {
	parts := []string{d.Title, d.Title, d.Description, d.Category}
	parts = append(parts, d.Tags...)
	parts = append(parts, d.Projects...)
	parts = append(parts, d.Projects...) // project names matter a lot for install intent
	out := ""
	for _, p := range parts {
		if p != "" {
			out += p + " "
		}
	}
	return out
}
