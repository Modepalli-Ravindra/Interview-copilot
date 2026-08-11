# 55 — Supabase Registration Fix (Service-Role, Backend-Only)

Status: Implemented — offline suites green; live registration pending the
service-role key being added to `backend/.env`.
Date: 2026-08-11

## 1. The blocker

`POST /api/auth/register` failed with:

```
42501: new row violates row-level security policy for table "users"
```

Root cause: the backend was using the Supabase **publishable (anon) key**
(`SUPABASE_KEY`) for the `users` table. The `users` table has RLS enabled, and
no permissive policy exists for the anon role — so anonymous INSERTs are denied
by design. This is correct RLS behavior; the *backend* was using the wrong key.

The documented intent already existed in `backend/db/schema.sql`:

> "Single-user app: the backend connects with the owner/service-role
>  credential, so RLS is not enforced on that connection."

The implementation simply never wired the service-role credential.

## 2. The fix

`backend/src/routes/auth.ts` now uses a **backend-only privileged Supabase
client** for all `users` table operations (register existence-check + insert,
login select):

- Lazy `getServiceSupabase()` client built from `SUPABASE_SERVICE_ROLE_KEY`.
- Service-role bypasses RLS, so the `users` table stays RLS-enabled and is
  never publicly writable.
- The anon (`SUPABASE_KEY`) key is **no longer used** for the `users` table at
  all — it remains only for the client-safe `sessions` store.
- Unique-email race on insert (Postgres `23505`) maps to `400 User already exists`.
- Missing `SUPABASE_SERVICE_ROLE_KEY` fails with a clean `500` (never a crash),
  preserving offline test behavior.

## 3. RLS inspection

Inspection was limited to what the backend can observe with an anon key (it
cannot read `pg_policies`). Recorded facts and required manual confirmation:

| Item | State | Source |
| --- | --- | --- |
| RLS enabled on `users` | **YES** | Live `42501` on anon INSERT (observed 2026-08-11) |
| RLS enabled on `sessions` | **YES** (evidenced) | anon SELECT works today; verify below |
| INSERT policy (`users`) | No permissive policy for anon | INSERT denied with 42501 |
| SELECT policy (`users`) | Unknown | `users` is only ever read via service-role now; verify below |
| UPDATE / DELETE (`users`) | Not used by the app | Verify below |

**Verify / harden in the Supabase SQL editor** (read-only first):

```sql
select c.relname, r.policyname, r.cmd, r.roles, r.qual, r.with_check
from pg_policies r
join pg_class c on c.oid = r.tablename
where c.relname in ('users', 'sessions')
order by c.relname, r.cmd;

select relname, relrowsecurity
from pg_class
where relname in ('users', 'sessions');
```

**Recommended posture** (no migration required for the service-role design):
- `users`: no permissive policies for `anon` or `authenticated` at all. The
  backend's service-role connection bypasses RLS; nothing else may touch it.
- `sessions`: keep whatever policy currently permits the app to read/write its
  own rows through the anon key (that is the pre-existing design).

If you later add Supabase Auth and want the `users` table managed by
`auth.users` triggers instead, create policies scoped to
`to (authenticated) using (id = auth.uid())` — never a blanket `anon` grant.

## 4. Service-role key security posture

- `SUPABASE_SERVICE_ROLE_KEY` lives **only** in `backend/.env` (gitignored).
- Never sent to the frontend; no API response ever contains it.
- No `VITE_*` variable references it (frontend has no Supabase keys at all).
- Never logged (the auth route logs only error messages, never env values).
- `.gitignore` already ignores `.env`, `.env.*` and un-ignores only
  `.env.example`; `.env.example` now documents the key with placeholder only.

## 5. Environment changes

`.env.example` (placeholders only, no real values):

```
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
```

`backend/.env` gains a real `SUPABASE_SERVICE_ROLE_KEY=...` (value added by the
operator; never printed or committed).

## 6. Verification

Offline (no Supabase needed):

```
npm run test:auth            27/27 PASS
npm run test:smoke           26/26 PASS
npm run test:phase5          29/29 PASS
npm run test:phase5metrics   37/37 PASS
npm run test:phase6         106/106 PASS
npm run test:intelligence    58/58 PASS
npm run test:resumejd        42/42 PASS
npm run test:github         104/104 PASS
npm run test:phase3          14/19  (5 pre-existing mock-template failures, unrelated)
npm run build                clean (tsc strict)
```

Live (once the key is in `backend/.env` and the server is restarted):
register A → login A → /me → register B → login B → create session A →
owner access → cross-user 404 → B-list exclusion → mutation 404 → logout
semantics.
