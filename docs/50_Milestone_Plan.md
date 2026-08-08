# Milestone Plan: Releases & Definition of Done (DoD)

## 1. Release Milestone Map

| Release Milestone | Target Date | Target Scope | Exit Criteria |
| :--- | :--- | :--- | :--- |
| **M1: Alpha Launch** | September 15, 2026 | PDF parsing, account registration, database structure, and basic text chat. | Pass unit tests; files successfully save to databases. |
| **M2: Beta Launch** | November 1, 2026 | WebRTC voice connection, Monaco workspace execution, and feedback reports. | P95 latency remains below 1.4s; code execution tests run successfully. |
| **M3: Release Candidate** | December 1, 2026 | GitHub ingestion, ATS match calculations, and recruiter dashboards. | Playwright E2E browser tests pass; vector searches run <30ms. |
| **M4: Production Ready (v1.0)**| December 31, 2026 | Telemetry tracing, performance tuning, and compliance audits. | Zero critical vulnerabilities; SOC2 verification completed. |

---

## 2. Definition of Done (DoD) Checklist
A feature is marked "Done" and merged into main branches only when it meets the following criteria:

*   **Design Alignment:** Layouts match the visual design tokens (colors, font hierarchy, spacing).
*   **Code Quality:**
    *   TypeScript builds run with zero compiler warnings or errors.
    *   The linter runs clean with zero style violations.
*   **Testing Coverage:**
    *   Unit test coverage exceeds `80%` for new files.
    *   Integration test runs pass successfully.
*   **Documentation:**
    *   API definitions are updated in the OpenAPI specification.
    *   Code updates are documented in relevant configuration guides.
*   **Security Validation:** Secrets and credentials are isolated, and user inputs are sanitised to prevent injection attacks.
*   **Review Approvals:** The code changes are reviewed and approved by at least one Senior or Principal Engineer.

---

## 3. Production Release Checklist
Before deploying updates to production servers, the team runs the following checks:
1.  **Run E2E Suites:** Playwright tests must pass on staging environments.
2.  **Verify Migrations:** Database migrations must run successfully without blocking active tables.
3.  **Perform Load Testing:** k6 load tests must verify that WebSocket connection latency remains below limits.
4.  **Confirm Fallbacks:** Verify that AI Gateway routing rules and fallback routes are active.
5.  **Review Dashboards:** Ensure monitoring alerts and log collection are active.
