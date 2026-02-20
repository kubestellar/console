package k8s

import (
	"context"
	"fmt"
	"sort"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// DependencyKind classifies resources by type for ordering and display
type DependencyKind string

const (
	DepNamespace          DependencyKind = "Namespace"
	DepClusterRole        DependencyKind = "ClusterRole"
	DepClusterRoleBinding DependencyKind = "ClusterRoleBinding"
	DepServiceAccount     DependencyKind = "ServiceAccount"
	DepConfigMap          DependencyKind = "ConfigMap"
	DepSecret             DependencyKind = "Secret"
	DepPVC                DependencyKind = "PersistentVolumeClaim"
	DepRole               DependencyKind = "Role"
	DepRoleBinding        DependencyKind = "RoleBinding"
	DepService            DependencyKind = "Service"
	DepIngress            DependencyKind = "Ingress"
	DepNetworkPolicy      DependencyKind = "NetworkPolicy"
	DepHPA                      DependencyKind = "HorizontalPodAutoscaler"
	DepPDB                      DependencyKind = "PodDisruptionBudget"
	DepCRD                      DependencyKind = "CustomResourceDefinition"
	DepValidatingWebhook        DependencyKind = "ValidatingWebhookConfiguration"
	DepMutatingWebhook          DependencyKind = "MutatingWebhookConfiguration"
)

// Apply order: lower = applied first
var depApplyOrder = map[DependencyKind]int{
	DepNamespace:          0,
	DepClusterRole:        1,
	DepClusterRoleBinding: 2,
	DepServiceAccount:     3,
	DepRole:               4,
	DepRoleBinding:        5,
	DepConfigMap:          6,
	DepSecret:             7,
	DepPVC:                8,
	DepService:            9,
	DepIngress:            10,
	DepNetworkPolicy:      11,
	DepHPA:                      12,
	DepPDB:                      13,
	DepCRD:                      14,
	DepValidatingWebhook:        15,
	DepMutatingWebhook:          16,
}

// GVRs for dependency resource types
var (
	gvrNamespaces = schema.GroupVersionResource{
		Version:  "v1",
		Resource: "namespaces",
	}
	gvrConfigMaps = schema.GroupVersionResource{
		Version:  "v1",
		Resource: "configmaps",
	}
	gvrSecrets = schema.GroupVersionResource{
		Version:  "v1",
		Resource: "secrets",
	}
	gvrServiceAccounts = schema.GroupVersionResource{
		Version:  "v1",
		Resource: "serviceaccounts",
	}
	gvrServices = schema.GroupVersionResource{
		Version:  "v1",
		Resource: "services",
	}
	gvrPVCs = schema.GroupVersionResource{
		Version:  "v1",
		Resource: "persistentvolumeclaims",
	}
	gvrRoles = schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "roles",
	}
	gvrRoleBindings = schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "rolebindings",
	}
	gvrClusterRoles = schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "clusterroles",
	}
	gvrClusterRoleBindings = schema.GroupVersionResource{
		Group:    "rbac.authorization.k8s.io",
		Version:  "v1",
		Resource: "clusterrolebindings",
	}
	gvrIngresses = schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "ingresses",
	}
	gvrNetworkPolicies = schema.GroupVersionResource{
		Group:    "networking.k8s.io",
		Version:  "v1",
		Resource: "networkpolicies",
	}
	gvrHPAs = schema.GroupVersionResource{
		Group:    "autoscaling",
		Version:  "v2",
		Resource: "horizontalpodautoscalers",
	}
	gvrPDBs = schema.GroupVersionResource{
		Group:    "policy",
		Version:  "v1",
		Resource: "poddisruptionbudgets",
	}
	gvrCRDs = schema.GroupVersionResource{
		Group:    "apiextensions.k8s.io",
		Version:  "v1",
		Resource: "customresourcedefinitions",
	}
	gvrValidatingWebhooks = schema.GroupVersionResource{
		Group:    "admissionregistration.k8s.io",
		Version:  "v1",
		Resource: "validatingwebhookconfigurations",
	}
	gvrMutatingWebhooks = schema.GroupVersionResource{
		Group:    "admissionregistration.k8s.io",
		Version:  "v1",
		Resource: "mutatingwebhookconfigurations",
	}
)

