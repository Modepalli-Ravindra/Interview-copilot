# Test Cases: Functional & Security Verification Suites

## 1. Authentication & Security Test Cases

### TC-AUTH-01: Refresh Token Rotation (RTR) Validation
*   **Description:** Verify that using a refresh token invalidates it and issues a new token pair, and using a reused token triggers access revocation.
*   **Pre-conditions:** User is registered and logged in.
*   **Input Data:** Valid HTTP-Only `refreshToken` cookie.
*   **Execution Steps:**
    1. Send POST request to `/v1/auth/refresh` containing `refreshToken_A`.
    2. Capture returned `accessToken_B` and `refreshToken_B` cookie.
    3. Resend POST request to `/v1/auth/refresh` using the old `refreshToken_A` cookie.
*   **Expected Output:**
    *   Step 2: Return HTTP `200 OK` with a valid JWT token.
    *   Step 3: Return HTTP `401 Unauthorized`. The backend flags the reuse, invalidates `refreshToken_B`, and deletes active session entries in Redis.

---

## 2. Voice Streaming & WebRTC Test Cases

### TC-VOICE-01: Voice Activity Detection (VAD) Barge-In Execution
*   **Description:** Verify that client speech triggers VAD, cancels downstream audio playback, and stops LLM streaming.
*   **Pre-conditions:** WebRTC connection is active; the server is streaming a voice response.
*   **Input Data:** Audio input threshold exceeds -45dB for more than 150ms.
*   **Execution Steps:**
    1. Start playback of a synthesized audio stream in the browser.
    2. Simulate microphone input that exceeds the voice threshold.
    3. Verify that the client sends a `barge_in` event via WebSockets.
*   **Expected Output:**
    *   The client audio player immediately stops output speakers.
    *   The backend halts the active LLM stream and logs: `[Voice Engine] Aborted inference session due to barge_in`.

---

## 3. Monaco Editor & Coding Engine Test Cases

### TC-CODE-01: Sandboxed Execution Timeout
*   **Description:** Verify that code containing an infinite loop is terminated by the sandbox, returning a timeout error instead of hanging the server.
*   **Pre-conditions:** Monaco editor connection is active.
*   **Input Data:** Source code payload: `while True: pass` (Python).
*   **Execution Steps:**
    1. Paste the infinite loop code into the Monaco Editor.
    2. Click the **Run Tests** action button.
    3. Monitor the response event sent via Socket.IO.
*   **Expected Output:**
    *   The compiler execution terminates after exactly 2.0 seconds.
    *   The UI displays: `Execution Failed: TIME_LIMIT_EXCEEDED` (Status code: HTTP 400).
    *   The server resource usage remains below limits (<256MB RAM).
