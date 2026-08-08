# Software Requirements Specification (SRS): InterviewPilot AI

## 1. Introduction

### 1.1. Purpose
This document specifies the software requirements for **InterviewPilot AI**, Version 1.0. This specification outlines the functional and non-functional requirements, external interfaces, system attributes, and database/AI pipeline constraints.

### 1.2. Intended Audience
This document is written for software architects, backend and frontend engineers, security auditors, database administrators, and QA automation teams. It serves as the primary technical specification for building and testing the system.

### 1.3. System Scope
InterviewPilot AI is a cloud-native SaaS application designed to conduct voice-based software engineering mock interviews. The software coordinates real-time audio streams, tokenized LLM chat state, database state vectors, and remote sandboxed code executions.

---

## 2. Overall Description

### 2.1. Product Perspective
The system operates as a distributed application consisting of a single-page React frontend, a Node.js microservices cluster, a PostgreSQL relational store with pgvector, and external AI models accessed via a fallback gateway.

```mermaid
graph LR
    ClientApp[React Client (WebRTC/Socket.IO)] <--> Gateway[Express.js / Node.js API Gateway]
    Gateway <--> Cache[(Redis Session & Cache)]
    Gateway <--> Database[(PostgreSQL + pgvector)]
    Gateway <--> Sandbox[Judge0 Code Execution]
    Gateway <--> AIGateway[Multi-Provider AI Gateway]
    AIGateway <--> Models[OpenCode / Gemini / OpenAI / DeepSeek]
```

### 2.2. Operating Environment
*   **Client OS:** Modern web browsers (Chrome 90+, Safari 14+, Firefox 88+, Edge 90+) on Desktop and Mobile.
*   **Backend Runtime:** Node.js v20.x or above running inside Linux containers (Docker).
*   **Database:** PostgreSQL 15+ with `pgvector` extension.
*   **Message Broker / Cache:** Redis 7.x.

### 2.3. Design & Implementation Constraints
*   **Hardware Constraints:** Live audio compression must happen client-side using Opus codec to save server bandwidth.
*   **AI Gateway Routing:** AI Gateway must dynamically swap providers within 300ms if HTTP status codes reflect rate limits (429) or internal server errors (5xx).

---

## 3. External Interface Requirements

### 3.1. User Interfaces
*   **Dashboard View:** Grid of past interviews, current statistics (average ATS match, interview duration), and current study roadmap list.
*   **Interview Workspace:** Split pane displaying:
    *   *Left pane:* Chat assistant logs, visual audio equalizer, and action controls (Mute, Interrupt, Submit).
    *   *Right pane:* Multi-tab area supporting Monaco Code Editor, Markdown instructions, or visual GitHub directory map.
*   **Responsive Layout:** Adapts automatically to tablet and desktop dimensions.

### 3.2. Software Interfaces
*   **External AI Provider APIs:** Supports OpenAI Chat Completions, Anthropic Messages API, Gemini API, and DeepSeek Chat completions.
*   **Sandbox Code Execution (Judge0):** REST API interface sending source code, input arguments, and test cases, returning base64-encoded stdout, stderr, execution time, and memory usage.
*   **Cloud Storage (Cloudinary/Supabase):** Object storage interfaces for resume PDF files and cached voice audio transcripts.

### 3.3. Communication Interfaces
*   **WebSockets (Socket.IO):** For real-time, bi-directional event distribution (e.g., streaming text tokens, editor changes, audio packet coordinates).
*   **WebRTC Media Protocol:** For low-latency real-time voice streaming with Opus codec packetization.
*   **HTTPS:** RESTful endpoints for CRUD operations (auth, resume upload, history logs).

---

## 4. System Features & Functional Requirements

### 4.1. Voice Conversation & Barge-In
*   **Description:** Tracks client mic input, transcribes it, queries the LLM, synthesizes the response to voice, and plays it back.
*   **Functional Requirements:**
    *   `REQ-VOICE-1.1`: The system must initiate WebRTC connection upon user clicking "Start Voice Interview".
    *   `REQ-VOICE-1.2`: Client-side Voice Activity Detection (VAD) must trigger a `barge_in` event over WebSocket if amplitude remains above -45dB for more than 150ms during voice playback.
    *   `REQ-VOICE-1.3`: On receiving `barge_in`, the backend must immediately send a stop signal to the active LLM stream and flush the client-side audio playback buffer.

### 4.2. ATS Matching & Analysis
*   **Description:** Computes similarity metrics between candidate profiles and job requirements.
*   **Functional Requirements:**
    *   `REQ-ATS-2.1`: The system must parse PDF/DOCX resumes and extract skill tokens using regex and semantic entity parsing.
    *   `REQ-ATS-2.2`: The system must compute cosine similarity between the resume vector embedding and the job description vector embedding.
    *   `REQ-ATS-2.3`: Output must identify specific missing keywords requested by the job description and present a score of 0-100.

### 4.3. Sandboxed Coding Runner
*   **Description:** Compiles and runs user-submitted code snippets safely.
*   **Functional Requirements:**
    *   `REQ-CODE-3.1`: The backend must send code payloads to the Judge0 sandbox with a execution timeout limit of 2.0 seconds.
    *   `REQ-CODE-3.2`: The runtime environment must have no access to the external internet or local host networking.
    *   `REQ-CODE-3.3`: Sandboxed runtimes must be restricted to 256MB of RAM and 0.5 CPU core allocation.

---

## 5. Non-Functional Requirements

### 5.1. Performance & Latency
*   **Transcribe Latency:** Transcription of a 5-second audio chunk must complete within 200ms.
*   **Vector Search Lookup:** Cosine similarity querying over 100,000 document chunks must complete within 50ms using HNSW index structures.

### 5.2. Security Requirements
*   **Token Refresh Rotation:** Access tokens must expire in 15 minutes. Refresh tokens must be rotated upon usage and stored in HTTP-Only, Secure, SameSite=Strict cookies.
*   **SQL Injection Prevention:** All queries to PostgreSQL must use parameterized queries or TypeORM database parameters.
*   **PII Anonymization:** Resumes and audio transcripts must be scrubbed of phone numbers, emails, and home addresses before being passed to external AI models.

### 5.3. Reliability & Availability
*   **Availability:** 99.95% availability of the API Gateway.
*   **System Recovery:** Recovery Point Objective (RPO) of 1 hour; Recovery Time Objective (RTO) of 15 minutes.
