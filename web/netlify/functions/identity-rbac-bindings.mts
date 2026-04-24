/**
 * Netlify Function: Identity RBAC Bindings
 *
 * Returns demo RBAC binding list for the enterprise RBAC Audit dashboard.
 */

/** Offset constants for demo timestamps (milliseconds) */
const TWO_MINUTES_MS = 120_000;
const FIVE_MINUTES_MS = 300_000;
const TEN_MINUTES_MS = 600_000;
const THIRTY_MINUTES_MS = 1_800_000;
const ONE_HOUR_MS = 3_600_000;
const TWO_HOURS_MS = 7_200_000;
const TWELVE_HOURS_MS = 43_200_000;
const ONE_DAY_MS = 86_400_000;
const TWO_DAYS_MS = 172_800_000;
const THREE_DAYS_MS = 259_200_000;
const SEVEN_DAYS_MS = 604_800_000;
const THIRTY_DAYS_MS = 2_592_000_000;

export default async () => {
  const now = Date.now();
  return new Response(
    JSON.stringify([
      { id: "rb-1", name: "admin-binding", kind: "ClusterRoleBinding", subject_kind: "User", subject_name: "alice@company.com", role_name: "cluster-admin", namespace: "", cluster: "prod-east", risk_level: "critical", last_used: new Date(now - ONE_DAY_MS).toISOString() },
      { id: "rb-2", name: "dev-edit-binding", kind: "RoleBinding", subject_kind: "Group", subject_name: "developers", role_name: "edit", namespace: "app-dev", cluster: "prod-east", risk_level: "medium", last_used: new Date(now - TWO_DAYS_MS).toISOString() },
      { id: "rb-3", name: "ci-deploy", kind: "RoleBinding", subject_kind: "ServiceAccount", subject_name: "ci-deployer", role_name: "deploy-manager", namespace: "ci-cd", cluster: "prod-east", risk_level: "high", last_used: new Date(now - ONE_HOUR_MS).toISOString() },
      { id: "rb-4", name: "monitoring-view", kind: "ClusterRoleBinding", subject_kind: "ServiceAccount", subject_name: "prometheus", role_name: "view", namespace: "", cluster: "prod-west", risk_level: "low", last_used: new Date(now - FIVE_MINUTES_MS).toISOString() },
      { id: "rb-5", name: "qa-edit-binding", kind: "RoleBinding", subject_kind: "Group", subject_name: "qa-team", role_name: "edit", namespace: "qa", cluster: "staging", risk_level: "medium", last_used: new Date(now - SEVEN_DAYS_MS).toISOString() },
      { id: "rb-6", name: "old-admin-binding", kind: "ClusterRoleBinding", subject_kind: "User", subject_name: "former-admin@company.com", role_name: "cluster-admin", namespace: "", cluster: "prod-east", risk_level: "critical", last_used: new Date(now - THIRTY_DAYS_MS).toISOString() },
      { id: "rb-7", name: "secrets-reader", kind: "RoleBinding", subject_kind: "ServiceAccount", subject_name: "vault-agent", role_name: "secret-reader", namespace: "vault", cluster: "prod-east", risk_level: "high", last_used: new Date(now - TWO_HOURS_MS).toISOString() },
      { id: "rb-8", name: "ingress-controller", kind: "ClusterRoleBinding", subject_kind: "ServiceAccount", subject_name: "nginx-ingress", role_name: "ingress-nginx", namespace: "", cluster: "prod-east", risk_level: "medium", last_used: new Date(now - TEN_MINUTES_MS).toISOString() },
      { id: "rb-9", name: "dev-readonly", kind: "RoleBinding", subject_kind: "Group", subject_name: "interns", role_name: "view", namespace: "sandbox", cluster: "staging", risk_level: "low", last_used: new Date(now - THREE_DAYS_MS).toISOString() },
      { id: "rb-10", name: "backup-operator", kind: "ClusterRoleBinding", subject_kind: "ServiceAccount", subject_name: "velero", role_name: "backup-admin", namespace: "", cluster: "prod-west", risk_level: "high", last_used: new Date(now - TWELVE_HOURS_MS).toISOString() },
      { id: "rb-11", name: "app-deployer", kind: "RoleBinding", subject_kind: "Group", subject_name: "sre-team", role_name: "admin", namespace: "production", cluster: "prod-east", risk_level: "high", last_used: new Date(now - THIRTY_MINUTES_MS).toISOString() },
      { id: "rb-12", name: "log-collector", kind: "ClusterRoleBinding", subject_kind: "ServiceAccount", subject_name: "fluentd", role_name: "log-reader", namespace: "", cluster: "prod-east", risk_level: "low", last_used: new Date(now - TWO_MINUTES_MS).toISOString() },
    ]),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
