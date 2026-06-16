package rag

import "strings"

// conceptExpansions bridges the vocabulary gap between how users phrase a goal
// and how missions are titled/tagged. A model-free encoder cannot infer that
// "monitoring" relates to Prometheus, so we expand a small, curated set of
// operational concepts into the project/keyword terms the corpus actually uses.
//
// This is deliberately conservative: only high-confidence, domain-stable
// mappings belong here. It is the model-free stand-in for the semantic
// generalization a neural embedder would provide, and it is the right seam to
// remove once a neural Embedder is wired in.
var conceptExpansions = map[string][]string{
	"monitor":      {"monitoring", "prometheus", "grafana", "observability", "metrics"},
	"monitoring":   {"prometheus", "grafana", "observability", "metrics"},
	"observe":      {"observability", "prometheus", "grafana", "tracing"},
	"logging":      {"logs", "loki", "fluentd", "fluent-bit", "observability"},
	"logs":         {"logging", "loki", "fluentd", "observability"},
	"tracing":      {"jaeger", "opentelemetry", "observability", "traces"},
	"cost":         {"cost-optimization", "right-sizing", "spend", "efficiency"},
	"costs":        {"cost-optimization", "right-sizing", "spend", "efficiency"},
	"cheaper":      {"cost-optimization", "right-sizing", "spend"},
	"mesh":         {"service-mesh", "linkerd", "istio", "networking"},
	"ingress":      {"ingress", "nginx", "traefik", "contour", "networking"},
	"certificate":  {"cert-manager", "tls", "certificates"},
	"certificates": {"cert-manager", "tls"},
	"tls":          {"cert-manager", "certificates"},
	"ssl":          {"cert-manager", "tls", "certificates"},
	"secrets":      {"vault", "sealed-secrets", "external-secrets", "security"},
	"backup":       {"backups", "velero", "etcd", "disaster-recovery"},
	"backups":      {"velero", "etcd", "disaster-recovery"},
	"gpu":          {"gpu", "nvidia", "accelerator"},
	"policy":       {"kyverno", "opa", "gatekeeper", "security"},
	"rbac":         {"rbac", "permissions", "security"},
	"permission":   {"rbac", "permissions", "security"},
	"permissions":  {"rbac", "security"},
	"autoscaling":  {"keda", "hpa", "autoscaler", "scaling"},
	"scaling":      {"autoscaling", "keda", "hpa"},
}

// expandQuery appends curated concept synonyms to a query so lexical and dense
// scoring reach the right missions. Original terms are preserved; each synonym
// is added at most once and is skipped if it already appears in the query, so a
// mapping like "ingress" -> {"ingress", ...} does not double-weight a term.
func expandQuery(query string) string {
	toks := tokenize(query)
	// seen seeds with the original query tokens so synonyms equal to an existing
	// term (or to an earlier-added synonym) are not duplicated.
	seen := make(map[string]struct{}, len(toks))
	for _, t := range toks {
		seen[t] = struct{}{}
	}
	var extra []string
	for _, tok := range toks {
		for _, syn := range conceptExpansions[tok] {
			if _, ok := seen[syn]; ok {
				continue
			}
			seen[syn] = struct{}{}
			extra = append(extra, syn)
		}
	}
	if len(extra) == 0 {
		return query
	}
	return query + " " + strings.Join(extra, " ")
}
