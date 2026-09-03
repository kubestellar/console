# Grafana dashboards (recommendation-only)

These dashboard JSON files are **not** wired into any deployment, Helm chart,
or CI step. No observability backend is confirmed for this deployment, so
telemetry auditing here is limited to producing importable artifacts rather
than provisioning a data source or exporter.

To use one:

1. Confirm your cluster already runs a Prometheus that scrapes this
   console's `/metrics` endpoint (see `pkg/api/metrics` and
   `deploy/helm/kubestellar-console/templates/servicemonitor.yaml`).
2. In Grafana, import the JSON file and point the `datasource` template
   variable at that Prometheus instance.

| File | Covers |
| --- | --- |
| `console-self-metrics-dashboard.json` | `console_http_requests_total`, `console_http_request_duration_seconds` bounded self-metrics (request rate, error ratio, latency percentiles, top routes). Pairs with the alert rules in `deploy/helm/kubestellar-console/templates/prometheusrule.yaml` (opt-in via `metrics.prometheusRule.enabled`). |
