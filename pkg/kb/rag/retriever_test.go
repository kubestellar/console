package rag

import (
	"math"
	"testing"
)

// miniCorpus mirrors the real KB shape closely enough to validate retrieval
// behavior (asymmetric encoding, hybrid fusion, late chunking) without needing
// the full 1600-entry index.
func miniCorpus() []Document {
	return []Document{
		{
			Path:         "fixes/cncf-install/install-cert-manager.json",
			Title:        "Install and Configure Cert Manager on Kubernetes",
			Description:  "cert-manager automates the provisioning and management of TLS certificates in Kubernetes, securing applications with valid SSL certificates from Let's Encrypt.",
			Category:     "cncf-install",
			MissionClass: "install",
			Tags:         []string{"cert-manager", "tls", "certificates", "security"},
			Projects:     []string{"cert-manager"},
		},
		{
			Path:         "fixes/cncf-install/install-linkerd.json",
			Title:        "Install and Configure Linkerd on Kubernetes",
			Description:  "Linkerd is a lightweight service mesh that adds observability, reliability, and mTLS security to your Kubernetes services.",
			Category:     "cncf-install",
			MissionClass: "install",
			Tags:         []string{"linkerd", "service-mesh", "networking"},
			Projects:     []string{"linkerd"},
		},
		{
			Path:         "fixes/cncf-install/install-prometheus.json",
			Title:        "Install and Configure Prometheus on Kubernetes",
			Description:  "Prometheus is a monitoring and alerting toolkit that scrapes metrics from your cluster workloads.",
			Category:     "observability",
			MissionClass: "install",
			Tags:         []string{"prometheus", "monitoring", "metrics"},
			Projects:     []string{"prometheus"},
		},
		{
			Path:         "fixes/security/fix-rbac-denied.json",
			Title:        "Remediate an RBAC Denied Error",
			Description:  "Diagnose and fix RBAC_DENIED failures by auditing roles and applying least-privilege role bindings.",
			Category:     "security",
			MissionClass: "fixer",
			Tags:         []string{"rbac", "security", "permissions"},
		},
		{
			Path:         "fixes/cncf-install/install-ingress-nginx.json",
			Title:        "Install and Configure Ingress NGINX on Kubernetes",
			Description:  "The NGINX ingress controller routes external HTTP and HTTPS traffic to services inside the cluster.",
			Category:     "networking",
			MissionClass: "install",
			Tags:         []string{"ingress-nginx", "ingress", "networking"},
			Projects:     []string{"ingress-nginx"},
		},
	}
}

func topPath(r *Retriever, query string) string {
	res := r.Search(query, 3)
	if len(res) == 0 {
		return ""
	}
	return res[0].Document.Path
}

func TestSearch_ExactProjectName(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	if got := topPath(r, "install cert-manager"); got != "fixes/cncf-install/install-cert-manager.json" {
		t.Fatalf("exact project query: got %q", got)
	}
}

func TestSearch_VocabularyBridge(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	// "TLS certificates" never says cert-manager by name, but the description does.
	if got := topPath(r, "set up TLS certificates for my apps"); got != "fixes/cncf-install/install-cert-manager.json" {
		t.Fatalf("TLS->cert-manager bridge: got %q", got)
	}
}

func TestSearch_ConceptToProject(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	if got := topPath(r, "deploy a service mesh"); got != "fixes/cncf-install/install-linkerd.json" {
		t.Fatalf("service mesh->linkerd: got %q", got)
	}
}

func TestSearch_InstallIntentBeatsFixer(t *testing.T) {
	// A same-project fixer mission must NOT outrank the canonical install
	// mission when the query expresses install intent.
	docs := append(miniCorpus(), Document{
		Path:         "fixes/cncf-generated/cert-manager/cert-manager-dns01.json",
		Title:        "cert-manager: Godaddy dns01 support",
		Description:  "Add GoDaddy DNS01 solver support to cert-manager for certificate issuance.",
		Category:     "cncf-generated",
		MissionClass: "fixer",
		Tags:         []string{"cert-manager", "dns01"},
		Projects:     []string{"cert-manager"},
	})
	r := NewDefaultRetriever(docs)
	if got := topPath(r, "install cert-manager"); got != "fixes/cncf-install/install-cert-manager.json" {
		t.Fatalf("install intent should surface install mission, got %q", got)
	}
}

