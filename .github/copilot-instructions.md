# Copilot instructions (Legal-AidFlow)

## Big picture
- Single repo with **Vite + React client** in [client/src](../client/src) and an **Express API server** in [server](../server).
- The server serves **both** the API (`/api/*`) and the SPA on the **same port** (default `5000`). In dev it mounts Vite middleware; in prod it serves built assets from `dist/public`.
- Database is **Postgres + Drizzle ORM**. Shared DB schema + shared Zod payload schemas live in [shared/schema.ts](../shared/schema.ts).

## Key entrypoints
- Server bootstrap: [server/index.ts](../server/index.ts) (trust proxy, JSON parsing w/ `req.rawBody`, sessions, then `registerRoutes`).
- API routes: [server/routes.ts](../server/routes.ts) (all endpoints are defined here).
- DB access layer: [server/storage.ts](../server/storage.ts) (`DatabaseStorage` implements all persistence methods used by routes).
- Client routing/auth: [client/src/App.tsx](../client/src/App.tsx), [client/src/contexts/AuthContext.tsx](../client/src/contexts/AuthContext.tsx) (wouter routes + session-backed auth).

## Auth/session model
- Auth is **cookie session** (`express-session`), not JWT. Server stores `req.session.userId`.
- Client requests must send cookies (`credentials: "include"`); use the wrappers in [client/src/lib/api.ts](../client/src/lib/api.ts).
- Role/user gates:
  - `requireAuth`, `requireStaff`, `requireBeneficiary`, and `requireRole([...])` are the standard route guards (see [server/routes.ts](../server/routes.ts)).
  - Frontend uses `user.userType` to choose Staff vs Portal UX; helper role checks in [client/src/lib/authz.ts](../client/src/lib/authz.ts).

## Validation + error shapes
- Prefer shared Zod schemas from [shared/schema.ts](../shared/schema.ts): routes generally do `insertXSchema.safeParse(req.body)` and return `400` with `fromZodError(...).message`.
- When the server must enforce fields (e.g., `beneficiaryId`), use schema composition (`omit/extend`) like the service request routes in [server/routes.ts](../server/routes.ts).
- Server errors typically return `{ error: string }` (some middleware uses `{ message: string }`); client error display should go through `getErrorMessage` in [client/src/lib/errors.ts](../client/src/lib/errors.ts).

## Uploads (important gotcha)
- Public uploads endpoint is `/api/uploads` and expects the **raw file body**, not multipart.
- Client must set headers: `Content-Type: file.type` and `x-file-name: file.name` (see `fetchUpload` in [client/src/lib/api.ts](../client/src/lib/api.ts)).
- Files are written to the `uploads/` folder and served at `/uploads/<storageKey>` by the server.

## Dev workflows (repo conventions)
- Dev server (API + client together): `npm run dev` (runs `tsx server/index.ts`, Vite is mounted by the server).
- Build: `npm run build` (Vite client build → `dist/public`, then esbuild bundles server → `dist/index.cjs`; see [script/build.ts](../script/build.ts)).
- Start prod bundle: `npm run start`.
- Typecheck: `npm run check`.

## DB / Drizzle
- Drizzle config requires `DATABASE_URL` (see [drizzle.config.ts](../drizzle.config.ts)).
- Push schema: `npm run db:push`.
- Local DB inspection helpers: `npm run db:psql` and friends (see [package.json](../package.json)).
- Schema comments note **legacy columns kept to avoid destructive drops**—avoid removing columns casually unless you’ve verified migration strategy (see [shared/schema.ts](../shared/schema.ts)).

## Smoke scripts
- Smoke suites live in [scripts](../scripts) and are run via `npm run smoke:stage*`.
- They expect a running server at `BASE_URL` (some default to `http://localhost:5001`); set `BASE_URL` to match your server port.

## Path aliases
- `@` → `client/src`, `@shared` → `shared` (see [vite.config.ts](../vite.config.ts)).