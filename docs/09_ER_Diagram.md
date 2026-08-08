# Entity-Relationship (ER) Diagram & Schema Dictionary

## 1. Relational ER Diagram (Mermaid)
The following physical ER diagram shows all system tables, data types, keys, indices, and constraints.

```mermaid
erDiagram
    users {
        uuid id PK
        varchar email UK
        varchar password_hash
        varchar first_name
        varchar last_name
        varchar role
        timestamptz created_at
        timestamptz updated_at
    }
    resumes {
        uuid id PK
        uuid user_id FK
        varchar file_url
        text parsed_text
        text_array skills
        vector experience_vector
        timestamptz created_at
    }
    job_descriptions {
        uuid id PK
        varchar title
        varchar company
        text raw_text
        text_array skills_required
        vector jd_vector
        timestamptz created_at
    }
    interview_sessions {
        uuid id PK
        uuid user_id FK
        uuid resume_id FK
        uuid job_description_id FK
        varchar status
        varchar current_mode
        timestamptz created_at
        timestamptz updated_at
    }
    chat_logs {
        uuid id PK
        uuid session_id FK
        varchar sender
        text message_text
        varchar audio_url
        vector message_vector
        timestamptz created_at
    }
    feedback_reports {
        uuid id PK
        uuid session_id FK
        int score_technical
        int score_communication
        int score_behavioral
        text summary_evaluation
        timestamptz created_at
    }
    roadmap_steps {
        uuid id PK
        uuid feedback_report_id FK
        int step_order
        varchar topic
        text description
        varchar resources_url
        boolean completed
        timestamptz target_date
    }
    user_github_repos {
        uuid id PK
        uuid user_id FK
        varchar repo_name
        varchar repo_url
        text parsed_structure
        timestamptz last_synced_at
    }

    users ||--o{ resumes : "uploads"
    users ||--o{ user_github_repos : "syncs"
    users ||--o{ interview_sessions : "starts"
    resumes ||--o{ interview_sessions : "references"
    job_descriptions ||--o{ interview_sessions : "targets"
    interview_sessions ||--o{ chat_logs : "records"
    interview_sessions ||--|| feedback_reports : "generates"
    feedback_reports ||--o{ roadmap_steps : "contains"
```

---

## 2. Relational Schema Data Dictionary

### 2.1. `users` Table
| Column Name | Data Type | Nullable | Keys | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT gen_random_uuid() | Unique identifier for each system user. |
| `email` | `varchar(255)` | NO | UK | UNIQUE | User login email. |
| `password_hash` | `varchar(255)` | NO | - | - | Salted and hashed password. |
| `first_name` | `varchar(100)` | YES | - | - | User first name. |
| `last_name` | `varchar(100)` | YES | - | - | User last name. |
| `role` | `varchar(50)` | NO | - | DEFAULT 'candidate' | Security role (`candidate`, `recruiter`, `admin`). |
| `created_at` | `timestamptz` | NO | - | DEFAULT NOW() | Record creation timestamp. |
| `updated_at` | `timestamptz` | NO | - | DEFAULT NOW() | Record update timestamp. |

### 2.2. `chat_logs` Table
| Column Name | Data Type | Nullable | Keys | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid` | NO | PK | DEFAULT gen_random_uuid() | Unique identifier for the turn message. |
| `session_id` | `uuid` | NO | FK | REFERENCES interview_sessions(id) ON DELETE CASCADE | Associated interview session. |
| `sender` | `varchar(50)` | NO | - | CHECK (`sender` IN ('system', 'interviewer', 'candidate')) | Speaker role. |
| `message_text` | `text` | NO | - | - | Transcribed or generated chat text. |
| `audio_url` | `varchar(512)` | YES | - | - | S3 storage location of corresponding speech audio. |
| `message_vector`| `vector(1536)`| YES | - | - | Semantic vector embedding for RAG memory search. |
| `created_at` | `timestamptz` | NO | - | DEFAULT NOW() | Timestamp of speech. |

---

## 3. Database Indexes & Query Constraints
*   `users_pkey`: B-Tree index on `users.id` (Automatic).
*   `idx_users_email`: B-Tree index on `users.email` (For authentication lookup).
*   `idx_chat_logs_session_created`: Composite B-Tree index on `chat_logs(session_id, created_at ASC)` to pull ordered conversation transcript histories.
*   `idx_chat_logs_vector_hnsw`: pgvector HNSW index using Cosine operators for real-time memory RAG execution.
