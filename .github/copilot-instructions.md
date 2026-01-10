
# Copilot Instructions for Legal-AidFlow

## Architecture Overview
- **Monorepo**: Contains a Vite + React SPA ([client/src](../client/src)) and an Express API server ([server](../server)), sharing types and Zod schemas in [shared/schema.ts](../shared/schema.ts).
- **Single-port deployment**: Both API (`/api/*`) and SPA are served from the same port (default: 5000). In dev, Vite middleware is mounted; in prod, static files are served from `dist/public`.
- **Database**: PostgreSQL with Drizzle ORM. All schema and validation live in [shared/schema.ts](../shared/schema.ts). All DB access is via [server/storage.ts](../server/storage.ts).

## Key Patterns & Files
- **Server entry**: [server/index.ts](../server/index.ts) (sets up trust proxy, sessions, static, then calls `registerRoutes`).
- **API routes**: All endpoints are in [server/routes.ts](../server/routes.ts). Route guards (`requireAuth`, `requireStaff`, `requireBeneficiary`, `requireRole([...])`) and feature flags are defined here.
- **Client routing/auth**: [client/src/App.tsx](../client/src/App.tsx) (Wouter routes), [client/src/contexts/AuthContext.tsx](../client/src/contexts/AuthContext.tsx) (session-based auth, not JWT).
- **API fetch**: Use [client/src/lib/api.ts](../client/src/lib/api.ts) for all client requests. Always send cookies (`credentials: "include"`).
- **Role/permission helpers**: [client/src/lib/authz.ts](../client/src/lib/authz.ts) for frontend role logic. Backend uses `userType` and `role` fields.

## Auth & Authorization
- **Session-based**: Auth uses `express-session` (cookie, not JWT). User ID is stored in `req.session.userId`.
- **Guards**: Use `requireAuth`, `requireStaff`, `requireBeneficiary`, `requireRole([...])` in [server/routes.ts](../server/routes.ts).
- **Frontend**: Check `user.userType` and `user.role` for UI logic. Use helpers in [client/src/lib/authz.ts](../client/src/lib/authz.ts).

## Validation & Error Handling
- **Validation**: Use Zod schemas from [shared/schema.ts](../shared/schema.ts). Compose with `omit/extend` for server-owned fields.
- **Error shape**: API errors are `{ error: string }` or `{ message: string }`. Use `getErrorMessage()` ([client/src/lib/errors.ts](../client/src/lib/errors.ts)) on the client.

## File Uploads
- **Raw uploads**: `/api/uploads` expects the raw file body (not multipart). Use `fetchUpload()` ([client/src/lib/api.ts](../client/src/lib/api.ts)).
- **Headers**: Set `Content-Type` and `x-file-name`. Files are stored in `uploads/` and served at `/uploads/<storageKey>`.

## Developer Workflows
- **Dev server**: `npm run dev` (starts Express, mounts Vite for HMR).
- **Build**: `npm run build` (builds client and bundles server with esbuild).
- **Start (prod)**: `npm run start` (runs built server from `dist/index.cjs`).
- **Typecheck**: `npm run check` (TypeScript typecheck for all code).
- **DB migration**: `npm run db:push` (see [drizzle.config.ts](../drizzle.config.ts)).
- **DB shell**: `npm run db:psql` (psql with paging off).
- **Scripts**: Utility/migration scripts in [scripts/](../scripts) (see `package.json` for commands).

## Runtime & Environment
- **Production**: Requires `SESSION_SECRET` and `REDIS_URL`/`REDIS_PUBLIC_URL`.
- **Feature flags**: Env-driven, exposed at `/api/config/features`.

## Path Aliases
- `@` → `client/src`
- `@shared` → `shared`

## Notable Conventions
- **All API endpoints** are in a single file ([server/routes.ts](../server/routes.ts)).
- **Validation** is always with Zod, using shared schemas.
- **No JWTs**: All auth is session/cookie-based.
- **Uploads**: Only raw file uploads, not multipart.
- **Role-based UI**: Use helpers for all role checks, not direct string comparisons.

---
For new features, follow the patterns in the referenced files. For cross-cutting changes, update both client and server as needed, and prefer using shared types/schemas. If you are unsure about a workflow or convention, check the referenced files or ask for clarification.