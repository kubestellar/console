package k8s

import (
	"time"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
)

// parseDeploymentsAsWorkloads parses deployments from unstructured list
func (m *MultiClusterClient) parseDeploymentsAsWorkloads(list interface{}, contextName string) []v1alpha1.Workload {
	workloads := make([]v1alpha1.Workload, 0)

	uList, ok := list.(*unstructured.UnstructuredList)
	if !ok {
		return workloads
	}

	for i := range uList.Items {
		item := &uList.Items[i]
		w := v1alpha1.Workload{
			Name:           item.GetName(),
			Namespace:      item.GetNamespace(),
			Type:           v1alpha1.WorkloadTypeDeployment,
			Labels:         item.GetLabels(),
			CreatedAt:      item.GetCreationTimestamp().Time,
			TargetClusters: []string{contextName},
		}

		content := item.UnstructuredContent()

		// Parse spec.replicas
		if spec, ok := content["spec"].(map[string]interface{}); ok {
			if replicas, ok := spec["replicas"].(int64); ok {
				w.Replicas = safeInt32(replicas)
			}
			// Parse image from first container
			if template, ok := spec["template"].(map[string]interface{}); ok {
				if templateSpec, ok := template["spec"].(map[string]interface{}); ok {
					if containers, ok := templateSpec["containers"].([]interface{}); ok && len(containers) > 0 {
						if container, ok := containers[0].(map[string]interface{}); ok {
							if image, ok := container["image"].(string); ok {
								w.Image = image
							}
						}
					}
				}
			}
		}

		// Parse status — #5955/#5956: include updatedReplicas, observedGeneration,
		// and the ProgressDeadlineExceeded condition so partial rollouts show as
		// pending and failed rollouts surface as Failed with a reason/message.
		if status, ok := content["status"].(map[string]interface{}); ok {
			var readyReplicas, availableReplicas, updatedReplicas int64
			var haveAvailable bool
			if v, ok := status["readyReplicas"].(int64); ok {
				readyReplicas = v
				w.ReadyReplicas = safeInt32(v)
			}
			if v, ok := status["availableReplicas"].(int64); ok {
				availableReplicas = v
				haveAvailable = true
			}
			if v, ok := status["updatedReplicas"].(int64); ok {
				updatedReplicas = v
				w.UpdatedReplicas = safeInt32(v)
			}

			// Observed generation lag indicates the controller hasn't seen the
			// latest spec yet — treat as still progressing.
			var generation, observedGeneration int64
			if meta, ok := content["metadata"].(map[string]interface{}); ok {
				if v, ok := meta["generation"].(int64); ok {
					generation = v
				}
			}
			if v, ok := status["observedGeneration"].(int64); ok {
				observedGeneration = v
			}

			// Check deployment conditions for ProgressDeadlineExceeded / ReplicaFailure.
			var failureReason, failureMessage string
			var progressing bool
			if conds, ok := status["conditions"].([]interface{}); ok {
				for _, cRaw := range conds {
					cond, ok := cRaw.(map[string]interface{})
					if !ok {
						continue
					}
					condType, _ := cond["type"].(string)
					condStatus, _ := cond["status"].(string)
					reason, _ := cond["reason"].(string)
					message, _ := cond["message"].(string)
					switch condType {
					case "Progressing":
						// status=False means rollout has failed (ProgressDeadlineExceeded)
						if condStatus == "False" {
							failureReason = reason
							failureMessage = message
						} else if condStatus == "True" && reason != "NewReplicaSetAvailable" {
							progressing = true
						}
					case "ReplicaFailure":
						if condStatus == "True" {
							failureReason = reason
							failureMessage = message
						}
					}
				}
			}

			switch {
			case failureReason != "":
				// Rollout explicitly failed — don't mask as Degraded/Pending.
				w.Status = v1alpha1.WorkloadStatusFailed
				w.Reason = failureReason
				w.Message = failureMessage
			case generation > 0 && observedGeneration < generation:
				// Controller hasn't observed the latest spec yet.
				w.Status = v1alpha1.WorkloadStatusPending
			case progressing:
				// Rolling update in progress — show as Pending (progressing)
				// even if some replicas are available.
				w.Status = v1alpha1.WorkloadStatusPending
			case w.Replicas == 0:
				// Scaled to zero — treat as Running (intentional idle state).
				w.Status = v1alpha1.WorkloadStatusRunning
			case haveAvailable &&
				safeInt32(availableReplicas) == w.Replicas &&
				safeInt32(updatedReplicas) == w.Replicas &&
				safeInt32(readyReplicas) == w.Replicas:
				// Only Running when updated == available == ready == desired.
				// Without this, a partial rollout where available>0 but
				// updatedReplicas<desired was incorrectly marked Running (#5955).
				w.Status = v1alpha1.WorkloadStatusRunning
			case haveAvailable && availableReplicas > 0:
				w.Status = v1alpha1.WorkloadStatusDegraded
			default:
				w.Status = v1alpha1.WorkloadStatusPending
			}
		}

		// Add cluster deployment info
		w.Deployments = []v1alpha1.ClusterDeployment{{
			Cluster:       contextName,
			Status:        w.Status,
			Replicas:      w.Replicas,
			ReadyReplicas: w.ReadyReplicas,
			Message:       w.Message,
			LastUpdated:   time.Now(),
		}}

		workloads = append(workloads, w)
	}

	return workloads
}

