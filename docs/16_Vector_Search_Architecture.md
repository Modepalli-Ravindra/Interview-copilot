# Vector Search Architecture: Indexing & Multi-Tenant Segregation

## 1. Vector Index Comparison: HNSW vs. IVFFlat
To support fast similarity searches, we evaluate two index types available in `pgvector`:

| Characteristic | HNSW (Hierarchical Navigable Small World) | IVFFlat (Inverted File with Flat Compression) |
| :--- | :--- | :--- |
| **Search Speed** | Extremely Fast ($O(\log N)$ complexity). | Moderate (Requires clustering lists search). |
| **Index Build Time**| Slow (Highly multi-layered link structures). | Fast (Constructs simple centroid maps). |
| **Memory Footprint**| High (Needs link tables kept in memory). | Low (Compact indexing layout). |
| **Recall / Accuracy**| High (>98% recall). | Medium (Can miss vectors near cluster borders). |
| **Decision** | **HNSW** (Chosen for low latency and high accuracy). | Reject (Accuracy degradation during concurrent searches is unacceptable). |

---

## 2. Distance Metrics & Embedding Specifications
*   **Embedding Model:** `text-embedding-3-small` (1536 dimensions).
*   **Distance Metric:** **Cosine Distance** (`<=>` operator in pgvector). Cosine distance is used because it measures direction rather than length, making it ideal for matching documents of varying sizes.
*   **Vector Definition:**
    $$\text{Cosine Distance} = 1 - \frac{A \cdot B}{\|A\| \|B\|}$$

---

## 3. Database Vector Search Configuration

### 3.1. Database Setup Script
```sql
-- Allocate memory for building index structures efficiently
SET maintenance_work_mem = '512MB';

-- Create table to house document vectors
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- Core for isolating tenant database partitions
    session_id UUID NOT NULL,
    chunk_content TEXT NOT NULL,
    embedding vector(1536) NOT NULL
);

-- Build the HNSW index targeting cosine operations
CREATE INDEX idx_document_embeddings_hnsw 
ON document_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

### 3.2. Configuration Parameters
*   `m` (Max links per node): Deployed at `16`. Controls the connections between nodes in the index graph. Higher values improve search accuracy but increase memory usage.
*   `ef_construction` (Search depth during construction): Deployed at `64`. Higher values improve index quality but increase build times.
*   `ef_search` (Search depth during query time): Configured at `32` using `SET pgvector.ef_search = 32`. Balances search speed and accuracy.

---

## 4. Multi-Tenant Segregation & Vector Queries
To guarantee security and prevent data leaks across sessions, vector queries must include strict metadata filters.

```sql
-- Retrieve the top 3 most relevant resume chunks for a given query, isolated by session
SELECT 
    id, 
    chunk_content, 
    1 - (embedding <=> :query_embedding) AS similarity_score
FROM 
    document_embeddings
WHERE 
    tenant_id = :tenant_id 
    AND session_id = :session_id
ORDER BY 
    embedding <=> :query_embedding
LIMIT 3;
```

---

## 5. Index Maintenance & Rebuilding Policy
*   **Automatic Index Updates:** pgvector automatically updates the HNSW index when new records are added, preventing stale search results.
*   **Reindexing Trigger:** To correct index fragmentation after bulk uploads, a background worker runs `REINDEX INDEX idx_document_embeddings_hnsw` during low-traffic windows (2:00 AM UTC) once the row change count exceeds 30%.
*   **Memory Optimization:** The database server's `shared_buffers` is configured to allocate enough memory to keep active HNSW indexes entirely resident in RAM, preventing slow disk reads.
