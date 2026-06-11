package k8s

import (
	"context"
	"fmt"
	"sort"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// Event represents a Kubernetes event
type Event struct {
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Object    string `json:"object"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster,omitempty"`
	Count     int32  `json:"count"`
	Age       string `json:"age,omitempty"`
	FirstSeen string `json:"firstSeen,omitempty"`
	LastSeen  string `json:"lastSeen,omitempty"`
}

// GetEvents returns events from a cluster
func (m *MultiClusterClient) GetEvents(ctx context.Context, contextName, namespace string, limit int, fieldSelectors ...string) ([]Event, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	listOpts := metav1.ListOptions{}
	if len(fieldSelectors) > 0 && fieldSelectors[0] != "" {
		listOpts.FieldSelector = fieldSelectors[0]
	}
	events, err := client.CoreV1().Events(namespace).List(ctx, listOpts)
	if err != nil {
		return nil, err
	}

	// Sort by effective event time descending (prefers modern EventTime,
	// falls back to LastTimestamp for older clusters). See issue #6042.
	sort.Slice(events.Items, func(i, j int) bool {
		return EffectiveEventTime(&events.Items[i]).After(EffectiveEventTime(&events.Items[j]))
	})

	var result []Event
	for i, event := range events.Items {
		if limit > 0 && i >= limit {
			break
		}
		evt := event
		lastSeen := EffectiveEventTime(&evt)
		e := Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
		}
		if !lastSeen.IsZero() {
			e.Age = formatDuration(time.Since(lastSeen))
			e.LastSeen = lastSeen.Format(time.RFC3339)
		}
		if !event.FirstTimestamp.IsZero() {
			e.FirstSeen = event.FirstTimestamp.Time.Format(time.RFC3339)
		}
		result = append(result, e)
	}

	return result, nil
}

// GetWarningEvents returns warning events from a cluster
func (m *MultiClusterClient) GetWarningEvents(ctx context.Context, contextName, namespace string, limit int) ([]Event, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	events, err := client.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{
		FieldSelector: "type=Warning",
	})
	if err != nil {
		return nil, err
	}

	// Sort by effective event time descending (prefers modern EventTime,
	// falls back to LastTimestamp for older clusters). See issue #6042.
	sort.Slice(events.Items, func(i, j int) bool {
		return EffectiveEventTime(&events.Items[i]).After(EffectiveEventTime(&events.Items[j]))
	})

	var result []Event
	for i, event := range events.Items {
		if limit > 0 && i >= limit {
			break
		}
		evt := event
		lastSeen := EffectiveEventTime(&evt)
		e := Event{
			Type:      event.Type,
			Reason:    event.Reason,
			Message:   event.Message,
			Object:    fmt.Sprintf("%s/%s", event.InvolvedObject.Kind, event.InvolvedObject.Name),
			Namespace: event.Namespace,
			Cluster:   contextName,
			Count:     event.Count,
		}
		if !lastSeen.IsZero() {
			e.Age = formatDuration(time.Since(lastSeen))
			e.LastSeen = lastSeen.Format(time.RFC3339)
		}
		if !event.FirstTimestamp.IsZero() {
			e.FirstSeen = event.FirstTimestamp.Time.Format(time.RFC3339)
		}
		result = append(result, e)
	}

	return result, nil
}
