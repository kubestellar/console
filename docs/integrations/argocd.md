# KubeStellar Console: ArgoCD Integration Guide

The KubeStellar Console integrates with ArgoCD to provide fleet-wide visibility and management of your GitOps deployments. This integration allows you to:
- Discover and monitor ArgoCD **Applications** across all your managed clusters.
- Discover and monitor ArgoCD **ApplicationSets** that define fleet-wide deployment generators.
- View real-time synchronization status and component health.
- Trigger on-demand syncs directly from the dashboard.

## Prerequisites

- One or more Kubernetes clusters monitored by the KubeStellar Console.
- ArgoCD deployed on those clusters (typically in the `argocd` or `gitops` namespace).
- KubeStellar Console installed and running.

## Authentication & Setup Options

The KubeStellar Console uses a tiered approach to interact with ArgoCD, specifically for triggering synchronizations. You can choose the setup method that best fits your environment.

### Option 1: REST API via Auth Token (Recommended for Production)
The most robust method connects directly to the ArgoCD API Server.

1. Generate an admin token from your ArgoCD instance:
   ```bash
   argocd account generate-token --account admin
   ```
2. Open your KubeStellar Console's `.env` or `.env.local` file.
3. Set the `ARGOCD_AUTH_TOKEN` variable:
   ```env
   # ===========================================
   # ArgoCD Integration
   # ===========================================
   ARGOCD_AUTH_TOKEN=eyJhbGciOiJ...
   ```
4. Restart the console backend. The console will automatically discover the ArgoCD Server service in the target cluster and use this token to trigger REST API operations.

### Option 2: Local CLI Integration (Recommended for Local Dev)
If the ArgoCD CLI is installed on the same machine/container running the KubeStellar Console, the console will detect it and use it.

1. Install the `argocd` CLI tool (ensure it is available in the `$PATH`).
2. Log in to ArgoCD locally.
3. No environment variables are required.

### Option 3: Kubernetes API Patching (Fallback)
If neither a token nor the CLI is available, the Console falls back to patching the Kubernetes Custom Resources directly using your current K8s context.

1. The console will add the annotation `argocd.argoproj.io/refresh: hard` to the target `Application` CRD.
2. **Requirements**: The Role/ClusterRole associated with the KubeStellar Console must have `patch` permissions on `applications.argoproj.io`.

## How to View and Add Cards in the UI

The ArgoCD integrations are provided as dynamic cards that can be added to any of your dashboards in the Console.

1. Navigate to your main overview dashboard at `http://localhost:8080/` (or your specific hosted Console URL).
2. Alternatively, you can add them to a specific cluster's dashboard by navigating to `http://localhost:8080/cluster/<cluster-name>`.
3. Click the **Add Card** (or **+**) button at the top right of the dashboard.
4. In the component catalog, scroll down to the **ArgoCD** category.
5. Select from the available views to add them to your board:
   - **ArgoCD Applications**: View individual applications, sync status, and click to sync.
   - **ArgoCD ApplicationSets**: Monitor fleet-wide generator templates and the number of applications they manage.
   - **ArgoCD Sync Status**: High-level donut chart visualization of synchronization states.
   - **ArgoCD Health**: High-level status overview of application health.

## Developer API Endpoints

If you are developing against the console, the backend exposes the following new API endpoints specifically for the ArgoCD integration. These require authentication headers if accessed externally:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/gitops/argocd/applications` | Returns all discovered ArgoCD Applications across clusters. |
| `GET` | `/api/gitops/argocd/applicationsets` | Returns all discovered ArgoCD ApplicationSets across clusters. |
| `GET` | `/api/gitops/argocd/status` | Returns a detection health-check summary indicating if ArgoCD was found per cluster. |
| `GET` | `/api/gitops/argocd/health` | Returns an aggregated summary of application health states. |
| `GET` | `/api/gitops/argocd/sync` | Returns an aggregated summary of synchronization states. |
| `POST` | `/api/gitops/argocd/sync` | Triggers a hard sync for a specific application. Requires `{name, namespace, cluster}` body. |

## Troubleshooting

- **Cards show "Demo Data" or "Integration Notice"**: The console did not find any Application or ApplicationSet CRDs in your clusters. Ensure ArgoCD is installed in the clusters the console is bound to.
- **"Failed to trigger sync"**: Your authentication token might be expired, or the console lacks RBAC permissions to patch standard CRDs in the ArgoCD namespace. Check the console logs for specific `TriggerArgoSync` errors.
