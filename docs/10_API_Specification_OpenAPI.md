# API Specification: OpenAPI 3.0 & WebSockets

## 1. OpenAPI 3.0 REST Specification (YAML Format)

```yaml
openapi: 3.0.3
info:
  title: InterviewPilot AI Core API
  description: Public and internal API definitions for managing authentication, resumes, job descriptions, and interview sessions.
  version: 1.0.0
servers:
  - url: https://api.interviewpilot.ai/v1
    description: Production server
paths:
  /auth/register:
    post:
      summary: Register a new user account
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
                - password
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
      responses:
        '201':
          description: User registered successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  userId:
                    type: string
                    format: uuid
        '400':
          description: Invalid input or user already exists

  /auth/login:
    post:
      summary: Authenticate user and return tokens
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
                - password
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
      responses:
        '200':
          description: Successful authentication
          headers:
            Set-Cookie:
              schema:
                type: string
                description: HTTP-only refresh token cookie
          content:
            application/json:
              schema:
                type: object
                properties:
                  accessToken:
                    type: string
                  expiresIn:
                    type: integer
        '401':
          description: Invalid credentials

  /resumes/upload:
    post:
      summary: Upload candidate resume for parsing
      security:
        - BearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
      responses:
        '200':
          description: Resume parsed and saved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  resumeId:
                    type: string
                    format: uuid
                  skills:
                    type: array
                    items:
                      type: string
                  matchScore:
                    type: integer

components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

---

## 2. Real-Time WebSockets (Socket.IO) Event Schema

WebSocket interactions occur over Socket.IO under Namespace `/interview`. Authentication is validated during connection handshakes via Bearer tokens passed in query metadata parameters.

### 2.1. Client-to-Server Events

#### Event: `start_session`
Initiates WebRTC channels and loads memory profiles.
```json
{
  "sessionId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "mode": "BEHAVIORAL"
}
```

#### Event: `barge_in`
Signals the backend that the candidate started speaking mid-synthesis.
```json
{
  "timestamp": 1783921820311
}
```

#### Event: `editor_change`
Broadcasts live Monaco Editor text additions.
```json
{
  "sessionId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "code": "def find_sum(arr):\n    return sum(arr)",
  "languageId": 71
}
```

### 2.2. Server-to-Client Events

#### Event: `transcript_update`
Sends real-time candidate and interviewer text transcripts.
```json
{
  "sender": "interviewer",
  "text": "Great explanation. How would you handle memory constraints in this approach?",
  "isFinal": true
}
```

#### Event: `audio_chunk`
Streams raw synthesized voice audio buffers to the audio player queues (fallback if WebRTC direct channel encounters packet congestion issues).
```json
{
  "chunkIndex": 12,
  "data": "Base64EncodedOpusAudioBytes..."
}
```

#### Event: `editor_sync`
Syncs execution results from Judge0 compiler runs.
```json
{
  "status": "ACCEPTED",
  "stdout": "True\n",
  "stderr": null,
  "passedCount": 5,
  "totalCount": 5
}
```