// Dependency is a single resource that must be deployed alongside a workload
type Dependency struct {
	Kind      DependencyKind
	Name      string
	Namespace string // empty for cluster-scoped resources
	GVR       schema.GroupVersionResource
	Object    *unstructured.Unstructured // fetched and cleaned manifest
	Order     int                        // apply priority (lower = first)
	Optional  bool                       // skip if not found on source
}

// DependencyBundle contains a workload and all resources it depends on
type DependencyBundle struct {
	Workload     *unstructured.Unstructured
	Dependencies []Dependency // sorted by Order
	Warnings     []string     // non-fatal issues (e.g., "Secret x not found on source")
}

// ResolveDependencies walks a workload's pod spec to discover all referenced
// resources (ConfigMaps, Secrets, ServiceAccounts, RBAC, PVCs, Services,
// Ingresses, NetworkPolicies, HPAs, PDBs), fetches them from the source
// cluster, and returns a sorted bundle ready to apply.
func (m *MultiClusterClient) ResolveDependencies(
	ctx context.Context,
	sourceCluster string,
	namespace string,
	workloadObj *unstructured.Unstructured,
	opts *DeployOptions,
) (*DependencyBundle, error) {
	bundle := &DependencyBundle{
		Workload: workloadObj,
	}

	dynClient, err := m.GetDynamicClient(sourceCluster)
	if err != nil {
		return nil, fmt.Errorf("failed to get dynamic client for %s: %w", sourceCluster, err)
	}

	// Extract pod template spec
	podSpec, err := extractPodTemplateSpec(workloadObj)
	if err != nil {
		return bundle, nil // no pod spec = no deps to resolve
	}

	// Track unique deps to avoid duplicates
	seen := make(map[string]bool) // "Kind/Name"
	addDep := func(kind DependencyKind, name, ns string, gvr schema.GroupVersionResource, optional bool) {
		key := fmt.Sprintf("%s/%s", kind, name)
		if seen[key] || name == "" {
			return
		}
		seen[key] = true
		bundle.Dependencies = append(bundle.Dependencies, Dependency{
			Kind:      kind,
			Name:      name,
			Namespace: ns,
			GVR:       gvr,
			Order:     depApplyOrder[kind],
			Optional:  optional,
		})
	}

	// 1. Walk containers + initContainers for ConfigMap and Secret refs
	containers := getSlice(podSpec, "containers")
	initContainers := getSlice(podSpec, "initContainers")
	allContainers := append(containers, initContainers...)

	configMaps, secrets := walkContainerRefs(allContainers)
	for _, name := range configMaps {
		addDep(DepConfigMap, name, namespace, gvrConfigMaps, false)
	}
	for _, name := range secrets {
		addDep(DepSecret, name, namespace, gvrSecrets, false)
	}

	// 2. Walk volumes for ConfigMap, Secret, PVC refs
	volumes := getSlice(podSpec, "volumes")
	volConfigMaps, volSecrets, volPVCs := walkVolumeRefs(volumes)
	for _, name := range volConfigMaps {
		addDep(DepConfigMap, name, namespace, gvrConfigMaps, false)
	}
	for _, name := range volSecrets {
		addDep(DepSecret, name, namespace, gvrSecrets, false)
	}
	for _, name := range volPVCs {
		addDep(DepPVC, name, namespace, gvrPVCs, false)
	}

	// 3. Walk imagePullSecrets
	pullSecrets := getSlice(podSpec, "imagePullSecrets")
	for _, ps := range pullSecrets {
		if psMap, ok := ps.(map[string]interface{}); ok {
			if name, _ := psMap["name"].(string); name != "" {
				addDep(DepSecret, name, namespace, gvrSecrets, true) // optional: may use cluster default
			}
		}
	}

	// 4. ServiceAccount
	saName, _, _ := unstructured.NestedString(podSpec, "serviceAccountName")
	if saName != "" && saName != "default" {
		addDep(DepServiceAccount, saName, namespace, gvrServiceAccounts, false)

		// 5. Resolve RBAC for the ServiceAccount
		rbacDeps, rbacWarnings := m.resolveRBACForSA(ctx, sourceCluster, namespace, saName)
		for _, d := range rbacDeps {
			key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
			if !seen[key] {
				seen[key] = true
				bundle.Dependencies = append(bundle.Dependencies, d)
			}
		}
		bundle.Warnings = append(bundle.Warnings, rbacWarnings...)
	}

	// 6. Find Services that match pod template labels
	podLabels := extractPodTemplateLabels(workloadObj)
	if len(podLabels) > 0 {
		svcDeps, svcWarnings := m.findMatchingServices(ctx, sourceCluster, namespace, podLabels)
		for _, d := range svcDeps {
			key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
			if !seen[key] {
				seen[key] = true
				bundle.Dependencies = append(bundle.Dependencies, d)
			}
		}
		bundle.Warnings = append(bundle.Warnings, svcWarnings...)

		// 7. Find Ingresses that reference matched Services
		matchedServiceNames := make([]string, 0, len(svcDeps))
		for _, d := range svcDeps {
			matchedServiceNames = append(matchedServiceNames, d.Name)
		}
		if len(matchedServiceNames) > 0 {
			ingDeps := m.findMatchingIngresses(ctx, sourceCluster, namespace, matchedServiceNames)
			for _, d := range ingDeps {
				key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
				if !seen[key] {
					seen[key] = true
					bundle.Dependencies = append(bundle.Dependencies, d)
				}
			}
		}

		// 8. Find NetworkPolicies that match pod template labels
		npDeps := m.findMatchingNetworkPolicies(ctx, sourceCluster, namespace, podLabels)
		for _, d := range npDeps {
			key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
			if !seen[key] {
				seen[key] = true
				bundle.Dependencies = append(bundle.Dependencies, d)
			}
		}

		// 9. Find PodDisruptionBudgets that match pod template labels
		pdbDeps := m.findMatchingPDBs(ctx, sourceCluster, namespace, podLabels)
		for _, d := range pdbDeps {
			key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
			if !seen[key] {
				seen[key] = true
				bundle.Dependencies = append(bundle.Dependencies, d)
			}
		}
	}

	// 10. Find HPAs that target this workload
	hpaDeps := m.findMatchingHPAs(ctx, sourceCluster, namespace, workloadObj)
	for _, d := range hpaDeps {
		key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
		if !seen[key] {
			seen[key] = true
			bundle.Dependencies = append(bundle.Dependencies, d)
		}
	}

	// 11. Find CRDs whose conversion webhook references matched services
	matchedServiceNames := collectServiceNames(bundle.Dependencies)
	if len(matchedServiceNames) > 0 {
		crdDeps := m.findRelatedCRDs(ctx, sourceCluster, namespace, matchedServiceNames)
		for _, d := range crdDeps {
			key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
			if !seen[key] {
				seen[key] = true
				bundle.Dependencies = append(bundle.Dependencies, d)
			}
		}
	}

	// 12. Find ValidatingWebhookConfigurations that reference matched services
	if len(matchedServiceNames) > 0 {
		vwhDeps := m.findMatchingWebhookConfigs(ctx, sourceCluster, namespace, matchedServiceNames, false)
		for _, d := range vwhDeps {
			key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
			if !seen[key] {
				seen[key] = true
				bundle.Dependencies = append(bundle.Dependencies, d)
			}
		}

		// 13. Find MutatingWebhookConfigurations that reference matched services
		mwhDeps := m.findMatchingWebhookConfigs(ctx, sourceCluster, namespace, matchedServiceNames, true)
		for _, d := range mwhDeps {
			key := fmt.Sprintf("%s/%s", d.Kind, d.Name)
			if !seen[key] {
				seen[key] = true
				bundle.Dependencies = append(bundle.Dependencies, d)
			}
		}
	}

	// 14. Fetch each dependency from the source cluster
	var fetchedDeps []Dependency
	for _, dep := range bundle.Dependencies {
		var obj *unstructured.Unstructured
		var fetchErr error

		if dep.Namespace != "" {
			obj, fetchErr = dynClient.Resource(dep.GVR).Namespace(dep.Namespace).Get(ctx, dep.Name, metav1.GetOptions{})
		} else {
			obj, fetchErr = dynClient.Resource(dep.GVR).Get(ctx, dep.Name, metav1.GetOptions{})
		}

		if fetchErr != nil {
			if dep.Optional {
				bundle.Warnings = append(bundle.Warnings,
					fmt.Sprintf("%s %s not found on source (optional, skipping)", dep.Kind, dep.Name))
				continue
			}
			bundle.Warnings = append(bundle.Warnings,
				fmt.Sprintf("%s %s not found on source cluster %s", dep.Kind, dep.Name, sourceCluster))
			continue
		}
		if obj == nil {
			bundle.Warnings = append(bundle.Warnings,
				fmt.Sprintf("%s %s returned nil object from source cluster %s", dep.Kind, dep.Name, sourceCluster))
			continue
		}

		// Clean the manifest for cross-cluster deploy
		dep.Object = cleanManifestForDeploy(obj, opts)

		// For Secrets: strip service-account-token type secrets (auto-generated, cluster-specific)
		if dep.Kind == DepSecret {
			secretType, _, _ := unstructured.NestedString(obj.Object, "type")
			if secretType == "kubernetes.io/service-account-token" {
				bundle.Warnings = append(bundle.Warnings,
					fmt.Sprintf("Secret %s is a service-account-token (auto-generated, skipping)", dep.Name))
				continue
			}
		}

		fetchedDeps = append(fetchedDeps, dep)
	}

	// 8. Sort by apply order
	sort.Slice(fetchedDeps, func(i, j int) bool {
		return fetchedDeps[i].Order < fetchedDeps[j].Order
	})

	bundle.Dependencies = fetchedDeps
	return bundle, nil
}

