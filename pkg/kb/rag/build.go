package rag

// DefaultDim is the dimensionality used by the default (model-free) retriever.
const DefaultDim = defaultDim

// NewDefaultRetriever builds a ready-to-query retriever from a corpus using the
// zero-dependency HashEmbedder fitted on that same corpus. This is the standard
// entry point for the console: deterministic, no external services, and fast
// enough to construct at startup.
func NewDefaultRetriever(docs []Document) *Retriever {
	lex := make([]string, len(docs))
	for i, d := range docs {
		lex[i] = d.searchableText()
	}
	embedder := NewHashEmbedder(lex, defaultDim)
	return NewRetriever(docs, embedder, 0)
}

// NewDefaultRetrieverFromIndex parses a fixes/index.json payload and builds the
// default retriever from it.
func NewDefaultRetrieverFromIndex(indexJSON []byte) (*Retriever, error) {
	docs, err := ParseCorpus(indexJSON)
	if err != nil {
		return nil, err
	}
	return NewDefaultRetriever(docs), nil
}
