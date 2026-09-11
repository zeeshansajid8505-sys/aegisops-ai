from typing import Dict, List, Any, Optional
from datetime import datetime
from app.services.topology_embedder import TopologyEmbedder
from app.core.config import settings

class RcaEngine:
    """Explainable, evidence-grounded incident root cause reasoning engine."""

    def __init__(self):
        self.embedder = TopologyEmbedder()

    def analyze(
        self,
        incident: Dict[str, Any],
        candidate_services: List[Dict[str, Any]],
        topology: Dict[str, Any],
        metric_evidence: List[Dict[str, Any]],
        alert_evidence: List[Dict[str, Any]],
        health_evidence: List[Dict[str, Any]],
        human_notes: List[Dict[str, Any]],
        available_runbooks: Optional[List[Dict[str, Any]]] = None,
        anomaly_evidence: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Execute deterministic RCA evaluation over structured incident evidence."""

        services = topology.get("services", candidate_services)
        dependencies = topology.get("dependencies", [])

        # 1. Compute topology graph version and spectral embeddings
        graph_version, embeddings = self.embedder.generate_embeddings(services, dependencies)

        # 2. Extract structured Observed Facts
        observed_facts = self._extract_observed_facts(
            incident, alert_evidence, metric_evidence, health_evidence, dependencies, human_notes, anomaly_evidence
        )

        # 3. Find global earliest alert timestamp for temporal precedence
        earliest_alert_time = None
        for alert in alert_evidence:
            fired_at_str = alert.get("firingStartedAt")
            if fired_at_str:
                try:
                    fired_dt = datetime.fromisoformat(fired_at_str.replace("Z", "+00:00"))
                    if earliest_alert_time is None or fired_dt < earliest_alert_time:
                        earliest_alert_time = fired_dt
                except Exception:
                    pass

        # Build index of upstream dependencies: service -> list of upstream services it depends on
        # and downstream dependents: service -> list of downstream services that depend on it
        downstream_dependents: Dict[str, List[str]] = {}
        for dep in dependencies:
            src = str(dep.get("sourceServiceId")) # src depends on tgt
            tgt = str(dep.get("targetServiceId")) # tgt is upstream of src
            downstream_dependents.setdefault(tgt, []).append(src)

        # 4. Score each candidate service
        scored_candidates = []
        for svc in candidate_services:
            svc_id = str(svc.get("id"))
            svc_name = svc.get("name", svc.get("slug", svc_id))

            # Service-specific evidence
            svc_alerts = [a for a in alert_evidence if str(a.get("serviceId")) == svc_id]
            svc_metrics = [m for m in metric_evidence if str(m.get("serviceId")) == svc_id]
            svc_health = [h for h in health_evidence if str(h.get("serviceId")) == svc_id]

            score = 0.0
            reason_codes: List[str] = []
            evidence_refs: List[str] = []
            counter_evidence_refs: List[str] = []

            has_firing_alert = len(svc_alerts) > 0
            has_metric_anomaly = False
            has_probe_failure = False

            # Check alerts & temporal precedence
            if svc_alerts:
                has_firing_alert = True
                score += 20.0
                reason_codes.append("MULTIPLE_RELATED_ALERTS")
                for a in svc_alerts:
                    evidence_refs.append(f"alert:{a.get('id')}")
                    # Check if this alert fired at or very close to earliest alert time
                    fired_at_str = a.get("firingStartedAt")
                    if fired_at_str and earliest_alert_time:
                        try:
                            dt = datetime.fromisoformat(fired_at_str.replace("Z", "+00:00"))
                            diff_seconds = abs((dt - earliest_alert_time).total_seconds())
                            if diff_seconds <= 30:
                                score += 30.0
                                if "EARLIEST_ALERT" not in reason_codes:
                                    reason_codes.append("EARLIEST_ALERT")
                                    reason_codes.append("TEMPORAL_PRECEDENCE")
                        except Exception:
                            pass

            # Check metric deviations
            max_dev = 0.0
            for m in svc_metrics:
                dev = abs(float(m.get("percentageChange", 0.0)))
                norm_dev = abs(float(m.get("normalizedDeviation", 0.0)))
                if dev > max_dev:
                    max_dev = dev
                if dev >= 30.0 or norm_dev >= 2.5:
                    has_metric_anomaly = True
                    evidence_refs.append(f"metric:{m.get('metricName')}")

            if has_metric_anomaly:
                score += 25.0
                reason_codes.append("LARGE_METRIC_DEVIATION")

            # Check health probe failures
            for h in svc_health:
                status = str(h.get("probeStatus", "")).upper()
                is_critical = bool(h.get("isCritical", False))
                if status in ("UNHEALTHY", "FAIL", "DOWN"):
                    has_probe_failure = True
                    evidence_refs.append(f"probe:{h.get('serviceId')}")
                    if is_critical:
                        score += 30.0
                        reason_codes.append("CRITICAL_PROBE_FAILURE")
                    else:
                        score += 15.0
                    reason_codes.append("RELATED_HEALTH_FAILURE")

            # Check topology: upstream of other affected services
            dependents = downstream_dependents.get(svc_id, [])
            affected_dependents = [
                dep_id for dep_id in dependents
                if any(str(a.get("serviceId")) == dep_id for a in alert_evidence)
            ]
            if affected_dependents:
                score += 20.0
                reason_codes.append("DIRECT_UPSTREAM_DEPENDENCY")
                evidence_refs.append(f"topology:upstream_of:{len(affected_dependents)}_services")

            # Check proactive ML anomalies
            svc_anomalies = [
                a for a in (anomaly_evidence or [])
                if str(a.get("serviceId")) == svc_id
            ]
            has_anomaly = len(svc_anomalies) > 0
            if has_anomaly:
                score += 15.0
                reason_codes.append("PROACTIVE_ANOMALY_DETECTED")
                for a in svc_anomalies:
                    evidence_refs.append(f"anomaly:{a.get('findingId', a.get('detectorId'))}")

            # Service tier prior
            tier = str(svc.get("tier", "TIER_2")).upper()
            if tier == "TIER_1":
                score += 5.0
                reason_codes.append("TIER_1_SERVICE")

            # COUNTER-EVIDENCE:
            # If candidate service has NO alerts, NO anomaly findings, normal metrics (< 15% dev), and healthy probes:
            # Apply severe negative penalty!
            is_healthy = not has_firing_alert and not has_probe_failure and not has_anomaly and (max_dev < 15.0)
            if is_healthy:
                penalty = 60.0
                score = max(0.0, score - penalty)
                reason_codes.append("HEALTHY_COUNTER_EVIDENCE")
                reason_codes.append("NO_DIRECT_ALERT")
                counter_evidence_refs.append(f"service:{svc_id}:metrics_normal")
                counter_evidence_refs.append(f"service:{svc_id}:probes_healthy")

            # Normalize final score between 0 and 100
            final_score = round(min(100.0, max(0.0, score)), 2)

            # Assign confidence level
            if final_score >= 65.0:
                confidence = "HIGH"
            elif final_score >= 35.0:
                confidence = "MEDIUM"
            else:
                confidence = "LOW"

            # Construct concise explainability statement
            hypothesis_text = self._generate_hypothesis_text(
                svc_name, reason_codes, max_dev, has_firing_alert, is_healthy
            )

            scored_candidates.append({
                "candidateServiceId": svc_id,
                "candidateServiceName": svc_name,
                "score": final_score,
                "confidence": confidence,
                "hypothesis": hypothesis_text,
                "reasonCodes": reason_codes,
                "evidenceRefs": evidence_refs,
                "counterEvidenceRefs": counter_evidence_refs,
            })

        # 5. Sort candidates by score descending, then alphabetical by name
        scored_candidates.sort(key=lambda c: (-c["score"], c["candidateServiceName"]))

        # Assign ranks
        for idx, cand in enumerate(scored_candidates):
            cand["rank"] = idx + 1
            cand["id"] = f"hyp-{incident.get('id', 'inc')[:8]}-{cand['rank']}"

        # 6. Recommend runbooks
        recommended_runbooks = self._match_runbooks(
            scored_candidates, incident, available_runbooks or []
        )

        # 7. Recommended next checks
        next_checks = self._generate_next_checks(scored_candidates)

        # Top summary narrative
        summary = self._generate_summary(incident, scored_candidates)

        return {
            "algorithmVersion": settings.RCA_ALGORITHM_VERSION,
            "embeddingVersion": graph_version,
            "modelVersion": settings.RCA_MODEL_VERSION,
            "summary": summary,
            "observedFacts": observed_facts,
            "rankedCandidates": scored_candidates,
            "recommendedNextChecks": next_checks,
            "recommendedRunbooks": recommended_runbooks,
        }

    def _extract_observed_facts(
        self,
        incident: Dict[str, Any],
        alerts: List[Dict[str, Any]],
        metrics: List[Dict[str, Any]],
        health: List[Dict[str, Any]],
        dependencies: List[Dict[str, Any]],
        notes: List[Dict[str, Any]],
        anomalies: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        facts: List[Dict[str, Any]] = []

        # Proactive ML Anomaly facts
        for a in (anomalies or []):
            detector_name = a.get("detectorName", "Detector")
            metric_name = a.get("metricName", "metric")
            score = float(a.get("peakScore", a.get("currentScore", 0.0)))
            facts.append({
                "factId": f"fact-anomaly-{a.get('findingId', a.get('id', 'signal'))}",
                "type": "ANOMALY_SIGNAL",
                "description": f"Proactive ML anomaly '{detector_name}' on metric '{metric_name}' (statistical deviation score: {score:.1f}/100)",
                "entityRef": str(a.get("serviceId")),
                "timestamp": a.get("firstDetectedAt", incident.get("detectedAt")),
                "source": "ml_isolation_forest_engine",
            })

        # Alert facts
        for a in alerts:
            rule_name = a.get("ruleName", "Alert Rule")
            fired_at = a.get("firingStartedAt", incident.get("detectedAt"))
            val = a.get("currentValue", "N/A")
            thresh = a.get("thresholdValue", "N/A")
            facts.append({
                "factId": f"fact-alert-{a.get('id')}",
                "type": "ALERT",
                "description": f"Alert '{rule_name}' started firing (value: {val}, threshold: {thresh})",
                "entityRef": str(a.get("serviceId")),
                "timestamp": fired_at,
                "source": "alert_rule_evaluator",
            })

        # Metric deviation facts
        for m in metrics:
            pct = m.get("percentageChange", 0.0)
            if abs(pct) >= 20.0:
                facts.append({
                    "factId": f"fact-metric-{m.get('serviceId')}-{m.get('metricName')}",
                    "type": "METRIC",
                    "description": f"Metric '{m.get('metricName')}' deviated by {pct:+.1f}% from baseline",
                    "entityRef": str(m.get("serviceId")),
                    "timestamp": incident.get("detectedAt"),
                    "source": "otlp_telemetry_normalizer",
                })

        # Health probe facts
        for h in health:
            status = str(h.get("probeStatus", "")).upper()
            if status in ("UNHEALTHY", "FAIL", "DOWN"):
                is_crit = "Critical" if h.get("isCritical") else "Non-critical"
                facts.append({
                    "factId": f"fact-probe-{h.get('serviceId')}",
                    "type": "HEALTH",
                    "description": f"{is_crit} synthetic health probe reported status {status}",
                    "entityRef": str(h.get("serviceId")),
                    "timestamp": h.get("firstFailureTime", incident.get("detectedAt")),
                    "source": "health_probe_worker",
                })

        # Dependency topology facts
        for dep in dependencies:
            facts.append({
                "factId": f"fact-topo-{dep.get('sourceServiceId')}-{dep.get('targetServiceId')}",
                "type": "TOPOLOGY",
                "description": f"Dependency edge: Service {dep.get('sourceServiceId')} depends on {dep.get('targetServiceId')} (Critical: {bool(dep.get('isCritical'))})",
                "entityRef": str(dep.get("sourceServiceId")),
                "timestamp": incident.get("detectedAt"),
                "source": "service_catalog_dag",
            })

        # Human note facts
        for n in notes:
            facts.append({
                "factId": f"fact-note-{n.get('noteId')}",
                "type": "HUMAN_NOTE",
                "description": f"Responder note: \"{n.get('content', '')}\"",
                "entityRef": str(n.get("authorName", "Responder")),
                "timestamp": n.get("timestamp"),
                "source": "incident_commander_notes",
            })

        return facts

    def _generate_hypothesis_text(
        self,
        svc_name: str,
        reason_codes: List[str],
        max_dev: float,
        has_alert: bool,
        is_healthy: bool,
    ) -> str:
        if is_healthy:
            return (
                f"{svc_name} displays normal telemetry with passing health checks and no firing alerts. "
                "Unlikely to be the root cause despite topology connectivity."
            )

        details = []
        if "EARLIEST_ALERT" in reason_codes:
            details.append("exhibited earliest alert onset")
        if "LARGE_METRIC_DEVIATION" in reason_codes:
            details.append(f"significant metric deviation ({max_dev:.1f}%)")
        if "CRITICAL_PROBE_FAILURE" in reason_codes:
            details.append("critical synthetic probe failure")
        if "DIRECT_UPSTREAM_DEPENDENCY" in reason_codes:
            details.append("upstream dependency of failing services")
        if "PROACTIVE_ANOMALY_DETECTED" in reason_codes:
            details.append("proactive ML anomaly detected")

        if details:
            reasons_joined = ", ".join(details)
            return f"Originating failure likely in {svc_name}: {reasons_joined}."
        elif has_alert:
            return f"{svc_name} is affected by correlated alerts with moderate severity impact."
        else:
            return f"{svc_name} is connected to the incident topology with minor signal variance."

    def _match_runbooks(
        self,
        ranked_candidates: List[Dict[str, Any]],
        incident: Dict[str, Any],
        available_runbooks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if not available_runbooks or not ranked_candidates:
            return []

        top_candidate = ranked_candidates[0]
        top_svc_id = top_candidate.get("candidateServiceId")
        incident_sev = str(incident.get("severity", "WARNING")).upper()

        matched = []
        for rb in available_runbooks:
            score = 0.0
            reasons = []

            rb_svc_id = str(rb.get("serviceId", ""))
            if rb_svc_id and rb_svc_id == top_svc_id:
                score += 50.0
                reasons.append("ROOT_CAUSE_SERVICE_MATCH")

            rb_sev = str(rb.get("severity", "")).upper()
            if rb_sev and rb_sev == incident_sev:
                score += 25.0
                reasons.append("SEVERITY_MATCH")

            tags = [str(t).lower() for t in rb.get("tags", [])]
            if "latency" in tags and any("LATENCY" in c for c in top_candidate.get("reasonCodes", [])):
                score += 25.0
                reasons.append("METRIC_MATCH")

            if score > 0.0:
                matched.append({
                    "runbookId": rb.get("id"),
                    "title": rb.get("name"),
                    "matchScore": round(score, 2),
                    "reasonCodes": reasons,
                })

        matched.sort(key=lambda x: -x["matchScore"])
        return matched[:3]

    def _generate_next_checks(self, ranked_candidates: List[Dict[str, Any]]) -> List[str]:
        if not ranked_candidates:
            return ["Verify overall cluster health and edge gateway latency."]

        top = ranked_candidates[0]
        svc = top.get("candidateServiceName", "primary service")

        checks = [
            f"Review recent saturation and error metrics on {svc}.",
            f"Inspect connection pools and upstream downstream timeouts for {svc}.",
            f"Verify that dependent services recover once {svc} health probes pass.",
        ]
        return checks

    def _generate_summary(
        self,
        incident: Dict[str, Any],
        ranked_candidates: List[Dict[str, Any]]
    ) -> str:
        if not ranked_candidates:
            return f"Incident {incident.get('incidentKey', '')} under investigation. Insufficient signals for automated hypothesis ranking."

        top = ranked_candidates[0]
        svc = top.get("candidateServiceName", "Unknown service")
        conf = top.get("confidence", "MEDIUM")
        score = top.get("score", 0.0)

        return (
            f"AI RCA identified {svc} as the primary root-cause candidate with {conf} confidence (score: {score}/100). "
            "Human confirmation is required to verify operational root cause."
        )