// extractPodTemplateSpec navigates to spec.template.spec in a workload object
func extractPodTemplateSpec(obj *unstructured.Unstructured) (map[string]interface{}, error) {
	spec, ok := obj.Object["spec"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("no spec found")
	}
	template, ok := spec["template"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("no spec.template found")
	}
	podSpec, ok := template["spec"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("no spec.template.spec found")
	}
	return podSpec, nil
}

// extractPodTemplateLabels gets labels from spec.template.metadata.labels
func extractPodTemplateLabels(obj *unstructured.Unstructured) map[string]string {
	labels, _, _ := unstructured.NestedStringMap(obj.Object, "spec", "template", "metadata", "labels")
	return labels
}

// walkContainerRefs extracts ConfigMap and Secret names from container env/envFrom
func walkContainerRefs(containers []interface{}) (configMaps, secrets []string) {
	cmSet := make(map[string]bool)
	secSet := make(map[string]bool)

	for _, c := range containers {
		container, ok := c.(map[string]interface{})
		if !ok {
			continue
		}

		// env[].valueFrom.configMapKeyRef / secretKeyRef
		envVars := getSlice(container, "env")
		for _, e := range envVars {
			env, ok := e.(map[string]interface{})
			if !ok {
				continue
			}
			valueFrom, ok := env["valueFrom"].(map[string]interface{})
			if !ok {
				continue
			}
			if cmRef, ok := valueFrom["configMapKeyRef"].(map[string]interface{}); ok {
				if name, _ := cmRef["name"].(string); name != "" {
					cmSet[name] = true
				}
			}
			if secRef, ok := valueFrom["secretKeyRef"].(map[string]interface{}); ok {
				if name, _ := secRef["name"].(string); name != "" {
					secSet[name] = true
				}
			}
		}

		// envFrom[].configMapRef / secretRef
		envFroms := getSlice(container, "envFrom")
		for _, ef := range envFroms {
			envFrom, ok := ef.(map[string]interface{})
			if !ok {
				continue
			}
			if cmRef, ok := envFrom["configMapRef"].(map[string]interface{}); ok {
				if name, _ := cmRef["name"].(string); name != "" {
					cmSet[name] = true
				}
			}
			if secRef, ok := envFrom["secretRef"].(map[string]interface{}); ok {
				if name, _ := secRef["name"].(string); name != "" {
					secSet[name] = true
				}
			}
		}
	}

	for name := range cmSet {
		configMaps = append(configMaps, name)
	}
	for name := range secSet {
		secrets = append(secrets, name)
	}
	return
}

