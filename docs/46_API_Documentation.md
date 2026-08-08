# API Documentation: Public & Internal Services

## 1. Authentication Headers
All secure endpoints require validation using JWT access tokens passed in headers:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 2. API Endpoint Reference

### 2.1. Authentication Services

#### Endpoint: `POST /v1/auth/register`
*   **Description:** Creates a new candidate or recruiter account.
*   **Request Payload:**
```json
{
  "email": "candidate.clara@example.com",
  "password": "StrongPassword123!",
  "firstName": "Clara",
  "lastName": "Developer"
}
```
*   **Response Payload (`201 Created`):**
```json
{
  "status": "success",
  "data": {
    "userId": "usr_7ba39d12-120d-4fa4-a212-36c12b322a11",
    "email": "candidate.clara@example.com"
  }
}
```

---

### 2.2. Resume Intelligence Services

#### Endpoint: `POST /v1/resumes/upload`
*   **Description:** Uploads a PDF or Word resume for parsing and skill gap analysis.
*   **Request Content-Type:** `multipart/form-data`
*   **Request Body (FormData):**
    *   `file`: (Binary PDF or DOCX file, limit 5MB).
*   **Response Payload (`200 OK`):**
```json
{
  "status": "success",
  "data": {
    "resumeId": "res_9b329a12-88d0-4ba4-9a00-11112b322a00",
    "skills": ["TypeScript", "Node.js", "React", "PostgreSQL"],
    "yearsExperience": 4
  }
}
```

---

### 2.3. Interview Session Services

#### Endpoint: `POST /v1/sessions/create`
*   **Description:** Starts a new mock interview session by linking a parsed resume and a target job description.
*   **Request Payload:**
```json
{
  "resumeId": "res_9b329a12-88d0-4ba4-9a00-11112b322a00",
  "jobDescriptionId": "jd_329a1211-11d0-4ba4-9a00-44442b322bbb",
  "initialMode": "BEHAVIORAL"
}
```
*   **Response Payload (`201 Created`):**
```json
{
  "status": "success",
  "data": {
    "sessionId": "ses_9a121111-88d0-4ba4-9a00-22222b322bbb",
    "status": "SETUP",
    "createdAt": "2026-08-08T02:41:16Z"
  }
}
```

#### Endpoint: `GET /v1/sessions/:sessionId/feedback`
*   **Description:** Retrieves scores, summary evaluations, and study plans for completed sessions.
*   **Path Parameters:**
    *   `sessionId` (UUID): Target session identifier.
*   **Response Payload (`200 OK`):**
```json
{
  "status": "success",
  "data": {
    "scoreTechnical": 85,
    "scoreCommunication": 90,
    "scoreBehavioral": 80,
    "summaryEvaluation": "Demonstrated strong algorithmic knowledge but missed performance edge cases.",
    "roadmapSteps": [
      {
        "stepOrder": 1,
        "topic": "Time Complexity Optimization",
        "description": "Practice optimization strategies to resolve nested loop bottlenecks."
      }
    ]
  }
}
```
