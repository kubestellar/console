package k8s

import (
	"fmt"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

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

func extractPodTemplateLabels(obj *unstructured.Unstructured) map[string]string {
	labels, _, _ := unstructured.NestedStringMap(obj.Object, "spec", "template", "metadata", "labels")
	return labels
}

func walkContainerRefs(containers []interface{}) (configMaps, secrets []string) {
	cmSet := make(map[string]bool)
	secSet := make(map[string]bool)

	for _, c := range containers {
		container, ok := c.(map[string]interface{})
		if !ok {
			continue
		}

		for _, e := range getSlice(container, "env") {
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

		for _, ef := range getSlice(container, "envFrom") {
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

	return configMaps, secrets
}

func walkVolumeRefs(volumes []interface{}) (configMaps, secrets, pvcs []string) {
	cmSet := make(map[string]bool)
	secSet := make(map[string]bool)
	pvcSet := make(map[string]bool)

	for _, v := range volumes {
		vol, ok := v.(map[string]interface{})
		if !ok {
			continue
		}

		if cm, ok := vol["configMap"].(map[string]interface{}); ok {
			if name, _ := cm["name"].(string); name != "" {
				cmSet[name] = true
			}
		}
		if sec, ok := vol["secret"].(map[string]interface{}); ok {
			if name, _ := sec["secretName"].(string); name != "" {
				secSet[name] = true
			}
		}
		if pvc, ok := vol["persistentVolumeClaim"].(map[string]interface{}); ok {
			if name, _ := pvc["claimName"].(string); name != "" {
				pvcSet[name] = true
			}
		}
		if projected, ok := vol["projected"].(map[string]interface{}); ok {
			for _, s := range getSlice(projected, "sources") {
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

	return configMaps, secrets, pvcs
}

func collectServiceNames(deps []Dependency) []string {
	var names []string
	for _, d := range deps {
		if d.Kind == DepService {
			names = append(names, d.Name)
		}
	}
	return names
}

func getSlice(m map[string]interface{}, key string) []interface{} {
	val, ok := m[key].([]interface{})
	if !ok {
		return nil
	}
	return val
}
