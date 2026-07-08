package rag

import "strings"

const minTokenLen = 2

// stopwords are high-frequency, non-discriminative tokens. Dropping them stops
// noise like the phrase "how do I ..." matching every doc whose title starts
// "How do I ...". Kubernetes-generic words ("kubernetes", "cluster") are kept
// out of this list since IDF/BM25 already downweight them and they remain
// mildly useful.
var stopwords = map[string]struct{}{
	"the": {}, "and": {}, "for": {}, "with": {}, "you": {}, "your": {},
	"how": {}, "do": {}, "does": {}, "did": {}, "can": {}, "could": {},
	"are": {}, "was": {}, "were": {}, "this": {}, "that": {}, "from": {},
	"into": {}, "out": {}, "off": {}, "but": {}, "not": {}, "have": {},
	"has": {}, "had": {}, "get": {}, "got": {}, "want": {}, "need": {},
	"please": {}, "help": {}, "should": {}, "would": {}, "will": {},
	"what": {}, "when": {}, "where": {}, "why": {}, "who": {}, "which": {},
	"about": {}, "there": {}, "here": {}, "some": {}, "any": {}, "all": {},
	"using": {}, "use": {}, "via": {}, "etc": {},
	"my": {}, "me": {}, "we": {}, "us": {}, "is": {}, "of": {}, "to": {},
	"on": {}, "in": {}, "at": {}, "by": {}, "an": {}, "as": {}, "be": {},
	"or": {}, "it": {}, "so": {}, "up": {}, "if": {}, "no": {}, "am": {},
}

// tokenize lowercases text and splits on any non-alphanumeric rune, dropping
// tokens shorter than minTokenLen. It is the single shared tokenizer used by
// both the lexical (BM25) and dense (HashEmbedder) paths so their vocabularies
// stay aligned.
func tokenize(text string) []string {
	fields := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9')
	})
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if len(f) < minTokenLen {
			continue
		}
		if _, stop := stopwords[f]; stop {
			continue
		}
		out = append(out, f)
	}
	return out
}

// charTrigrams returns the 3-character shingles of a token (with word
// boundaries), used as subword features so morphological variants like
// "certmanager" and "cert-manager" share signal.
func charTrigrams(token string) []string {
	t := "#" + token + "#"
	if len(t) < 3 {
		return nil
	}
	out := make([]string, 0, len(t)-2)
	for i := 0; i+3 <= len(t); i++ {
		out = append(out, t[i:i+3])
	}
	return out
}