// walkVolumeRefs extracts ConfigMap, Secret, and PVC names from volume definitions
func walkVolumeRefs(volumes []interface{}) (configMaps, secrets, pvcs []string) {
	cmSet := make(map[string]bool)
	secSet := make(map[string]bool)
	pvcSet := make(map[string]bool)

	for _, v := range volumes {
		vol, ok := v.(map[string]interface{})
		if !ok {
			continue
		}

		// volumes[].configMap.name
		if cm, ok := vol["configMap"].(map[string]interface{}); ok {
			if name, _ := cm["name"].(string); name != "" {
				cmSet[name] = true
			}
		}

		// volumes[].secret.secretName
		if sec, ok := vol["secret"].(map[string]interface{}); ok {
			if name, _ := sec["secretName"].(string); name != "" {
				secSet[name] = true
			}
		}

		// volumes[].persistentVolumeClaim.claimName
		if pvc, ok := vol["persistentVolumeClaim"].(map[string]interface{}); ok {
			if name, _ := pvc["claimName"].(string); name != "" {
				pvcSet[name] = true
			}
		}

		// volumes[].projected.sources[].configMap / secret
		if projected, ok := vol["projected"].(map[string]interface{}); ok {
			sources := getSlice(projected, "sources")
			for _, s := range sources {
				src, ok := s.(map[string]interface{})
				if !ok {
					continue
				}
				if cm, ok := src["configMap"].(map[string]interface{}); ok {
					if name, _ := cm["name"].(string); name != "" {
						cmSet[name] = true
					}
				}
				if sec, ok := src["secret"].(map[string]interface{}); ok {
					if name, _ := sec["name"].(string); name != "" {
						secSet[name] = true
					}
				}
			}
		}
	}

	for name := range cmSet {
		configMaps = append(configMaps, name)
	}
	for name := range secSet {
		secrets = append(secrets, name)
	}
	for name := range pvcSet {
		pvcs = append(pvcs, name)
	}
	return
}

