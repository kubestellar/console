/**
 * Netlify Function: Identity RBAC Findings
 *
 * Returns demo RBAC audit findings for the enterprise RBAC Audit dashboard.
 */
export default async () => {
  return new Response(
    JSON.stringify([
      { id: "find-1", finding_type: "cluster_admin_user", severity: "critical", subject: "alice@company.com", description: "User has cluster-admin role bound directly. This grants unrestricted access to all resources.", cluster: "prod-east", namespace: "*", recommendation: "Replace with scoped roles targeting specific namespaces and resources." },
      { id: "find-2", finding_type: "stale_binding", severity: "high", subject: "former-admin@company.com", description: "ClusterRoleBinding for cluster-admin has not been used in 30+ days. User may have left the organization.", cluster: "prod-east", namespace: "*", recommendation: "Remove the binding and verify user employment status." },
      { id: "find-3", finding_type: "wildcard_resource", severity: "high", subject: "ci-deployer", description: "ServiceAccount has wildcard resource permissions in the ci-cd namespace.", cluster: "prod-east", namespace: "ci-cd", recommendation: "Restrict to specific resource types: deployments, services, configmaps." },
      { id: "find-4", finding_type: "excessive_secrets_access", severity: "medium", subject: "developers", description: "Group \"developers\" can list and read secrets in the app-dev namespace.", cluster: "prod-east", namespace: "app-dev", recommendation: "Use CSI secret store driver instead of direct secret access." },
      { id: "find-5", finding_type: "unused_binding", severity: "medium", subject: "interns", description: "RoleBinding for \"interns\" group has not been used in 3+ days. May indicate stale permissions.", cluster: "staging", namespace: "sandbox", recommendation: "Review and remove if no longer needed." },
      { id: "find-6", finding_type: "broad_namespace_admin", severity: "high", subject: "sre-team", description: "Group has admin role in production namespace, granting full control including RBAC modification.", cluster: "prod-east", namespace: "production", recommendation: "Use edit role instead and manage RBAC separately through policy." },
    ]),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