func TestSearch_QueryExpansion(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	// "monitoring" is never in any title/tag, but expandQuery bridges it to
	// prometheus/observability.
	res := r.Search("how do I monitor my cluster", 3)
	found := false
	for _, hit := range res {
		if hit.Document.Path == "fixes/cncf-install/install-prometheus.json" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected prometheus in top-3 for monitoring query, got %+v", res)
	}
}

func TestSearch_Troubleshooting(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	if got := topPath(r, "my pod cannot access the api permission denied"); got != "fixes/security/fix-rbac-denied.json" {
		t.Fatalf("permission denied->rbac: got %q", got)
	}
}

func TestSearch_RespectsK(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	res := r.Search("install kubernetes monitoring", 2)
	if len(res) > 2 {
		t.Fatalf("expected <=2 results, got %d", len(res))
	}
	if len(res) == 0 {
		t.Fatal("expected at least one result")
	}
}

func TestSearch_EmptyQuery(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	if res := r.Search("", 5); res != nil {
		t.Fatalf("empty query should return nil, got %d", len(res))
	}
}

func TestParseCorpus(t *testing.T) {
	data := []byte(`{"version":"1","count":2,"missions":[
		{"path":"a.json","title":"Install Foo","description":"d","category":"c","missionClass":"install"},
		{"path":"b.json","title":"","description":"skip me"}
	]}`)
	docs, err := ParseCorpus(data)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(docs) != 1 {
		t.Fatalf("expected 1 usable doc (untitled skipped), got %d", len(docs))
	}
}

func TestExpandQuery_NoDuplicateTerms(t *testing.T) {
	// conceptExpansions["ingress"] includes "ingress"; it must not be repeated.
	got := expandQuery("install ingress")
	count := 0
	for _, tok := range tokenize(got) {
		if tok == "ingress" {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected 'ingress' exactly once after expansion, got %d (%q)", count, got)
	}
}

func TestSearch_DeterministicOrdering(t *testing.T) {
	r := NewDefaultRetriever(miniCorpus())
	const query = "install kubernetes on the cluster"
	first := r.Search(query, 5)
	for i := 0; i < 20; i++ {
		got := r.Search(query, 5)
		if len(got) != len(first) {
			t.Fatalf("result count changed across runs: %d vs %d", len(got), len(first))
		}
		for j := range got {
			if got[j].Document.Path != first[j].Document.Path {
				t.Fatalf("ordering not deterministic at %d: %q vs %q", j, got[j].Document.Path, first[j].Document.Path)
			}
		}
	}
}

func TestRetriever_AllStopwordCorpusNoNaN(t *testing.T) {
	// Documents that tokenize to nothing must not produce NaN/Inf or panic
	// (BM25 avgLen would otherwise divide by zero).
	docs := []Document{
		{Path: "a.json", Title: "the and of", MissionClass: "install"},
		{Path: "b.json", Title: "to in on", MissionClass: "install"},
	}
	r := NewDefaultRetriever(docs)
	res := r.Search("the and", 3)
	for _, hit := range res {
		if math.IsNaN(hit.Score) || math.IsInf(hit.Score, 0) {
			t.Fatalf("non-finite score: %v", hit.Score)
		}
	}
}

func TestQuantizeAndTruncate(t *testing.T) {
	e := NewHashEmbedder([]string{"install cert manager tls"}, 256)
	v := e.EmbedQuery("install cert manager")
	if len(v) != 256 {
		t.Fatalf("dim: got %d", len(v))
	}
	if tv := Truncate(v, 64); len(tv) != 64 {
		t.Fatalf("truncate: got %d", len(tv))
	}
	if code := Quantize(v); len(code) != (256+63)/64 {
		t.Fatalf("quantize code len: got %d", len(code))
	}
}
