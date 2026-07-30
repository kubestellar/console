package rag

import "strings"

// queryIntent captures what the user is trying to do, derived from verbs in the
// query. It lets the retriever prefer the right kind of mission: an "install X"
// query should surface the canonical install mission, not one of the many
// auto-generated fixer missions that merely mention X.
type queryIntent struct {
	install bool
	fix     bool
}

var (
	installVerbs = []string{"install", "set up", "setup", "deploy", "provision", "add ", "enable", "configure", "bootstrap"}
	fixVerbs     = []string{"fix", "error", "fail", "denied", "broken", "troubleshoot", "debug", "resolve", "crash", "not working", "cannot", "can't", "issue"}
)

func detectIntent(query string) queryIntent {
	q := strings.ToLower(query)
	var in queryIntent
	for _, v := range installVerbs {
		if strings.Contains(q, v) {
			in.install = true
			break
		}
	}
	for _, v := range fixVerbs {
		if strings.Contains(q, v) {
			in.fix = true
			break
		}
	}
	return in
}

// Intent-driven score multipliers. Values are tuned so an install query lifts
// install missions above same-project fixer missions without fully suppressing
// other signals.
const (
	boostInstallMission  = 2.0
	boostInstallCategory = 1.5
	demoteGeneratedFixer = 0.5
	boostFixerMission    = 1.6
	boostFixCategory     = 1.3
)

// boost returns the score multiplier for a document given the query intent.
func (in queryIntent) boost(d Document) float64 {
	m := 1.0
	if in.install {
		switch d.MissionClass {
		case "install":
			m *= boostInstallMission
		case "fixer":
			if d.Category == "cncf-generated" {
				m *= demoteGeneratedFixer
			}
		}
		if d.Category == "cncf-install" || d.Category == "platform-install" {
			m *= boostInstallCategory
		}
	}
	if in.fix {
		if d.MissionClass == "fixer" {
			m *= boostFixerMission
		}
		if d.Category == "troubleshooting" || d.Category == "security" {
			m *= boostFixCategory
		}
	}
	return m
}