// resolveRBACForSA finds all Role/ClusterRole bindings that reference a ServiceAccount
// and returns the bindings + their referenced roles as dependencies
func (m *MultiClusterClient) resolveRBACForSA(
	ctx context.Context, cluster, namespace, saName string,
) ([]Dependency, []string) {
	var deps []Dependency
	var warnings []string

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("Cannot resolve RBAC: %v", err))
		return deps, warnings
	}

	// Check namespace-scoped RoleBindings
	rbList, err := dynClient.Resource(gvrRoleBindings).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rb := range rbList.Items {
			if bindingReferencesSA(rb.Object, saName, namespace) {
				deps = append(deps, Dependency{
					Kind:      DepRoleBinding,
					Name:      rb.GetName(),
					Namespace: namespace,
					GVR:       gvrRoleBindings,
					Order:     depApplyOrder[DepRoleBinding],
				})

				// Fetch the referenced Role
				roleName := getRoleRefName(rb.Object)
				roleKind := getRoleRefKind(rb.Object)
				if roleName != "" && roleKind == "Role" {
					deps = append(deps, Dependency{
						Kind:      DepRole,
						Name:      roleName,
						Namespace: namespace,
						GVR:       gvrRoles,
						Order:     depApplyOrder[DepRole],
					})
				}
			}
		}
	}

	// Check cluster-scoped ClusterRoleBindings
	crbList, err := dynClient.Resource(gvrClusterRoleBindings).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, crb := range crbList.Items {
			if bindingReferencesSA(crb.Object, saName, namespace) {
				deps = append(deps, Dependency{
					Kind:  DepClusterRoleBinding,
					Name:  crb.GetName(),
					GVR:   gvrClusterRoleBindings,
					Order: depApplyOrder[DepClusterRoleBinding],
				})

				// Fetch the referenced ClusterRole
				roleName := getRoleRefName(crb.Object)
				if roleName != "" && !isSystemClusterRole(roleName) {
					deps = append(deps, Dependency{
						Kind:  DepClusterRole,
						Name:  roleName,
						GVR:   gvrClusterRoles,
						Order: depApplyOrder[DepClusterRole],
					})
				}
			}
		}
	}

	return deps, warnings
}

