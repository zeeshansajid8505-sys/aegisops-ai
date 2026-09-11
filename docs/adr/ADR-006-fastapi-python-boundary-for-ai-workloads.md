# ADR-006: Separate FastAPI Python Service for AI and ML Workloads

## Status
Accepted

## Context
Machine learning anomaly detection (scikit-learn, numpy) and AI reasoning workflows are naturally suited to the Python scientific ecosystem. Mixing Python dependencies into a Node.js process via subprocesses is brittle and unsafe.

## Decision
Isolate the AI and ML layer into a dedicated **Python 3.12 + FastAPI** service (`apps/ai-service`) interacting with the NestJS Core API via internal REST.

## Consequences
### Positive
* Clean separation of concerns: TypeScript governs the business domain, Python governs ML computation.
* Direct access to Python ML libraries (`scikit-learn`, `numpy`, future LLM orchestration).
* FastAPI provides high-performance asynchronous HTTP and automatic OpenAPI generation via Pydantic.

### Negative / Trade-offs
* Requires maintaining a second language runtime and dependency toolchain in the monorepo.
* Inter-service HTTP requests require explicit timeout and error handling.
