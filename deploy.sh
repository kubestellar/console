#!/bin/bash
# KubeStellar Console - Deploy to Kubernetes
#
# Deploys KubeStellar Console to any Kubernetes cluster via Helm.
# Works with OpenShift, EKS, GKE, AKS, kind, k3s, or any distribution.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/deploy.sh | bash
#
# Options:
#   --context, -c <name>        Kubernetes context (default: current context)
#   --namespace, -n <name>      Namespace (default: kubestellar-console)
#   --release, -r <name>        Helm release name (default: kc)
#   --version, -v <version>     Chart version (default: latest)
#   --set <key=value>           Pass additional Helm --set values
#   --openshift                 Enable OpenShift Route instead of port-forward
#   --ingress <host>            Enable Ingress with the given hostname
#   --github-oauth              Prompt for GitHub OAuth credentials
#   --uninstall                 Remove the console from the cluster
#
# Environment variables (alternative to flags):
#   GITHUB_CLIENT_ID            GitHub OAuth client ID
#   GITHUB_CLIENT_SECRET        GitHub OAuth client secret
#   CLAUDE_API_KEY              Claude API key for AI features

set -e

# --- Defaults ---
NAMESPACE="kubestellar-console"
RELEASE="kc"
CHART_VERSION=""
CONTEXT=""
HELM_REPO="kubestellar-console"
HELM_REPO_URL="https://kubestellar.github.io/console"
CHART="kubestellar-console/kubestellar-console"
OPENSHIFT=false
INGRESS_HOST=""
GITHUB_OAUTH=false
UNINSTALL=false
EXTRA_SETS=()

# --- Parse args ---
while [[ $# -gt 0 ]]; do
    case $1 in
        --context|-c) CONTEXT="$2"; shift 2 ;;
        --namespace|-n) NAMESPACE="$2"; shift 2 ;;
        --release|-r) RELEASE="$2"; shift 2 ;;
        --version|-v) CHART_VERSION="$2"; shift 2 ;;
        --set) EXTRA_SETS+=("--set" "$2"); shift 2 ;;
        --openshift) OPENSHIFT=true; shift ;;
        --ingress) INGRESS_HOST="$2"; shift 2 ;;
        --github-oauth) GITHUB_OAUTH=true; shift ;;
        --uninstall) UNINSTALL=true; shift ;;
        *) shift ;;
    esac
done

# --- Context flag ---
KUBE_ARGS=()
if [ -n "$CONTEXT" ]; then
    KUBE_ARGS=("--kube-context" "$CONTEXT")
fi

# --- Uninstall ---
if [ "$UNINSTALL" = true ]; then
    echo "=== Uninstalling KubeStellar Console ==="
    echo ""
    helm uninstall "$RELEASE" --namespace "$NAMESPACE" "${KUBE_ARGS[@]}" 2>/dev/null || echo "  Release not found"
    kubectl delete namespace "$NAMESPACE" "${KUBE_ARGS[@]/#--kube-context/--context}" 2>/dev/null || echo "  Namespace not found"
    echo ""
    echo "Done."
    exit 0
fi

# --- Prerequisites ---
echo "=== KubeStellar Console — Deploy to Kubernetes ==="
echo ""

for cmd in helm kubectl; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd is required but not found."
        echo "  Install Helm: https://helm.sh/docs/intro/install/"
        echo "  Install kubectl: https://kubernetes.io/docs/tasks/tools/"
        exit 1
    fi
done

# Verify cluster connectivity
CURRENT_CTX=$(kubectl config current-context 2>/dev/null || true)
if [ -n "$CONTEXT" ]; then
    echo "  Context:   $CONTEXT"
    if ! kubectl cluster-info "${KUBE_ARGS[@]/#--kube-context/--context}" &>/dev/null 2>&1; then
        echo "Error: Cannot connect to cluster with context '$CONTEXT'"
        exit 1
    fi
elif [ -n "$CURRENT_CTX" ]; then
    echo "  Context:   $CURRENT_CTX (current)"
else
    echo "Error: No Kubernetes context found. Set one with --context or kubectl config use-context."
    exit 1
fi
echo "  Namespace: $NAMESPACE"
echo "  Release:   $RELEASE"
echo ""