// findMatchingServices finds Services whose selector matches the pod template labels
func (m *MultiClusterClient) findMatchingServices(
	ctx context.Context, cluster, namespace string, podLabels map[string]string,
) ([]Dependency, []string) {
	var deps []Dependency
	var warnings []string

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		warnings = append(warnings, fmt.Sprintf("Cannot resolve Services: %v", err))
		return deps, warnings
	}

	svcList, err := dynClient.Resource(gvrServices).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps, warnings
	}

	for _, svc := range svcList.Items {
		selector, _, _ := unstructured.NestedStringMap(svc.Object, "spec", "selector")
		if len(selector) == 0 {
			continue
		}

		if labelsMatch(selector, podLabels) {
			deps = append(deps, Dependency{
				Kind:      DepService,
				Name:      svc.GetName(),
				Namespace: namespace,
				GVR:       gvrServices,
				Order:     depApplyOrder[DepService],
			})
		}
	}

	return deps, warnings
}

// findMatchingIngresses finds Ingresses that reference any of the given Service names
func (m *MultiClusterClient) findMatchingIngresses(
	ctx context.Context, cluster, namespace string, serviceNames []string,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	svcSet := make(map[string]bool, len(serviceNames))
	for _, name := range serviceNames {
		svcSet[name] = true
	}

	ingList, err := dynClient.Resource(gvrIngresses).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, ing := range ingList.Items {
		if ingressReferencesServices(ing.Object, svcSet) {
			deps = append(deps, Dependency{
				Kind:      DepIngress,
				Name:      ing.GetName(),
				Namespace: namespace,
				GVR:       gvrIngresses,
				Order:     depApplyOrder[DepIngress],
			})
		}
	}
	return deps
}

// ingressReferencesServices checks if an Ingress references any service in the set.
// Checks spec.defaultBackend.service.name and spec.rules[].http.paths[].backend.service.name
func ingressReferencesServices(obj map[string]interface{}, svcSet map[string]bool) bool {
	spec, ok := obj["spec"].(map[string]interface{})
	if !ok {
		return false
	}

	// Check defaultBackend
	if db, ok := spec["defaultBackend"].(map[string]interface{}); ok {
		if svc, ok := db["service"].(map[string]interface{}); ok {
			if name, _ := svc["name"].(string); svcSet[name] {
				return true
			}
		}
	}

	// Check rules[].http.paths[].backend.service.name
	rules, _ := spec["rules"].([]interface{})
	for _, r := range rules {
		rule, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		httpRule, ok := rule["http"].(map[string]interface{})
		if !ok {
			continue
		}
		paths, _ := httpRule["paths"].([]interface{})
		for _, p := range paths {
			path, ok := p.(map[string]interface{})
			if !ok {
				continue
			}
			backend, ok := path["backend"].(map[string]interface{})
			if !ok {
				continue
			}
			svc, ok := backend["service"].(map[string]interface{})
			if !ok {
				continue
			}
			if name, _ := svc["name"].(string); svcSet[name] {
				return true
			}
		}
	}
	return false
}

