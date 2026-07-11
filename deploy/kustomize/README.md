# KubeStellar Console — Kustomize Install

Install the console on any Kubernetes cluster with `kubectl` alone — no Helm
required. Manifests mirror the Helm chart defaults
(`deploy/helm/kubestellar-console/`).

## Quick start (3 commands)

```bash
# 1. Namespace
kubectl create namespace kubestellar-console

# 2. JWT secret (required — the console refuses to start without one)
kubectl -n kubestellar-console create secret generic kubestellar-console-jwt \
  --from-literal=jwt-secret="$(openssl rand -base64 48)"

# 3. Install the starter experience
kubectl apply -k 'https://github.com/kubestellar/console/deploy/kustomize/overlays/starter?ref=main'
```

Then open it:

```bash
kubectl -n kubestellar-console port-forward svc/kubestellar-console 8080:8080
# → http://localhost:8080
```

## Variants

| Path | What you get |
|------|--------------|
| `base` | Full console, all dashboards, no exposure (use port-forward or add your own Ingress) |
| `overlays/starter` | **Recommended.** Curated sidebar with three core dashboards (Dashboard, Workloads, Nodes), onboarding questionnaire skipped |
| `overlays/openshift` | Starter experience plus an edge-terminated OpenShift Route |

## Customizing

Create your own overlay and point `resources` at the base or starter overlay:

```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - https://github.com/kubestellar/console/deploy/kustomize/overlays/starter?ref=main
patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: kubestellar-console
      spec:
        template:
          spec:
            containers:
              - name: kubestellar-console
                env:
                  - name: ENABLED_DASHBOARDS
                    value: dashboard,workloads,nodes,storage,gpu
```

Useful environment variables:

| Variable | Purpose |
|----------|---------|
| `ENABLED_DASHBOARDS` | Comma-separated dashboard IDs shown in the sidebar (empty = all). IDs: `web/src/hooks/useSidebarConfig.ts` |
| `SKIP_ONBOARDING` | `"true"` skips the first-run questionnaire |
| `APP_NAME`, `LOGO_URL`, `THEME_COLOR` | Rebrand the console for your distribution |
| `CLAUDE_API_KEY` | Enable AI features |

## Exposing on a real hostname

The default (`localhost:8080` via port-forward) needs no configuration.
When you expose the console on a Route or Ingress hostname, set
`FRONTEND_URL` so auth redirects return to the right place:

```bash
kubectl -n kubestellar-console set env deployment/kubestellar-console \
  FRONTEND_URL=https://console.example.com
```

(Or patch the env var in your overlay next to `ENABLED_DASHBOARDS`.)

## Staying current / version pinning

The base tracks the **`latest`** release channel. Every nightly and weekly
release pushes the moving image tags `latest`, `nightly`, and `weekly` plus
an immutable `vX.Y.Z[-nightly.DATE]` tag, so a fresh install (or pod
restart — `:latest` implies `imagePullPolicy: Always`) always gets the
newest console with no manifest changes. The in-app self-upgrade
(`SELF_UPGRADE_ENABLED=true`) can also roll the deployment forward from
the UI.

To follow a different channel or pin an exact version for reproducible
installs, override the tag in your overlay:

```yaml
images:
  - name: ghcr.io/kubestellar/console
    newTag: weekly   # or nightly, or an immutable tag like v0.3.34-nightly.20260709
```

## Uninstall

```bash
kubectl delete -k 'https://github.com/kubestellar/console/deploy/kustomize/overlays/starter?ref=main'
kubectl delete namespace kubestellar-console
```
