# Docker Architecture: Containerization & Development Compose

> ## As-Built (Phase 11, 2026-08-09)
>
> - **Two services, not three.** The original spec's Postgres/Redis/Judge0 containers are
>   **not used** — the app persists to **Supabase Postgres** (managed, external) and runs no
>   Redis/Judge0 (execute uses the remote Judge0 CE API). Real files: `backend/Dockerfile`,
>   `backend/.dockerignore`, `docker-compose.yml` (repo root).
> - **OmniRoute runs from its official image** `diegosouzapw/omniroute:latest` (~250MB, multi-arch,
>   data volume `/app/data`) — not built from source. `stop_grace_period: 40s` protects its
>   SQLite WAL checkpoint on shutdown.
> - **Backend image** is multi-stage (`node:22-alpine` builder → `node:22-alpine` runner, non-root
>   `USER node`, `EXPOSE 3000`, `CMD ["node", "dist/server.js"]`). The `.dockerignore` keeps
>   `node_modules`, `dist`, `data`, `.env`, logs out of the build context.
> - **Compose wiring:** backend reaches OmniRoute as `http://omniroute:20128` (compose network
>   name), **not** `127.0.0.1:20128` (that only works when both run on the host). `env_file`
>   pulls `backend/.env` (Supabase creds etc.); `OMNIROUTE_URL`, `PORT`, `NODE_ENV` overridden.
> - **Healthchecks:** OmniRoute via `GET /v1/models`, backend via `GET /api/health` (both `node -e
>   fetch`, no curl/wget dependency). `depends_on: omniroute: service_healthy`.
> - **Restart + persistence:** both `restart: unless-stopped` (auto-start after reboot — this was
>   the Phase 11 goal); volumes `omniroute-data:/app/data` and `backend-data:/usr/src/app/data`
>   (GitHub cache / JSON-store fallback).
> - **Ports:** OmniRoute bound `127.0.0.1:20128:20128` (never exposed publicly); backend `3000:3000`.
> - **Verification:** Docker is not installed on the dev machine, so `docker compose up` was **not**
>   run. The exact production artifact (`node dist/server.js`, `NODE_ENV=production`) was booted
>   locally and served `/api/health` cleanly with Supabase connected. First real container build
>   happens on **Render (Phase 14)**, which builds from this same `backend/Dockerfile`.
> - **Commands:** `docker compose up -d --build`, `docker compose logs -f`, `docker compose down`.

---

## 1. Multi-Stage Production Dockerfile
The system uses multi-stage Docker builds to keep production image sizes small and minimize the attack surface by excluding compiler dependencies from the runtime image.

### Backend Service: `Dockerfile`
```dockerfile
# ==========================================
# Stage 1: Build Environment
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency structures
COPY package*.json ./

# Install development dependencies
RUN npm ci

# Copy application files
COPY . .

# Compile TypeScript to JavaScript
RUN npm run build

# Remove development packages
RUN npm prune --production

# ==========================================
# Stage 2: Runtime Environment
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/app

ENV NODE_ENV=production

# Copy built application and production dependencies from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Run container as a non-privileged system user
USER node

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

---

## 2. Local Development Orchestration (`docker-compose.yml`)
To support local development, the `docker-compose.yml` file provisions the database, cache, and sandbox environments:

```yaml
version: '3.8'

services:
  # Relational database with pgvector extension
  postgres:
    image: ankane/pgvector:v0.5.0
    container_name: interview_postgres_dev
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: interviewpilot_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: developer_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  # In-memory session store & cache
  redis:
    image: redis:7-alpine
    container_name: interview_redis_dev
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # Core Backend API Service
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: interview_backend_dev
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgres://postgres:developer_password@postgres:5432/interviewpilot_dev
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
  redis_data:
```

---

## 3. Container Security & Optimization Rules
*   **Non-Root User:** Containers use the built-in non-root `node` user to run applications, preventing root-access container escape attacks.
*   **Alpine Base Images:** We use lightweight Alpine base images (`node:20-alpine`) to keep images under 150MB, reducing build and deployment times.
*   **Dependency Caching:** Dockerfiles copy dependency structures (`package*.json`) and run installations *before* copying the rest of the application files. This allows Docker to cache dependency layers, reducing build times.
