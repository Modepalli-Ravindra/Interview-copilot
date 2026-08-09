# Deployment Guide: Infrastructure Provisioning & Environment Setup

> ## As-Built (Current Deployment) — updated Phase 4–6
>
> ₹0/month stack (single user, personal use):
>
> | Layer | Host | Notes |
> | :--- | :--- | :--- |
> | Frontend (React + Vite + TS) | **Vercel** (free) | Build `npm run build`, output `dist` |
> | Backend (Express + Socket.IO) | **Render free tier** (750 h/mo) | Port `3000`; WebSocket traffic keeps the free instance awake; ~15-min idle spin-down, 30–50s cold start |
> | Database | **Supabase Postgres** (free) | `sessions` table; `DATABASE_URL` connection string |
> | AI gateway | **OmniRoute** local proxy (`:20128`, free providers, `model: auto`) | Must run on the same host/VPS as the backend in production, or use a provider the backend can reach |
> | AI fallback | **opencode** serve (`:4096`) then deterministic mock | Keeps interviews alive if the gateway is down |
>
> - No Cloudflare/Railway/Neon/Upstash/Judge0 in the current build (design targets only).
> - The original design below (multi-cloud, Redis cache, JWT keys, paid AI keys) is retained
>   for reference and will partially apply as auth (Phase 10) lands.
> - **Phase 11 (Docker) added:** `backend/Dockerfile` (multi-stage, `node:22-alpine`,
>   `CMD node dist/server.js`) is the Render build source; root `docker-compose.yml` runs
>   backend + official OmniRoute image locally (see `docs/41_Docker_Architecture.md`).
> - **Phase 14 (Render) added — single-container deploy:** the Render image is
>   `backend/Dockerfile.render` built on the **official OmniRoute image**
>   (`diegosouzapw/omniroute:latest`) with the backend layered in; `backend/supervisor.sh`
>   runs both processes (OmniRoute internal `:20128` + backend on Render's `PORT`). Deploy
>   config is the root `render.yaml` Blueprint (`plan: free`, health check `/api/health`,
>   region `singapore`). Memory is budgeted for the 512MB free tier
>   (`OMNIROUTE_MEMORY_MB=320`, backend heap 96MB). `AUTH_ENABLED=false` on Render until
>   Phase 13 wires the token into frontend calls.
> - **Phase 13 (Vercel) added:** frontend calls the Render backend **directly** via
>   `VITE_BACKEND_URL` (build-time env) — `frontend/src/lib/api.ts` `apiFetch()` prepends it
>   and injects `Authorization: Bearer <token>` from `localStorage['interviewpilot_token']`;
>   `socketService` connects to `${VITE_BACKEND_URL}/interview` with the token in the
>   handshake, and the backend socket now rejects handshakes without it when
>   `AUTH_ENABLED=true`. `frontend/vercel.json` = Vite build + SPA fallback. See §6.

---

## 1. Target Infrastructure Layout
The production environment uses a multi-cloud strategy to balance deployment speed, scaling, and database reliability:

```mermaid
graph TD
    User[Client Browser] -->|Route 53 / DNS| Cloudflare[Cloudflare CDN & SSL]
    
    Cloudflare -->|HTTPS / Dashboard| Vercel[Vercel Serverless: Frontend]
    Cloudflare -->|WebRTC / WSS / REST| Railway[Railway Container: Backend API]
    
    Railway -->|Relational & pgvector| Neon[Neon Serverless PostgreSQL]
    Railway -->|Task Queue / Cache| RedisUp[Upstash Redis / Cache]
    Railway -->|Run Code Sandbox| Judge0[Judge0 Sandbox Instance]
```

---

## 2. Infrastructure Setup & Provisioning Steps

### 2.1. Provision Database (Neon PostgreSQL)
1.  Log in to the Neon Console and create a new project named `interviewpilot-prod`.
2.  Enable PostgreSQL version `15` or above.
3.  Open the SQL editor in the Neon Console and run the following command to enable the vector extension:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;
    ```
4.  Copy the connection string (e.g., `postgres://user:password@subdomain.neon.tech/main?sslmode=require`) to use in your backend configurations.

### 2.2. Deploy Cache (Upstash Redis)
1.  Log in to the Upstash Console and create a new serverless Redis cluster.
2.  Set eviction policies to `volatile-lru` to protect key user session caches when memory fills up.
3.  Copy the connection URL (`rediss://default:password@endpoint.upstash.io:6379`) to use in your backend configurations.

### 2.3. Deploy Backend (Railway Containers)
1.  Log in to the Railway Console and create a new project.
2.  Add a service targeting your backend GitHub repository.
3.  Configure the service to use a multi-stage Docker build, exposing port `3000`.
4.  Configure the environment variables listed in Section 3.

### 2.4. Deploy Frontend (Vercel Serverless)
1.  Log in to the Vercel Console and link your frontend repository.
2.  Configure build settings:
    *   *Build Command:* `npm run build`
    *   *Output Directory:* `dist`
    *   *Framework Preset:* `Vite`
3.  Add the environment variables listed in Section 3, then run the deployment.

---

## 3. Environment Variables Configuration Template
Create a secure `.env` file for your services:

```text
# ==========================================
# BACKEND ENGINE VARIABLES
# ==========================================
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://user:password@subdomain.neon.tech/main?sslmode=require
REDIS_URL=rediss://default:password@endpoint.upstash.io:6379

# Cryptography Secrets
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."

# AI Provider Access Keys
OPENAI_API_KEY=sk-proj-xxxxxx
GEMINI_API_KEY=AIzaSyxxxxxx
OPENCODE_API_KEY=oc-sk-xxxxxx

# Judge0 Execution Credentials
JUDGE0_API_URL=https://api.judge0.com
JUDGE0_API_KEY=sec-xxxxxx
```
---
## 5. As-Built Deploy Runbook (Phase 14 — Render free)

> Prereq: this repo is not yet a git repo. Render builds from a Git provider, so first:
> `git init`, add+commit, create a **private** GitHub repo, `git remote add origin …`, `git push -u origin main`.

**Deploy:**
1. Push `render.yaml` (root) with the repo.
2. Render Dashboard → **New → Blueprint** → select the repo → `render.yaml` is detected.
3. Render prompts for the `sync: false` secrets:
   - `FRONTEND_URL` → the Vercel app URL **after** Phase 13 (until then leave it; CORS still allows the Vite dev origin).
   - `SUPABASE_KEY` → publishable key `sb_publishable_6ecIaETvXFmyo78foK2Dmw_eRxCxHtM`.
   - `AUTH_TOKEN` → generated automatically.
4. Deploy completes → free web service at `https://interviewpilot-api.onrender.com`.

**Verify (curl):**
```bash
curl -s https://interviewpilot-api.onrender.com/api/health   # {"status":"healthy",...}
curl -s https://interviewpilot-api.onrender.com/api/sessions # 401 without token (when AUTH_ENABLED=true later)
```

**Facts & gotchas:**
- 512MB RAM / 0.1 CPU, 750 h/mo shared across all free services; 15-min idle spin-down → 30–60s cold start. WebSocket traffic keeps it awake.
- Memory budget: `OMNIROUTE_MEMORY_MB=320` (supervisor caps it; image default 1024 would OOM) + backend 96MB heap. If OOM restarts occur, lower `OMNIROUTE_MEMORY_MB`.
- **No persistent disk on free** → OmniRoute SQLite/quota state and the backend GitHub cache reset on each deploy/restart. Real data lives in Supabase — acceptable.
- `AUTH_ENABLED=false` on Render by design until Phase 13 adds the token header to the frontend.
- Fallback chain on Render: OmniRoute (same container) → **mock** (opencode is `disabled`).
- Container image ~500MB+; first build takes several minutes (500 free build min/mo).

---

## 6. As-Built Deploy Runbook (Phase 13 — Vercel)

**Deploy:**
1. Push the repo to GitHub (main).
2. Vercel → **Add New → Project** → import the repo.
3. Set **Root Directory** = `frontend` (monorepo: the Vite app lives in `frontend/`; `frontend/vercel.json` supplies build command + output dir + SPA fallback).
4. Add env var **`VITE_BACKEND_URL`** = the Render URL, e.g. `https://interviewpilot-api.onrender.com` (build-time — redeploy on change).
5. Deploy → free Vercel app, e.g. `https://interviewpilot-<slug>.vercel.app`.

**After both sides are up:**
6. On Render, set `FRONTEND_URL` (the `sync:false` secret) to the Vercel URL so Express + Socket.IO CORS accept it.
7. Optional: enable auth — set `AUTH_ENABLED=true` on Render with the generated `AUTH_TOKEN`, then in the browser devtools: `localStorage.setItem('interviewpilot_token', '<same token>')`. Frontend now attaches `Authorization: Bearer <token>` to REST and the socket handshake.

**Verify:**
```bash
curl -s https://<vercel-app>/   # HTML SPA
curl -s https://<render-app>/api/health
```
Open the Vercel URL → start an interview → check Network tab: `/api/...` calls go to `https://<render-app>` (not Vercel), socket connects with `wss://<render-app>/socket.io`.

**Gotchas:**
- No `/api` proxy on Vercel by design — everything is same-`VITE_BACKEND_URL`. If `VITE_BACKEND_URL` is empty, calls fall back to the same origin and will hit the SPA fallback (breaks API) — always set it in production.
- Vercel rewrites don't reliably proxy external WebSockets; the direct URL avoids that.
- `vercel.json` SPA fallback only rewrites non-`assets/` paths; real static files (Vite hashed assets) are served first.

---

## 4. Domain & SSL Configuration
*   **Domain Mapping:** Configure custom domains (such as `app.interviewpilot.ai`) inside your Vercel and Railway dashboard settings.
*   **Cloudflare Proxy (CDN):** Set Cloudflare encryption mode to **Full (Strict)** to secure communication between Cloudflare and your origin servers.
*   **Edge Certificates:** cloudflare automatically provisions and renews SSL certificates at edge nodes, ensuring all user traffic is encrypted.
