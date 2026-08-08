# Environment Setup: Prerequisites & Bootstrapping

> ## As-Built (Current Setup)
>
> - **No Docker is required for local dev.** Postgres/Redis/Judge0 containers are not used.
> - Copy the env template: `cp backend/.env.example backend/.env`. A `frontend/.env` is
>   not required (Vite proxy targets `http://localhost:3000`).
> - **Database:** leave `DATABASE_URL` unset to use the JSON-file store, or set it to your
>   Supabase connection string. `npm run db:migrate` migrates `backend/data/sessions.json`
>   into Postgres (requires `DATABASE_URL`).
> - **AI gateway (OmniRoute, free):** `npm install -g omniroute`, then start it:
>   `omniroute` → listens on `http://127.0.0.1:20128` (log file optional:
>   `omniroute > omniroute.log 2>&1`). Confirm with `curl http://127.0.0.1:20128/v1/models`.
> - **Fallback (opencode):** `opencode serve` on `http://127.0.0.1:4096`. If both are down
>   the app uses its built-in mock interviewer.
> - Backend dev: `npm run dev` (port 3000). Frontend dev: `npm run dev` (port 5173).
> - **Docker (optional, Phase 11):** from the repo root,
>   `docker compose up -d --build` runs backend (:3000) + OmniRoute (:20128, from the official
>   image `diegosouzapw/omniroute:latest`) with healthchecks, `restart: unless-stopped`, and
>   named data volumes (auto-start on reboot). Requires `backend/.env` with Supabase creds;
>   `OMNIROUTE_URL` is overridden to the compose network name `http://omniroute:20128`.

---

## 1. System Prerequisites
Before installing and starting the application locally, ensure your system has the following software installed:

*   **Node.js:** Version `20.x` or above.
*   **Package Manager:** `npm` (v10+).
*   **Docker Desktop:** Required to orchestrate databases, caches, and sandbox environments.
*   **Git Client:** Required to manage branches and pull requests.
*   **PostgreSQL Client (`psql`):** (Optional) Helpful for inspecting database tables locally.

---

## 2. Step-by-Step Local Setup

### Step 1: Clone the Codebase
```bash
git clone https://github.com/your-org/interview-pilot.git
cd interview-pilot
```

### Step 2: Configure Environment Files
Copy the environment template files in both the frontend and backend folders:
```bash
# Backend Environment Setup
cp backend/.env.example backend/.env

# Frontend Environment Setup
cp frontend/.env.example frontend/.env
```
*Note: Update the keys inside `backend/.env` with your active database credentials and AI provider API tokens.*

### Step 3: Install Node Packages
Install dependencies in both project folders:
```bash
# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### Step 4: Boot Infrastructure Containers
Start the PostgreSQL database, Redis cache, and Judge0 code runner services in the background using Docker Compose:
```bash
# Run from workspace root folder
docker-compose up -d
```

### Step 5: Initialize Database Schema
Run database migrations to initialize tables and enable vector search support:
```bash
cd ../backend
npm run db:migrate
```

---

## 3. Local Run Commands Reference

| Script Action | Command Line | Target Directory | Purpose |
| :--- | :--- | :--- | :--- |
| **Start Backend Dev** | `npm run dev` | `/backend` | Starts Node API listener with hot reload. |
| **Start Frontend Dev** | `npm run dev` | `/frontend` | Boots Vite server (Local port: `http://localhost:5173`). |
| **Run Unit Tests** | `npm run test` | `/backend` or `/frontend` | Executes Vitest/Jest unit tests. |
| **Run E2E Checks** | `npx playwright test`| `/frontend` | Runs Playwright E2E browser tests. |
| **Format Check** | `npm run lint` | `/backend` or `/frontend` | Validates code style conventions. |

---

## 4. Troubleshooting Setup Issues
*   **Issue: `pgvector` index compilation failure.**
    *   *Cause:* Using standard PostgreSQL Docker images instead of `ankane/pgvector`.
    *   *Fix:* Clean databases using `docker-compose down -v` and restart setup using the correct image.
*   **Issue: Port 5432 is already in use.**
    *   *Cause:* A local PostgreSQL instance is running on your machine.
    *   *Fix:* Stop the local PostgreSQL service or change the port mapping in `docker-compose.yml` to `5433:5432`.
