import hashlib
import json
from typing import Dict, List, Any, Tuple
import numpy as np
from sklearn.decomposition import TruncatedSVD
from app.core.config import settings

class TopologyEmbedder:
    """Deterministic, lightweight topology graph embedding and versioning engine."""

    def __init__(self, dimension: int = settings.RCA_EMBEDDING_DIMENSION):
        self.dimension = dimension

    def compute_graph_fingerprint(
        self,
        services: List[Dict[str, Any]],
        dependencies: List[Dict[str, Any]]
    ) -> str:
        """Compute deterministic canonical SHA-256 fingerprint of service topology."""
        canonical_services = sorted(
            [
                {
                    "id": s.get("id"),
                    "slug": s.get("slug", s.get("name", "")),
                    "tier": s.get("tier", "TIER_2"),
                }
                for s in services
            ],
            key=lambda x: str(x["id"])
        )

        canonical_dependencies = sorted(
            [
                {
                    "source": d.get("sourceServiceId"),
                    "target": d.get("targetServiceId"),
                    "critical": bool(d.get("isCritical", False)),
                    "type": str(d.get("type", "SYNCHRONOUS")),
                }
                for d in dependencies
            ],
            key=lambda x: (str(x["source"]), str(x["target"]))
        )

        payload = json.dumps(
            {"services": canonical_services, "dependencies": canonical_dependencies},
            sort_keys=True
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def generate_embeddings(
        self,
        services: List[Dict[str, Any]],
        dependencies: List[Dict[str, Any]]
    ) -> Tuple[str, Dict[str, List[float]]]:
        """Generate deterministic spectral/SVD node embeddings of topology graph."""
        graph_version = self.compute_graph_fingerprint(services, dependencies)

        if not services:
            return graph_version, {}

        n = len(services)
        service_ids = [str(s.get("id")) for s in services]
        id_to_idx = {sid: i for i, sid in enumerate(service_ids)}

        # Build weighted adjacency + self-loop matrix
        adj = np.eye(n, dtype=np.float32)

        for dep in dependencies:
            src = str(dep.get("sourceServiceId"))
            tgt = str(dep.get("targetServiceId"))
            if src in id_to_idx and tgt in id_to_idx:
                weight = 2.0 if dep.get("isCritical") else 1.0
                adj[id_to_idx[src], id_to_idx[tgt]] += weight

        # Fit TruncatedSVD for low-complexity node representation
        n_components = min(self.dimension, n)
        if n_components > 1:
            svd = TruncatedSVD(n_components=n_components, random_state=42)
            reduced = svd.fit_transform(adj)
        else:
            reduced = adj

        # Pad to fixed dimension if graph is small
        embeddings: Dict[str, List[float]] = {}
        for i, sid in enumerate(service_ids):
            row = reduced[i].tolist()
            if len(row) < self.dimension:
                row = row + [0.0] * (self.dimension - len(row))
            else:
                row = row[:self.dimension]
            # Round for cross-platform floating point stability
            embeddings[sid] = [round(val, 6) for val in row]

        return graph_version, embeddings

