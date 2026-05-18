package k8s

import (
	"context"
	"fmt"
	"sort"
	"sync"

	"github.com/kubestellar/console/pkg/safego"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func (m *MultiClusterClient) ResolveDependencies(
	ctx context.Context,
	sourceCluster string,
	namespace string,
	workloadObj *unstructured.Unstructured,
	opts *DeployOptions,
) (*DependencyBundle, error) {
	bundle := &DependencyBundle{Workload: workloadObj}

	dynClient, err := m.GetDynamicClient(sourceCluster)
	if err != nil {
		return nil, fmt.Errorf("failed to get dynamic client for %s: %w", sourceCluster, err)
	}

	podSpec, err := extractPodTemplateSpec(workloadObj)
	if err != nil {
		return bundle, nil
	}

	seen := make(map[string]bool)
	addDep := func(kind DependencyKind, name, ns string, gvr schema.GroupVersionResource, optional bool) {
		if name == "" {
			return
		}
		key := dependencyKey(kind, name)
		if seen[key] {
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

	allContainers := append(getSlice(podSpec, "containers"), getSlice(podSpec, "initContainers")...)
	allContainers = append(allContainers, getSlice(podSpec, "ephemeralContainers")...)

	configMaps, secrets := walkContainerRefs(allContainers)
	for _, name := range configMaps {
		addDep(DepConfigMap, name, namespace, gvrConfigMaps, false)
	}
	for _, name := range secrets {
		addDep(DepSecret, name, namespace, gvrSecrets, false)
	}

	volConfigMaps, volSecrets, volPVCs := walkVolumeRefs(getSlice(podSpec, "volumes"))
	for _, name := range volConfigMaps {
		addDep(DepConfigMap, name, namespace, gvrConfigMaps, false)
	}
	for _, name := range volSecrets {
		addDep(DepSecret, name, namespace, gvrSecrets, false)
	}
	for _, name := range volPVCs {
		addDep(DepPVC, name, namespace, gvrPVCs, false)
	}

	for _, ps := range getSlice(podSpec, "imagePullSecrets") {
		psMap, ok := ps.(map[string]interface{})
		if !ok {
			continue
		}
		if name, _ := psMap["name"].(string); name != "" {
			addDep(DepSecret, name, namespace, gvrSecrets, true)
		}
	}

	saName, _, _ := unstructured.NestedString(podSpec, "serviceAccountName")
	if saName != "" && saName != "default" {
		addDep(DepServiceAccount, saName, namespace, gvrServiceAccounts, false)
		rbacDeps, rbacWarnings := m.resolveRBACForSA(ctx, sourceCluster, namespace, saName)
		appendUniqueDependencies(bundle, seen, rbacDeps)
		bundle.Warnings = append(bundle.Warnings, rbacWarnings...)
	}

	podLabels := extractPodTemplateLabels(workloadObj)
	if len(podLabels) > 0 {
		svcDeps, svcWarnings := m.findMatchingServices(ctx, sourceCluster, namespace, podLabels)
		appendUniqueDependencies(bundle, seen, svcDeps)
		bundle.Warnings = append(bundle.Warnings, svcWarnings...)

		matchedServiceNames := make([]string, 0, len(svcDeps))
		for _, d := range svcDeps {
			matchedServiceNames = append(matchedServiceNames, d.Name)
		}
		if len(matchedServiceNames) > 0 {
			appendUniqueDependencies(bundle, seen, m.findMatchingIngresses(ctx, sourceCluster, namespace, matchedServiceNames))
		}

		appendUniqueDependencies(bundle, seen, m.findMatchingNetworkPolicies(ctx, sourceCluster, namespace, podLabels))
		appendUniqueDependencies(bundle, seen, m.findMatchingPDBs(ctx, sourceCluster, namespace, podLabels))
	}

	appendUniqueDependencies(bundle, seen, m.findMatchingHPAs(ctx, sourceCluster, namespace, workloadObj))

	matchedServiceNames := collectServiceNames(bundle.Dependencies)
	if len(matchedServiceNames) > 0 {
		appendUniqueDependencies(bundle, seen, m.findRelatedCRDs(ctx, sourceCluster, namespace, matchedServiceNames))
		appendUniqueDependencies(bundle, seen, m.findMatchingWebhookConfigs(ctx, sourceCluster, namespace, matchedServiceNames, false))
		appendUniqueDependencies(bundle, seen, m.findMatchingWebhookConfigs(ctx, sourceCluster, namespace, matchedServiceNames, true))
	}

	type fetchResult struct {
		dep  Dependency
		warn string
	}

	results := make([]fetchResult, len(bundle.Dependencies))
	var wg sync.WaitGroup
	sem := make(chan struct{}, maxParallelFetches)

	for i, dep := range bundle.Dependencies {
		idx := i
		d := dep
		wg.Add(1)
		safego.Go(func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			var (
				obj      *unstructured.Unstructured
				fetchErr error
			)
			if d.Namespace != "" {
				obj, fetchErr = dynClient.Resource(d.GVR).Namespace(d.Namespace).Get(ctx, d.Name, metav1.GetOptions{})
			} else {
				obj, fetchErr = dynClient.Resource(d.GVR).Get(ctx, d.Name, metav1.GetOptions{})
			}
			if fetchErr != nil {
				if d.Optional {
					results[idx] = fetchResult{warn: fmt.Sprintf("%s %s not found on source (optional, skipping)", d.Kind, d.Name)}
				} else {
					results[idx] = fetchResult{warn: fmt.Sprintf("%s %s not found on source cluster %s", d.Kind, d.Name, sourceCluster)}
				}
				return
			}
			if obj == nil {
				results[idx] = fetchResult{warn: fmt.Sprintf("%s %s returned nil object from source cluster %s", d.Kind, d.Name, sourceCluster)}
				return
			}
			if d.Kind == DepSecret {
				secretType, _, _ := unstructured.NestedString(obj.Object, "type")
				if secretType == "kubernetes.io/service-account-token" {
					results[idx] = fetchResult{warn: fmt.Sprintf("Secret %s is a service-account-token (auto-generated, skipping)", d.Name)}
					return
				}
			}

			d.Object = cleanManifestForDeploy(obj, sourceCluster, opts)
			results[idx] = fetchResult{dep: d}
		})
	}
	wg.Wait()

	var fetchedDeps []Dependency
	for _, result := range results {
		if result.warn != "" {
			bundle.Warnings = append(bundle.Warnings, result.warn)
			continue
		}
		if result.dep.Object != nil {
			fetchedDeps = append(fetchedDeps, result.dep)
		}
	}

	sort.Slice(fetchedDeps, func(i, j int) bool {
		return fetchedDeps[i].Order < fetchedDeps[j].Order
	})

	bundle.Dependencies = fetchedDeps
	return bundle, nil
}

func dependencyKey(kind DependencyKind, name string) string {
	return fmt.Sprintf("%s/%s", kind, name)
}

func appendUniqueDependencies(bundle *DependencyBundle, seen map[string]bool, deps []Dependency) {
	for _, dep := range deps {
		key := dependencyKey(dep.Kind, dep.Name)
		if dep.Name == "" || seen[key] {
			continue
		}
		seen[key] = true
		bundle.Dependencies = append(bundle.Dependencies, dep)
	}
}