// findMatchingNetworkPolicies finds NetworkPolicies whose podSelector matches pod labels
func (m *MultiClusterClient) findMatchingNetworkPolicies(
	ctx context.Context, cluster, namespace string, podLabels map[string]string,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	npList, err := dynClient.Resource(gvrNetworkPolicies).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, np := range npList.Items {
		selector, _, _ := unstructured.NestedStringMap(np.Object, "spec", "podSelector", "matchLabels")
		// Empty podSelector means "all pods in namespace" — skip those, they're not workload-specific
		if len(selector) == 0 {
			continue
		}
		if labelsMatch(selector, podLabels) {
			deps = append(deps, Dependency{
				Kind:      DepNetworkPolicy,
				Name:      np.GetName(),
				Namespace: namespace,
				GVR:       gvrNetworkPolicies,
				Order:     depApplyOrder[DepNetworkPolicy],
			})
		}
	}
	return deps
}

// findMatchingHPAs finds HorizontalPodAutoscalers that target this workload
func (m *MultiClusterClient) findMatchingHPAs(
	ctx context.Context, cluster, namespace string, workloadObj *unstructured.Unstructured,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	workloadName := workloadObj.GetName()
	workloadKind := workloadObj.GetKind()

	hpaList, err := dynClient.Resource(gvrHPAs).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// autoscaling/v2 may not be available; try v1
		gvrHPAv1 := schema.GroupVersionResource{Group: "autoscaling", Version: "v1", Resource: "horizontalpodautoscalers"}
		hpaList, err = dynClient.Resource(gvrHPAv1).Namespace(namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return deps
		}
	}

	for _, hpa := range hpaList.Items {
		targetKind, _, _ := unstructured.NestedString(hpa.Object, "spec", "scaleTargetRef", "kind")
		targetName, _, _ := unstructured.NestedString(hpa.Object, "spec", "scaleTargetRef", "name")

		if targetName == workloadName && targetKind == workloadKind {
			deps = append(deps, Dependency{
				Kind:      DepHPA,
				Name:      hpa.GetName(),
				Namespace: namespace,
				GVR:       gvrHPAs,
				Order:     depApplyOrder[DepHPA],
			})
		}
	}
	return deps
}

// findMatchingPDBs finds PodDisruptionBudgets whose selector matches pod labels
func (m *MultiClusterClient) findMatchingPDBs(
	ctx context.Context, cluster, namespace string, podLabels map[string]string,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	pdbList, err := dynClient.Resource(gvrPDBs).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, pdb := range pdbList.Items {
		selector, _, _ := unstructured.NestedStringMap(pdb.Object, "spec", "selector", "matchLabels")
		if len(selector) == 0 {
			continue
		}
		if labelsMatch(selector, podLabels) {
			deps = append(deps, Dependency{
				Kind:      DepPDB,
				Name:      pdb.GetName(),
				Namespace: namespace,
				GVR:       gvrPDBs,
				Order:     depApplyOrder[DepPDB],
			})
		}
	}
	return deps
}

// labelsMatch returns true if all selector labels are present in the target labels
func labelsMatch(selector, target map[string]string) bool {
	for k, v := range selector {
		if target[k] != v {
			return false
		}
	}
	return true
}

// bindingReferencesSA checks if a RoleBinding/ClusterRoleBinding references a specific ServiceAccount
func bindingReferencesSA(obj map[string]interface{}, saName, namespace string) bool {
	subjects, ok := obj["subjects"].([]interface{})
	if !ok {
		return false
	}
	for _, s := range subjects {
		subject, ok := s.(map[string]interface{})
		if !ok {
			continue
		}
		kind, _ := subject["kind"].(string)
		name, _ := subject["name"].(string)
		ns, _ := subject["namespace"].(string)

		if kind == "ServiceAccount" && name == saName && (ns == namespace || ns == "") {
			return true
		}
	}
	return false
}

// getRoleRefName extracts the role name from a binding's roleRef
func getRoleRefName(obj map[string]interface{}) string {
	roleRef, ok := obj["roleRef"].(map[string]interface{})
	if !ok {
		return ""
	}
	name, _ := roleRef["name"].(string)
	return name
}

