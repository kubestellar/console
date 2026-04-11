# kubestellar-console Helm chart

Helm chart for deploying the KubeStellar Console to a Kubernetes cluster.

> **New to KubeStellar Console?** The hosted demo at
> [console.kubestellar.io](https://console.kubestellar.io) lets you click through
> the full UI without installing anything. Install this chart only when you need
> the console talking to your own cluster.

## Table of contents

- [Secrets and configuration](#secrets-and-configuration)
- [Quickstart: Kind or Minikube](#quickstart-kind-or-minikube)
- [Installing on a real cluster](#installing-on-a-real-cluster)
- [Configuration reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)

## Secrets and configuration

The chart has two modes for supplying secret material:

1. **Chart-managed (default, easiest)** — pass values via `--set` or a values
   file; the chart renders a single Kubernetes Secret whose name is the
   chart `fullname`. The exact name depends on `fullnameOverride`,
   `nameOverride`, and whether `.Release.Name` already contains the chart
   name — the authoritative definition lives in
   [`templates/_helpers.tpl`](./templates/_helpers.tpl) under
   `"kubestellar-console.fullname"`. To see the exact name your values
   produce, run `helm template . | head` and look for the `metadata.name`
   of the rendered Secret.

   The Secret holds the JWT secret plus any of the other optional keys
   (`github-client-id`, `github-client-secret`, `google-drive-api-key`,
   `claude-api-key`, `feedback-github-token`) you supplied via values.
   - If `jwt.secret` is not set, the chart auto-generates a 64-character
     random value on first install and then **preserves it across `helm
     upgrade`** by looking up the existing Secret ([#6343](https://github.com/kubestellar/console/issues/6343)).
     This means JWT session cookies survive chart upgrades without forcing
     all users to sign in again.
   - The `lookup` is skipped entirely when `jwt.secret` is set explicitly,
     so Helm identities that have create/update on Secrets but lack `get`
     can still install the chart ([#6348](https://github.com/kubestellar/console/issues/6348)).
2. **Bring-your-own** — create Secrets yourself before `helm install` and
   reference them via `*.existingSecret` values.
   - The chart's `existingSecret` values are independent per integration:
     you can point `jwt.existingSecret`, `github.existingSecret`,
     `claude.existingSecret`, `googleDrive.existingSecret`, and
     `feedbackGithubToken.existingSecret` at any combination of Secrets —
     the same one, or a different one per integration. Per-field
     `existingSecretKey` / `existingSecretKeys.*` values let you override
     the key name inside whichever Secret you pick.
   - **One caveat:** the chart's own rendered Secret (holding the JWT
     value plus any inline `github.clientId` / `claude.apiKey` / etc. you
     passed as values) is gated solely on `jwt.existingSecret`. If you set
     `jwt.existingSecret` you opt out of the chart-managed Secret entirely
     — so any inline `github.clientId` / `claude.apiKey` / etc. values in
     your values file have no Secret to land in, and must instead be
     supplied via the matching `*.existingSecret` for that integration.

### Values that accept secret material

| Value | Auto-generated if empty? | `existingSecret` alternative |
|---|---|---|
| `jwt.secret` | **yes** (64-char random) | `jwt.existingSecret` + `jwt.existingSecretKey` (default `jwt-secret`) |
| `github.clientId` / `github.clientSecret` | no — GitHub OAuth simply won't work until set | `github.existingSecret` + `github.existingSecretKeys.clientId` / `.clientSecret` |
| `googleDrive.apiKey` | no — benchmark cards fall back to demo data | `googleDrive.existingSecret` + `googleDrive.existingSecretKey` |
| `claude.apiKey` | no — AI features are disabled | `claude.existingSecret` + `claude.existingSecretKey` |
| `feedbackGithubToken.token` | no — feedback posting is disabled | `feedbackGithubToken.existingSecret` + `feedbackGithubToken.existingSecretKey` |

For a purely local evaluation you can install the chart with no secret values
at all — the JWT secret is auto-generated and every other feature degrades
gracefully to demo mode.

### Example: BYO secret for production

If you want to keep all secret material out of your values file, create a
Secret in the target namespace first (name it whatever you like):

```bash
kubectl create namespace kubestellar-console

kubectl -n kubestellar-console create secret generic kc-console \
  --from-literal=jwt-secret="$(openssl rand -hex 32)" \
  --from-literal=github-client-id="YOUR_GH_CLIENT_ID" \
  --from-literal=github-client-secret="YOUR_GH_CLIENT_SECRET"
```

Then point the chart at it:

```bash
helm install kc ./deploy/helm/kubestellar-console \
  -n kubestellar-console \
  --set jwt.existingSecret=kc-console \
  --set github.existingSecret=kc-console
```

The release-fullname Secret the chart would otherwise render is skipped when
`jwt.existingSecret` is set.

## Quickstart: Kind or Minikube

A minimal local install for evaluation. Tested on Kind v0.27 and Minikube v1.35.

```bash
# 1. Create a cluster
kind create cluster --name kc-demo
# or:  minikube start -p kc-demo

# 2. Install with no secret overrides — the chart auto-generates a JWT
#    secret and everything else falls back to demo mode.
kubectl create namespace kubestellar-console

helm install kc ./deploy/helm/kubestellar-console \
  -n kubestellar-console

# 3. Port-forward to the service
kubectl -n kubestellar-console port-forward svc/kc-kubestellar-console 8080:8080

# 4. Open http://localhost:8080 — demo mode is enabled by default when
#    no real GitHub OAuth credentials are configured.
```

Teardown:

```bash
helm uninstall kc -n kubestellar-console
kind delete cluster --name kc-demo
```

## Installing on a real cluster

For production installs:

1. Create the namespace: `kubectl create namespace kubestellar-console`.
2. Decide whether you want the chart to render a Secret for you or whether
   you'll bring your own (see [Secrets and configuration](#secrets-and-configuration)).
3. Configure `ingress` or `route` (OpenShift) in your values file so the
   console is reachable from outside the cluster.
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
| `github.clientId` / `github.clientSecret` | *(empty)* | GitHub OAuth; leave empty for demo-only. |
| `github.existingSecret` | *(empty)* | Use an existing Secret instead of inline values. |
| `jwt.secret` | *(auto-generated)* | Set to use a fixed key across reinstalls. |
| `jwt.existingSecret` | *(empty)* | When set, chart skips rendering its own Secret. |
| `ingress.enabled` | `false` | |
| `route.enabled` | `false` | OpenShift Route (alternative to Ingress). |
| `persistence.enabled` | `true` | PVC for the SQLite database. |
| `backup.enabled` | `true` | SQLite auto-backup CronJob + restore init container. |
| `securityContext.runAsUser` | `1001` | Must be numeric for Kind/Minikube — see [#6323](https://github.com/kubestellar/console/issues/6323). On OpenShift, set this **and** `runAsGroup` to `null` to let SCC assign the UID — see [#6344](https://github.com/kubestellar/console/issues/6344). Leave `runAsNonRoot: true` as-is; PodSecurity `restricted` still requires it ([#6353](https://github.com/kubestellar/console/issues/6353)). |

## Troubleshooting

Common failures and what to do about them.

### `Error: execution error at (kubestellar-console/templates/validation.yaml...): when jwt.existingSecret is set...`

You set `jwt.existingSecret` (bring-your-own JWT) **and** supplied one of
`github.clientId`, `github.clientSecret`, `claude.apiKey`, `googleDrive.apiKey`,
or `feedbackGithubToken.token` as inline values.

This combination used to silently produce a broken Deployment ([#6358](https://github.com/kubestellar/console/issues/6358)):
`templates/secret.yaml` is gated on `not .Values.jwt.existingSecret`, so when
you set it, the chart renders **no** Secret at all — and your inline
credentials have nowhere to land. The Deployment would still reference keys
like `github-client-id` from a Secret named after the chart release, and pods
crash on startup with `secret "<release>-kubestellar-console" not found`.

The chart now fails template rendering early with a clear message. To fix:
create your own pre-existing Secrets for every credential you need and
point the chart at them via `*.existingSecret`:

```bash
kubectl -n kubestellar-console create secret generic my-kc-github \
  --from-literal=github-client-id=xxx \
  --from-literal=github-client-secret=yyy

helm install kc ./deploy/helm/kubestellar-console \
  --set jwt.existingSecret=my-kc-jwt \
  --set github.existingSecret=my-kc-github \
  --set claude.existingSecret=my-kc-claude \
  --set googleDrive.existingSecret=my-kc-gd \
  --set feedbackGithubToken.existingSecret=my-kc-feedback
```

Alternatively, leave `jwt.existingSecret` empty and let the chart render
its own Secret containing all credentials.

### `CreateContainerConfigError: secret "<name>" not found`

You pointed the chart at an `existingSecret` that doesn't exist in the
release namespace. Either create the Secret first (see
[Secrets and configuration](#secrets-and-configuration)) or drop the
`*.existingSecret` override so the chart renders its own Secret.

If the pod is stuck in this state, recreate the secret and delete the pod
so the deployment controller respawns it:

```bash
kubectl -n kubestellar-console delete pod -l app.kubernetes.io/name=kubestellar-console
```

### OpenShift pod stuck `Replicas: 0/1` / `context deadline exceeded`

OpenShift's `restricted` / `restricted-v2` SCC allocates a
namespace-specific UID range and rejects pods whose `runAsUser` falls
outside that range ([#6344](https://github.com/kubestellar/console/issues/6344)).
The chart default (`runAsUser: 1001`) is correct for Kind/Minikube but
breaks OpenShift silently — the helm upgrade rolls back with no
container-level error message.

Fix: null out just the UID/GID numbers so SCC can inject its own values
while keeping `runAsNonRoot: true` intact (PodSecurity `restricted` still
requires it — see [#6353](https://github.com/kubestellar/console/issues/6353)):

```bash
helm upgrade kc ./deploy/helm/kubestellar-console -n kubestellar-console \
  --set securityContext.runAsUser=null \
  --set securityContext.runAsGroup=null
```

### `container has runAsNonRoot and image has non-numeric user (appuser)`

The chart sets `securityContext.runAsUser: 1001` in `values.yaml` to match
the Dockerfile's numeric UID (see [#6323](https://github.com/kubestellar/console/issues/6323)).
If you've overridden `securityContext` in your values file and removed
`runAsUser`, add it back or let the chart default win.

### `violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false / seccompProfile`

The chart already sets `allowPrivilegeEscalation: false` and a pod-level
`seccompProfile.type: RuntimeDefault` to satisfy the `restricted` profile
([#6334](https://github.com/kubestellar/console/issues/6334)). If you've
overridden `podSecurityContext` or `securityContext` and dropped those
keys, add them back.

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

You rotated the JWT secret (either via `jwt.secret` or by recreating the
backing Secret) but existing session cookies were signed with the old key.
Have users sign out and back in. To force, delete the deployment's pods so
they pick up the new secret:

```bash
kubectl -n kubestellar-console delete pod -l app.kubernetes.io/name=kubestellar-console
```

---

## Related issues

Linking the issues that motivated each section of this README, for future
readers who hit the same thing:

- [#6323](https://github.com/kubestellar/console/issues/6323)/[#6324](https://github.com/kubestellar/console/issues/6324) — `runAsUser` fix for Kind/Minikube
- [#6325](https://github.com/kubestellar/console/issues/6325) — GitHub OAuth / existing-secret documentation
- [#6326](https://github.com/kubestellar/console/issues/6326) — JWT secret documentation
- [#6327](https://github.com/kubestellar/console/issues/6327) — Kind quickstart section
- [#6328](https://github.com/kubestellar/console/issues/6328) — troubleshooting section
- [#6333](https://github.com/kubestellar/console/issues/6333) — README vs. chart-values accuracy fixes
- [#6334](https://github.com/kubestellar/console/issues/6334) — PodSecurity `restricted` compliance
