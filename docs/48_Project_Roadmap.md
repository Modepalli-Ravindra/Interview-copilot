# Project Roadmap: Multi-Quarter Execution Plan

## 1. High-Level Timeline (Q1 - Q4)
The roadmap spans four quarters, starting with foundation setup and ending with enterprise optimization and scaling.

```mermaid
gantt
    title InterviewPilot AI Project Roadmap
    dateFormat  YYYY-MM
    section Core Foundation
    Q1: Auth, Parsing, DB & HLD Setup       :active, q1, 2026-01-01, 2026-03-31
    section Technical Features
    Q2: WebRTC, Monaco & Code Execution     :active, q2, 2026-04-01, 2026-06-30
    section Enterprise Engine
    Q3: GitHub Scan, ATS Match & Recruiter UI :active, q3, 2026-07-01, 2026-09-30
    section Scaling & Optimization
    Q4: Observability, Security & Local Models :active, q4, 2026-10-01, 2026-12-31
```

---

## 2. Quarterly Milestones & Deliverables

### Q1: Core Foundation & API Base (Q1 2026)
*   **Milestone 1.1:** Setup project database schemas and configure HNSW vector indexing (`pgvector`).
*   **Milestone 1.2:** Implement JWT-based authentication with Refresh Token Rotation (RTR).
*   **Milestone 1.3:** Build PDF/DOCX resume extraction and parsing engines.
*   **Milestone 1.4:** Launch the developer documentation site, environment scripts, and deployment guides.

### Q2: Voice Streaming & Coding Workspace (Q2 2026)
*   **Milestone 2.1:** Implement WebRTC audio connection handling.
*   **Milestone 2.2:** Build client-side Voice Activity Detection (VAD) and backend barge-in logic.
*   **Milestone 2.3:** Integrate the Monaco Editor workspace with real-time sync.
*   **Milestone 2.4:** Connect Judge0 sandbox compilers to evaluate code submissions.

### Q3: Enterprise Engine & Recruiter UI (Q3 2026)
*   **Milestone 3.1:** Deploy the GitHub Analyzer to scan repositories and contribution graphs.
*   **Milestone 3.2:** Build the semantic ATS matching engine to compare profiles and job descriptions.
*   **Milestone 3.3:** Launch the Recruiter dashboard to manage candidate screens.
*   **Milestone 3.4:** Implement the Feedback Engine to generate reports and personalized roadmaps.

### Q4: Scale, Telemetry & Local Models (Q4 2026)
*   **Milestone 4.1:** Integrate OpenTelemetry for distributed request tracing.
*   **Milestone 4.2:** Optimize system performance to achieve sub-second voice latency budgets.
*   **Milestone 4.3:** Support local model deployment (Ollama) to reduce API token costs.
*   **Milestone 4.4:** Complete SOC2 audits and GDPR compliance checks.
