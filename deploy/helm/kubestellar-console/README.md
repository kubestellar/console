# kubestellar-console Helm chart

Helm chart for deploying the KubeStellar Console to a Kubernetes cluster.

> **New to KubeStellar Console?** The hosted demo at
> [console.kubestellar.io](https://console.kubestellar.io) lets you click through
> the full UI without installing anything. Install this chart only when you need
> the console talking to your own cluster.

## Table of contents

- [Required secrets](#required-secrets)
- [Quickstart: Kind or Minikube](#quickstart-kind-or-minikube)
- [Installing on a real cluster](#installing-on-a-real-cluster)
- [Configuration reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)

## Required secrets

The chart depends on **two Kubernetes secrets** that must exist in the target
namespace **before** running `helm install`. Neither is created by the chart
itself (by design — secret material should never land in chart values).

### 1. `kc-kubestellar-console` (application secret)

Holds runtime secrets the Go backend reads at startup:

| Key | Required? | Description |
|---|---|---|
| `jwt-secret` | **yes** | HMAC key for signing JWT session tokens. Generate with `openssl rand -hex 32`. |
| `github-token` | optional | A GitHub PAT used by feedback / mission flows. Can be set later via the Settings page. |
| `google-drive-api-key` | optional | Only needed for benchmark cards backed by Google Drive. |

Create it before installing:

```bash
kubectl create namespace kubestellar-console

kubectl -n kubestellar-console create secret generic kc-kubestellar-console \
  --from-literal=jwt-secret="$(openssl rand -hex 32)"
```

If you miss this step, the pod will crash at startup with a
`CreateContainerConfigError` or `secret "kc-kubestellar-console" not found`
(see [Troubleshooting](#troubleshooting) below).

### 2. `kc-oauth-secret` (only if GitHub OAuth is enabled)

Only required when `oauth.enabled=true` (which is the default when you want
users to sign in with GitHub):

| Key | Required? |
|---|---|
| `github-client-id` | **yes** |
| `github-client-secret` | **yes** |

Create it with values from your GitHub OAuth app
([github.com/settings/developers](https://github.com/settings/developers)):

```bash
kubectl -n kubestellar-console create secret generic kc-oauth-secret \
  --from-literal=github-client-id="YOUR_CLIENT_ID" \
  --from-literal=github-client-secret="YOUR_CLIENT_SECRET"
```

To disable OAuth entirely (demo-mode only), install with `--set oauth.enabled=false`
and skip this secret.

## Quickstart: Kind or Minikube

A minimal local install for evaluation. Tested on Kind v0.27 and Minikube v1.35.

```bash
# 1. Create a cluster
kind create cluster --name kc-demo
# or:  minikube start -p kc-demo

# 2. Create the namespace and the required secrets (see above)
kubectl create namespace kubestellar-console

kubectl -n kubestellar-console create secret generic kc-kubestellar-console \
  --from-literal=jwt-secret="$(openssl rand -hex 32)"

# OAuth is optional on local clusters — skip it for a quick look
helm install kc ./deploy/helm/kubestellar-console \
  -n kubestellar-console \
  --set oauth.enabled=false \
  --set ingress.enabled=false \
  --set service.type=ClusterIP

# 3. Port-forward to the pod
kubectl -n kubestellar-console port-forward svc/kc-kubestellar-console 8080:8080

# 4. Open http://localhost:8080 — demo mode is enabled by default when
#    no real token is configured.
```

Teardown:

```bash
helm uninstall kc -n kubestellar-console
kind delete cluster --name kc-demo
```

## Installing on a real cluster

For production installs:

1. Create the namespace and both secrets (application + OAuth).
2. Configure ingress or a LoadBalancer service type in `values.yaml`.
3. Set `route.enabled=true` + `route.host=<your-fqdn>` on OpenShift.
4. Point your GitHub OAuth app's callback URL at
   `https://<your-fqdn>/api/auth/github/callback`.
5. `helm install kc ./deploy/helm/kubestellar-console -n kubestellar-console -f your-values.yaml`

## Configuration reference

See [`values.yaml`](./values.yaml) for the full list with inline comments.
Common knobs:

| Key | Default | Notes |
|---|---|---|
| `image.repository` | `ghcr.io/kubestellar/console` | |
| `image.tag` | chart `appVersion` | Pin for reproducible deploys. |
| `oauth.enabled` | `true` | Set to `false` for demo-only installs. |
| `ingress.enabled` | `false` | |
| `route.enabled` | `false` | OpenShift Route (alternative to Ingress). |
| `securityContext.runAsUser` | `1001` | Must be numeric — see [#6323](https://github.com/kubestellar/console/issues/6323). |
| `backup.enabled` | `false` | SQLite auto-backup + restore init container. |

## Troubleshooting

Common failures and what to do about them.

### `CreateContainerConfigError: secret "kc-kubestellar-console" not found`

The application secret is missing. Create it with `kubectl create secret` (see
[Required secrets](#required-secrets)). If the pod is stuck in this state,
re-create the secret and delete the pod so the deployment controller respawns
it:

```bash
kubectl -n kubestellar-console delete pod -l app.kubernetes.io/name=kubestellar-console
```

### `CreateContainerConfigError: secret "kc-oauth-secret" not found`

Same fix — the OAuth secret wasn't created before install. Either create
`kc-oauth-secret` or re-install with `--set oauth.enabled=false`.

### `container has runAsNonRoot and image has non-numeric user (appuser)`

Fixed in chart 0.3.20 ([#6323](https://github.com/kubestellar/console/issues/6323)).
If you're on an older chart version, upgrade:

```bash
helm upgrade kc ./deploy/helm/kubestellar-console -n kubestellar-console
```

Or patch the release in place:

```bash
helm upgrade kc ./deploy/helm/kubestellar-console -n kubestellar-console \
  --set securityContext.runAsUser=1001 \
  --set securityContext.runAsGroup=1001
```

### Pod stuck `Pending`: `pod has unbound immediate PersistentVolumeClaims`

The cluster has no default StorageClass. On Kind, install a provisioner
(e.g. [local-path-provisioner](https://github.com/rancher/local-path-provisioner))
or disable persistence:

```bash
helm upgrade kc ./deploy/helm/kubestellar-console -n kubestellar-console \
  --set persistence.enabled=false
```

### `kubectl port-forward` hangs or disconnects immediately

Usually means the pod hasn't reached `Ready` yet. Check with:

```bash
kubectl -n kubestellar-console get pods
kubectl -n kubestellar-console describe pod -l app.kubernetes.io/name=kubestellar-console
kubectl -n kubestellar-console logs -l app.kubernetes.io/name=kubestellar-console --tail=100
```

The startup probe takes ~30s on cold starts; wait for `Ready: 1/1` before
opening the port-forward.

### GitHub OAuth login redirect loop

The callback URL in your GitHub OAuth app doesn't match the URL the browser
is hitting. Update the OAuth app's authorization callback URL to
`https://<your-fqdn>/api/auth/github/callback` (or
`http://localhost:8080/api/auth/github/callback` for local port-forward).

### `JWT signature verification failed` after upgrade

You rotated `jwt-secret` but existing session cookies were signed with the
old key. Have users sign out and back in. To force, delete the deployment's
pods so they pick up the new secret:

```bash
kubectl -n kubestellar-console delete pod -l app.kubernetes.io/name=kubestellar-console
```

---

## Related issues

Linking the issues that motivated each section of this README, for future
readers who hit the same thing:

- [#6323](https://github.com/kubestellar/console/issues/6323)/[#6324](https://github.com/kubestellar/console/issues/6324) — `runAsUser` fix for Kind/Minikube
- [#6325](https://github.com/kubestellar/console/issues/6325) — `kc-oauth-secret` documentation
- [#6326](https://github.com/kubestellar/console/issues/6326) — `JWT_SECRET` / `kc-kubestellar-console` documentation
- [#6327](https://github.com/kubestellar/console/issues/6327) — Kind quickstart section
- [#6328](https://github.com/kubestellar/console/issues/6328) — troubleshooting section
