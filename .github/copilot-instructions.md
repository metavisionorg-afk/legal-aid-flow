# Copilot instructions (Legal-AidFlow)

## Architecture (read this first)
- Monorepo: **Vite + React** client in [client/src](../client/src) and **Express** server in [server](../server).
- Single-port deployment: server serves **API** under `/api/*` and the SPA on the **same port** (default `5000`). Dev mounts Vite middleware; prod serves `dist/public` (see [server/index.ts](../server/index.ts) and [script/build.ts](../script/build.ts)).
- DB: **Postgres + Drizzle**. DB tables + shared Zod payload schemas live in [shared/schema.ts](../shared/schema.ts); persistence methods are in [server/storage.ts](../server/storage.ts).

## Key entrypoints
- Server bootstrap: [server/index.ts](../server/index.ts) (trust proxy, `req.rawBody`, sessions/Redis, then `registerRoutes`).
- All API routes live in one file: [server/routes.ts](../server/routes.ts) (route guards, feature flags, uploads, workflows).
- Client routing/auth: [client/src/App.tsx](../client/src/App.tsx) (wouter routes) + [client/src/contexts/AuthContext.tsx](../client/src/contexts/AuthContext.tsx) (session-backed `authAPI.me()`).

## Auth + authorization conventions
- Auth is **cookie session** (`express-session`), not JWT; server stores `req.session.userId`.
- Client fetch wrappers **must include cookies** (`credentials: "include"`); use [client/src/lib/api.ts](../client/src/lib/api.ts).
- Standard server guards: `requireAuth`, `requireStaff`, `requireBeneficiary`, `requireRole([...])` in [server/routes.ts](../server/routes.ts).
- Frontend role decisions: `user.userType` and `user.role`; helpers in [client/src/lib/authz.ts](../client/src/lib/authz.ts).

## Validation + error shape
- Prefer shared Zod schemas from [shared/schema.ts](../shared/schema.ts). Pattern in routes: `schema.safeParse(req.body)` → `400 { error: fromZodError(...).message }`.
- When enforcing server-owned fields, compose schemas via `omit/extend` (example: service request create in [server/routes.ts](../server/routes.ts)).
- API errors are usually `{ error: string }`; global error middleware may emit `{ message: string }`. Client displays via `getErrorMessage()` in [client/src/lib/errors.ts](../client/src/lib/errors.ts).

## Uploads (non-multipart)
- `/api/uploads` expects the **raw file body** (not multipart). Client uses `fetchUpload()` in [client/src/lib/api.ts](../client/src/lib/api.ts).
- Required headers: `Content-Type` and `x-file-name`. Server validates allowed MIME types + max size and writes to `uploads/`; served publicly at `/uploads/<storageKey>`.

## Workflows + scripts
- Dev: `npm run dev` (server mounts Vite).
- Build/prod: `npm run build` → `npm run start`.
- Typecheck: `npm run check`.
- DB: `npm run db:push` (requires `DATABASE_URL`; see [drizzle.config.ts](../drizzle.config.ts)).
- Migrations/util scripts live in [scripts](../scripts) (e.g. `npm run migrate:intake-case-types:*`, `npm run smoke:stage*`). Some smokes use `BASE_URL`.
- Local psql helper disables paging: `npm run db:psql` (see [package.json](../package.json)).

## Runtime config gotchas
- Production requires `SESSION_SECRET` and `REDIS_URL`/`REDIS_PUBLIC_URL`; dev can fall back to MemoryStore (see [server/index.ts](../server/index.ts)).
- Feature flags are env-driven and exposed at `/api/config/features` (see [server/routes.ts](../server/routes.ts)).

## Path aliases
- `@` → `client/src`, `@shared` → `shared` (see [vite.config.ts](../vite.config.ts)).