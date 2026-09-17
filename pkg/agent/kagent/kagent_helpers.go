package kagent

import (
	"strings"

	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// --- Helpers ---

func nestedString(obj map[string]any, fields ...string) string {
	val, found, err := unstructured.NestedString(obj, fields...)
	if err != nil || !found {
		return ""
	}
	return val
}

func nestedInt64(obj map[string]any, fields ...string) int64 {
	val, found, err := unstructured.NestedInt64(obj, fields...)
	if err != nil || !found {
		return 0
	}
	return val
}

func nestedStringSlice(obj map[string]any, fields ...string) []string {
	val, found, err := unstructured.NestedStringSlice(obj, fields...)
	if err != nil || !found {
		return nil
	}
	return val
}

func extractConditionStatus(statusMap map[string]any, conditionType string) bool {
	conditions, found, _ := unstructured.NestedSlice(statusMap, "conditions")
	if !found {
		return false
	}
	for _, c := range conditions {
		cMap, ok := c.(map[string]any)
		if !ok {
			continue
		}
		if nestedString(cMap, "type") == conditionType {
			return nestedString(cMap, "status") == "True"
		}
	}
	return false
}

func isCRDNotInstalledErr(err error) bool {
	if err == nil {
		return false
	}
	if _, ok := err.(*meta.NoKindMatchError); ok {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "the server could not find the requested resource") ||
		strings.Contains(msg, "no matches for kind")
}

func extractDiscoveredTools(statusMap map[string]any) []DiscoveredTool {
	toolsList, found, _ := unstructured.NestedSlice(statusMap, "discoveredTools")
	if !found {
		return nil
	}
	tools := make([]DiscoveredTool, 0, len(toolsList))
	for _, item := range toolsList {
		toolMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tools = append(tools, DiscoveredTool{
			Name:        nestedString(toolMap, "name"),
			Description: nestedString(toolMap, "description"),
		})
	}
	return tools
}

func extractDiscoveredModels(statusMap map[string]any) []DiscoveredModel {
	modelsList, found, _ := unstructured.NestedSlice(statusMap, "discoveredModels")
	if !found {
		return nil
	}
	models := make([]DiscoveredModel, 0, len(modelsList))
	for _, item := range modelsList {
		modelMap, ok := item.(map[string]any)
		if !ok {
			continue
		}
		models = append(models, DiscoveredModel{
			Name:        nestedString(modelMap, "name"),
			Description: nestedString(modelMap, "description"),
		})
	}
	return models
}