# --- Add Helm repo ---
echo "Adding Helm repository..."
helm repo add "$HELM_REPO" "$HELM_REPO_URL" 2>/dev/null || true
helm repo update "$HELM_REPO" >/dev/null 2>&1
echo ""

# --- Build Helm values ---
HELM_ARGS=("--namespace" "$NAMESPACE" "--create-namespace")
HELM_ARGS+=("${KUBE_ARGS[@]}")

if [ -n "$CHART_VERSION" ]; then
    HELM_ARGS+=("--version" "$CHART_VERSION")
fi

# GitHub OAuth
if [ "$GITHUB_OAUTH" = true ] && [ -z "$GITHUB_CLIENT_ID" ]; then
    echo "--- GitHub OAuth Setup ---"
    echo "Create an OAuth App at: https://github.com/settings/developers"
    echo ""
    read -rp "  GitHub Client ID: " GITHUB_CLIENT_ID
    read -rp "  GitHub Client Secret: " GITHUB_CLIENT_SECRET
    echo ""
fi

if [ -n "$GITHUB_CLIENT_ID" ] && [ -n "$GITHUB_CLIENT_SECRET" ]; then
    HELM_ARGS+=("--set" "github.clientId=$GITHUB_CLIENT_ID")
    HELM_ARGS+=("--set" "github.clientSecret=$GITHUB_CLIENT_SECRET")
    echo "  GitHub OAuth: enabled"
else
    echo "  GitHub OAuth: disabled (auto-login as dev-user)"
fi

# Claude AI
if [ -n "$CLAUDE_API_KEY" ]; then
    HELM_ARGS+=("--set" "claude.apiKey=$CLAUDE_API_KEY")
    echo "  Claude AI:    enabled"
fi

# OpenShift Route
if [ "$OPENSHIFT" = true ]; then
    HELM_ARGS+=("--set" "route.enabled=true")
    echo "  Exposure:     OpenShift Route"
fi

# Ingress
if [ -n "$INGRESS_HOST" ]; then
    HELM_ARGS+=("--set" "ingress.enabled=true")
    HELM_ARGS+=("--set" "ingress.hosts[0].host=$INGRESS_HOST")
    HELM_ARGS+=("--set" "ingress.hosts[0].paths[0].path=/")
    HELM_ARGS+=("--set" "ingress.hosts[0].paths[0].pathType=Prefix")
    echo "  Exposure:     Ingress ($INGRESS_HOST)"
fi

# Extra --set values
HELM_ARGS+=("${EXTRA_SETS[@]}")

echo ""

# --- Install or Upgrade ---
echo "Deploying..."
if helm status "$RELEASE" --namespace "$NAMESPACE" "${KUBE_ARGS[@]}" >/dev/null 2>&1; then
    helm upgrade "$RELEASE" "$CHART" "${HELM_ARGS[@]}" --wait --timeout 120s
else
    helm install "$RELEASE" "$CHART" "${HELM_ARGS[@]}" --wait --timeout 120s
fi

echo ""
echo "=== KubeStellar Console is deployed ==="
echo ""

# --- Access instructions ---
if [ "$OPENSHIFT" = true ]; then
    ROUTE_HOST=$(kubectl get route "$RELEASE-kubestellar-console" \
        --namespace "$NAMESPACE" \
        "${KUBE_ARGS[@]/#--kube-context/--context}" \
        -o jsonpath='{.spec.host}' 2>/dev/null || true)
    if [ -n "$ROUTE_HOST" ]; then
        echo "  URL: https://$ROUTE_HOST"
    else
        echo "  Route created — check: kubectl get route -n $NAMESPACE"
    fi
elif [ -n "$INGRESS_HOST" ]; then
    echo "  URL: https://$INGRESS_HOST"
    echo "  (Ensure DNS and Ingress controller are configured)"
else
    echo "  To access the console, run:"
    echo ""
    CTX_FLAG=""
    if [ -n "$CONTEXT" ]; then
        CTX_FLAG=" --context $CONTEXT"
    fi
    echo "    kubectl port-forward${CTX_FLAG} -n $NAMESPACE svc/$RELEASE-kubestellar-console 8080:8080"
    echo ""
    echo "  Then open: http://localhost:8080"
fi

echo ""
echo "To uninstall: $0 --uninstall${CONTEXT:+ --context $CONTEXT}"
echo ""
