# Project Backlog: User Stories & Technical Debt

## 1. Prioritization Framework (MoSCoW)
We prioritize features and technical tasks using the **MoSCoW** framework:
*   **Must Have (M):** Critical features needed to launch the core mock interview experience.
*   **Should Have (S):** Important features that improve usability but are not critical for launch.
*   **Could Have (C):** Nice-to-have features that can be postponed to future updates.
*   **Won't Have (W):** Slated for future development phases.

---

## 2. Functional User Stories Backlog

| Story ID | Priority | Feature Title | Effort (Story Points) | Status | Description |
| :--- | :---: | :--- | :---: | :--- | :--- |
| **US-101** | **Must** | Resume Upload & Text Parse | `3` | Backlog | Candidates can upload resumes to populate their skills profile. |
| **US-102** | **Must** | Low-Latency WebRTC Voice | `8` | Backlog | Candidates can speak with the AI interviewer over a WebRTC channel. |
| **US-103** | **Must** | VAD & Voice Barge-In | `5` | Backlog | The AI interviewer halts speech playback when the candidate interrupts. |
| **US-104** | **Must** | Monaco Code Execution | `5` | Backlog | Renders code editors and runs submissions in Judge0 sandboxes. |
| **US-105** | **Should**| GitHub Repository Sync | `5` | Backlog | Links GitHub repositories to guide system design questions. |
| **US-106** | **Should**| ATS Score Match Calculation | `3` | Backlog | Calculates compatibility metrics between resumes and job descriptions. |
| **US-107** | **Could** | Custom PDF Feedback Report | `3` | Backlog | Generates exportable PDF files of completed evaluations. |

---

## 3. Technical Debt Backlog

| Task ID | Priority | Task Title | Component | Description |
| :--- | :---: | :--- | :--- | :--- |
| **TD-201** | **High** | HNSW Vector Index Tuning | Database | Optimize pgvector HNSW configurations to prevent query delay as database grows. |
| **TD-202** | **Medium**| Express Middleware Profiling | Backend | Profile Express middlewares to reduce request processing overhead. |
| **TD-203** | **Low** | Monaco Editor Bundle Optimizations | Frontend | Optimize bundle sizes and lazy-load Monaco assets to improve page load speed. |
| **TD-204** | **Medium**| E2E Voice Testing | Testing | Build Playwright test mocks to automate WebRTC audio connection verification. |