// getRoleRefKind extracts the role kind (Role or ClusterRole) from a binding's roleRef
func getRoleRefKind(obj map[string]interface{}) string {
	roleRef, ok := obj["roleRef"].(map[string]interface{})
	if !ok {
		return ""
	}
	kind, _ := roleRef["kind"].(string)
	return kind
}

// isSystemClusterRole returns true for built-in ClusterRoles that shouldn't be copied
func isSystemClusterRole(name string) bool {
	systemPrefixes := []string{
		"system:", "admin", "cluster-admin", "edit", "view",
		"kubeadm:", "calico", "flannel", "kindnet",
	}
	for _, prefix := range systemPrefixes {
		if strings.HasPrefix(name, prefix) || name == prefix {
			return true
		}
	}
	return false
}

// collectServiceNames extracts Service dependency names from a bundle
func collectServiceNames(deps []Dependency) []string {
	var names []string
	for _, d := range deps {
		if d.Kind == DepService {
			names = append(names, d.Name)
		}
	}
	return names
}

// findRelatedCRDs finds CRDs whose conversion webhook references a service
// in the given namespace with one of the given names
func (m *MultiClusterClient) findRelatedCRDs(
	ctx context.Context, cluster, namespace string, serviceNames []string,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	svcSet := make(map[string]bool, len(serviceNames))
	for _, n := range serviceNames {
		svcSet[n] = true
	}

	crdList, err := dynClient.Resource(gvrCRDs).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, crd := range crdList.Items {
		// Check spec.conversion.webhook.clientConfig.service
		svcName, _, _ := unstructured.NestedString(crd.Object,
			"spec", "conversion", "webhook", "clientConfig", "service", "name")
		svcNS, _, _ := unstructured.NestedString(crd.Object,
			"spec", "conversion", "webhook", "clientConfig", "service", "namespace")

		if svcName != "" && svcSet[svcName] && svcNS == namespace {
			deps = append(deps, Dependency{
				Kind:  DepCRD,
				Name:  crd.GetName(),
				GVR:   gvrCRDs,
				Order: depApplyOrder[DepCRD],
			})
		}
	}
	return deps
}

// findMatchingWebhookConfigs finds ValidatingWebhookConfiguration or
// MutatingWebhookConfiguration resources whose webhook clientConfig.service
// references one of the given service names in the given namespace.
func (m *MultiClusterClient) findMatchingWebhookConfigs(
	ctx context.Context, cluster, namespace string, serviceNames []string, mutating bool,
) []Dependency {
	var deps []Dependency

	dynClient, err := m.GetDynamicClient(cluster)
	if err != nil {
		return deps
	}

	svcSet := make(map[string]bool, len(serviceNames))
	for _, n := range serviceNames {
		svcSet[n] = true
	}

	gvr := gvrValidatingWebhooks
	kind := DepValidatingWebhook
	if mutating {
		gvr = gvrMutatingWebhooks
		kind = DepMutatingWebhook
	}

	whList, err := dynClient.Resource(gvr).List(ctx, metav1.ListOptions{})
	if err != nil {
		return deps
	}

	for _, wh := range whList.Items {
		webhooks := getSlice(wh.Object, "webhooks")
		for _, w := range webhooks {
			webhook, ok := w.(map[string]interface{})
			if !ok {
				continue
			}
			clientConfig, ok := webhook["clientConfig"].(map[string]interface{})
			if !ok {
				continue
			}
			svc, ok := clientConfig["service"].(map[string]interface{})
			if !ok {
				continue
			}
			svcName, _ := svc["name"].(string)
			svcNS, _ := svc["namespace"].(string)

			if svcName != "" && svcSet[svcName] && svcNS == namespace {
				deps = append(deps, Dependency{
					Kind:  kind,
					Name:  wh.GetName(),
					GVR:   gvr,
					Order: depApplyOrder[kind],
				})
				break // one match is enough per webhook config
			}
		}
	}
	return deps
}

// getSlice safely extracts a []interface{} from a map
func getSlice(m map[string]interface{}, key string) []interface{} {
	val, ok := m[key].([]interface{})
	if !ok {
		return nil
	}
	return val
}
