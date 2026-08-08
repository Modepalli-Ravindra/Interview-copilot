# Authorization Model: RBAC & ABAC Policy Architecture

## 1. Role-Based Access Control (RBAC) Matrix
The system uses a hierarchical RBAC model to restrict access based on user roles: **Candidate, Recruiter, and Admin**.

| Resource | Action | Candidate | Recruiter | Admin |
| :--- | :--- | :---: | :---: | :---: |
| **Resumes** | Create | YES | NO | NO |
| | Read | Owner Only | YES | YES |
| | Delete | Owner Only | NO | YES |
| **Sessions** | Create | YES | YES | YES |
| | Read | Owner Only | Tenant Only | YES |
| | Delete | NO | NO | YES |
| **Feedback Reports**| Read | Owner Only | Tenant Only | YES |
| **Prompt Templates**| Edit | NO | NO | YES |
| **System Settings** | Edit | NO | NO | YES |

---

## 2. Attribute-Based Access Control (ABAC) Policies
To support secure multi-tenancy and resource ownership validation (e.g., preventing Candidate A from accessing Candidate B's resume), we implement ABAC policies.

*   **Rule-1: Resume Ownership**
    *   *Subject:* User (Role: Candidate)
    *   *Action:* Read/Delete
    *   *Resource:* Resume
    *   *Condition:* `Subject.id == Resource.userId`
*   **Rule-2: Recruiter Tenancy**
    *   *Subject:* User (Role: Recruiter)
    *   *Action:* Read
    *   *Resource:* Candidate Session
    *   *Condition:* `Subject.tenantId == Resource.tenantId`

---

## 3. Enforcement Architecture

### 3.1. Express Middleware Guards
```typescript
import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    tenantId?: string;
  };
}

// Middleware to enforce RBAC permissions
export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(430).json({ error: 'Access Denied: Insufficient Permissions' });
    }
    next();
  };
};

// Middleware to enforce ABAC ownership validation
export const validateSessionOwner = () => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const { sessionId } = req.params;
    const userId = req.user?.id;
    
    // 1. Fetch Session from Database
    // 2. Validate if session.userId === userId
    // 3. If false, return res.status(403)
    next();
  };
};
```

### 3.2. Database Row-Level Security (RLS)
For maximum data isolation safety in PostgreSQL, we enable Row-Level Security on tenant tables.

```sql
-- Enable RLS on session table
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy restricting candidate visibility
CREATE POLICY candidate_session_isolation_policy ON interview_sessions
    FOR SELECT
    USING (user_id = CURRENT_SETTING('app.current_user_id')::uuid);

-- Create policy restricting recruiter tenant visibility
CREATE POLICY recruiter_session_isolation_policy ON interview_sessions
    FOR SELECT
    USING (tenant_id = CURRENT_SETTING('app.current_tenant_id')::uuid);
```

---

## 4. Security Audit Logging Schema
Every access check failure is logged to detect and prevent privilege escalation attempts.

```sql
CREATE TABLE security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_attempted VARCHAR(100) NOT NULL,
    resource_uri VARCHAR(512) NOT NULL,
    decision VARCHAR(50) DEFAULT 'DENIED', -- 'GRANTED', 'DENIED'
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_security_audit_logs_created ON security_audit_logs(created_at DESC);
```