// parseStatefulSetsAsWorkloads parses statefulsets from unstructured list
func (m *MultiClusterClient) parseStatefulSetsAsWorkloads(list interface{}, contextName string) []v1alpha1.Workload {
	workloads := make([]v1alpha1.Workload, 0)

	uList, ok := list.(*unstructured.UnstructuredList)
	if !ok {
		return workloads
	}

	for i := range uList.Items {
		item := &uList.Items[i]
		w := v1alpha1.Workload{
			Name:           item.GetName(),
			Namespace:      item.GetNamespace(),
			Type:           v1alpha1.WorkloadTypeStatefulSet,
			Labels:         item.GetLabels(),
			CreatedAt:      item.GetCreationTimestamp().Time,
			TargetClusters: []string{contextName},
			Status:         v1alpha1.WorkloadStatusUnknown,
		}

		content := item.UnstructuredContent()

		// Parse spec.replicas
		if spec, ok := content["spec"].(map[string]interface{}); ok {
			if replicas, ok := spec["replicas"].(int64); ok {
				w.Replicas = safeInt32(replicas)
			}
		}

		// Parse status
		if status, ok := content["status"].(map[string]interface{}); ok {
			if readyReplicas, ok := status["readyReplicas"].(int64); ok {
				w.ReadyReplicas = safeInt32(readyReplicas)
			}
			switch {
			case w.Replicas == 0:
				// Scaled to zero is an intentional idle state, not Pending
				// (#6495). Previously, `readyReplicas == replicas && replicas > 0`
				// was false for 0/0, so the status fell through to Pending
				// and the UI showed a zero-replica StatefulSet as "stuck".
				// Deployments already handle this at
				// parseDeploymentsAsWorkloads switch case `w.Replicas == 0`.
				w.Status = v1alpha1.WorkloadStatusRunning
			case w.ReadyReplicas == w.Replicas:
				w.Status = v1alpha1.WorkloadStatusRunning
			case w.ReadyReplicas > 0:
				w.Status = v1alpha1.WorkloadStatusDegraded
			default:
				w.Status = v1alpha1.WorkloadStatusPending
			}
		}

		w.Deployments = []v1alpha1.ClusterDeployment{{
			Cluster:       contextName,
			Status:        w.Status,
			Replicas:      w.Replicas,
			ReadyReplicas: w.ReadyReplicas,
			LastUpdated:   time.Now(),
		}}

		workloads = append(workloads, w)
	}

	return workloads
}

// parseDaemonSetsAsWorkloads parses daemonsets from unstructured list
func (m *MultiClusterClient) parseDaemonSetsAsWorkloads(list interface{}, contextName string) []v1alpha1.Workload {
	workloads := make([]v1alpha1.Workload, 0)

	uList, ok := list.(*unstructured.UnstructuredList)
	if !ok {
		return workloads
	}

	for i := range uList.Items {
		item := &uList.Items[i]
		w := v1alpha1.Workload{
			Name:           item.GetName(),
			Namespace:      item.GetNamespace(),
			Type:           v1alpha1.WorkloadTypeDaemonSet,
			Labels:         item.GetLabels(),
			CreatedAt:      item.GetCreationTimestamp().Time,
			TargetClusters: []string{contextName},
			Status:         v1alpha1.WorkloadStatusUnknown,
		}

		content := item.UnstructuredContent()

		// Parse status
		if status, ok := content["status"].(map[string]interface{}); ok {
			if desiredNumber, ok := status["desiredNumberScheduled"].(int64); ok {
				w.Replicas = safeInt32(desiredNumber)
			}
			if readyNumber, ok := status["numberReady"].(int64); ok {
				w.ReadyReplicas = safeInt32(readyNumber)
			}
			if w.ReadyReplicas == w.Replicas && w.Replicas > 0 {
				w.Status = v1alpha1.WorkloadStatusRunning
			} else if w.ReadyReplicas > 0 {
				w.Status = v1alpha1.WorkloadStatusDegraded
			} else {
				w.Status = v1alpha1.WorkloadStatusPending
			}
		}

		w.Deployments = []v1alpha1.ClusterDeployment{{
			Cluster:       contextName,
			Status:        w.Status,
			Replicas:      w.Replicas,
			ReadyReplicas: w.ReadyReplicas,
			LastUpdated:   time.Now(),
		}}

		workloads = append(workloads, w)
	}

	return workloads
}
