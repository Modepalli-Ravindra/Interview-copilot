# Logging Strategy: Structured Audits & PII Scrubbing

## 1. Structured Logging Format
The application uses structured JSON logging to make log collection, search indexing, and dashboard analysis simple and consistent.

```json
{
  "timestamp": "2026-08-08T02:41:16.123Z",
  "level": "INFO",
  "service": "voice-engine",
  "correlationId": "tx_8b329a12-88d0-4ba4-9a00-11112b322a00",
  "userId": "usr_7ba39d12-120d-4fa4-a212-36c12b322a11",
  "message": "WebRTC connection established with client",
  "metadata": {
    "sessionId": "ses_9a121111-88d0-4ba4-9a00-22222b322bbb",
    "latencyMs": 145
  }
}
```

---

## 2. Logger Configuration (Winston)
We use the **Winston** logging library for Node.js to format and write application logs.

```typescript
import winston from 'winston';

const piiRegexPatterns = [
  /("email"\s*:\s*")[^"]+(")/g,
  /("password"\s*:\s*")[^"]+(")/g,
  /(\d{3}-\d{2}-\d{4})/g // Matches US SSN format
];

// Winston formatter to scrub PII from log outputs
const scrubPiiFormat = winston.format((info) => {
  let logText = JSON.stringify(info);
  piiRegexPatterns.forEach((pattern) => {
    logText = logText.replace(pattern, '$1[REDACTED]$2');
  });
  return JSON.parse(logText);
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    scrubPiiFormat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});
```

---

## 3. Log Levels & Usage Policy

*   **FATAL / ERROR:** Critical issues requiring immediate attention (e.g., database connection loss, disk errors). These events trigger system alerts.
*   **WARN:** Non-critical alerts (e.g., fallback API gateway route triggered, invalid authentication attempt).
*   **INFO:** Key application events (e.g., successful user login, interview session completed, code validation executed).
*   **DEBUG:** Detailed diagnostic logs for developers (e.g., voice packets received, database query details). Disabled in production.

---

## 4. Correlation IDs & Distributed Tracing
To trace requests across multiple services:
1.  **Correlation ID Generation:** The API Gateway generates a unique correlation ID (`correlationId`) for every incoming user request.
2.  **Header Propagation:** This ID is passed to downstream microservices in request metadata headers (e.g., `X-Correlation-ID` in gRPC requests).
3.  **Unified Logs:** All services print this ID in their logs, allowing developers to trace the entire lifecycle of a request across the system.
