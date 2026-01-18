
# Copilot Instructions for Legal-AidFlow

## Architecture Overview
- **Monorepo**: Contains a Vite + React SPA ([client/src](../client/src)) and an Express API server ([server](../server)), sharing types and Zod schemas in [shared/schema.ts](../shared/schema.ts).
- **Single-port deployment**: Both API (`/api/*`) and SPA are served from the same port (default: 5000). In dev, Vite middleware is mounted; in prod, static files are served from `dist/public`.
  - **⚠️ macOS Note**: Port 5000 conflicts with ControlCenter.app. Use `PORT=5002` (or another port) in your `.env` for local development.
- **Database**: PostgreSQL with Drizzle ORM. All schema and validation live in [shared/schema.ts](../shared/schema.ts). All DB access is via [server/storage.ts](../server/storage.ts).

## ⚠️ CRITICAL: Backward Compatibility & Safety Rules

**Goal**: Develop Lawyer Portal (and all future features) with ZERO impact on existing functionality.

### NON-NEGOTIABLES (Absolute Prohibitions)
- ❌ **NO modifications** to existing tables, columns, APIs, permissions, routes, or business rules
- ❌ **NO renaming/removal** of any existing database fields, endpoints, or UI components
- ❌ **NO behavior changes** to staff/admin/beneficiary portals (UI and logic must remain identical)
- ❌ **NO changes** to existing RBAC/permission semantics or enforcement logic
- ❌ **NO edits** to old migration files (never ALTER existing migrations)
- ❌ **NO breaking changes** to current workflows, validations, or status transitions
- ❌ **NO schema changes** to existing tables (no ALTER TABLE, no new columns, no new indexes unless explicitly approved)

### ALLOWED (Additive-Only Patterns)
- ✅ **New tables/entities**: Prefixed with `lawyer_` or `portal_lawyer_`, referencing existing data via foreign keys
- ✅ **New API endpoints**: Under dedicated namespace `/api/lawyer/*` (MUST NOT impact existing endpoints)
- ✅ **New UI routes**: Under `/lawyer/*` prefix (MUST NOT modify existing nav for staff/admin)
- ✅ **New migrations**: Additive-only migrations in [migrations/](../migrations) (CREATE TABLE, not ALTER TABLE)
- ✅ **New components**: Isolated to lawyer portal, no changes to shared components unless purely additive
- ✅ **New i18n keys**: Add to [client/src/locales/](../client/src/locales/) with AR/EN parity

### REQUIRED SAFETY PROCESS
**Before ANY implementation, follow this process:**

1. **Compatibility Audit** (mandatory first step):
   - List every file/area you will touch
   - Document WHY each change cannot affect existing portals
   - Identify any shared code paths and propose isolation strategy
   - Get explicit approval before proceeding

2. **Incremental Implementation** (after each small change):
   ```bash
   # Typecheck
   npm run check
   
   # Smoke tests (verify no regressions)
   npm run smoke:stage1  # cases
   npm run smoke:stage2  # docs
   npm run smoke:stage3  # service requests
   npm run smoke:stage4  # tasks
   npm run smoke:stage6  # sessions
   
   # Manual verification
   # - Test staff/admin portal routes
   # - Test beneficiary portal routes
   # - Verify no UI changes to existing pages
   ```

3. **Risk Detection** (continuous):
   - If you detect ANY risk of touching existing behavior → **STOP**
   - Propose alternative additive design
   - Never proceed with risky changes

### DELIVERABLES (Per Feature/Phase)
- [ ] Lawyer Portal IA (pages/routes) + role gating documented
- [ ] Additive backend endpoints under `/api/lawyer/*` (if needed)
- [ ] Additive DB migrations for optional features only
- [ ] i18n keys with AR/EN parity for all user-visible text
- [ ] All smoke tests passing (no regressions)
- [ ] One atomic commit per phase with clear message
- [ ] Working tree clean (no uncommitted changes)

**Example Violation** ❌: Adding `assignedLawyerId` column to existing `cases` table  
**Correct Approach** ✅: Use existing `cases.assignedLawyerId` (already present in schema)

This ensures the lawyer portal and all future enhancements maintain 100% backward compatibility with existing staff/admin/beneficiary functionality.

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
- **Case workflow**: Role-based status management ([server/lib/caseWorkflow.ts](../server/lib/caseWorkflow.ts)) - admins handle admin statuses (pending_review, assigned, etc.), lawyers handle operating statuses (in_progress, awaiting_documents, etc.).

## Validation & Error Handling
- **Validation**: Use Zod schemas from [shared/schema.ts](../shared/schema.ts). Compose with `omit/extend` for server-owned fields.
- **Error shape**: API errors are `{ error: string }` or `{ message: string }`. Use `getErrorMessage()` ([client/src/lib/errors.ts](../client/src/lib/errors.ts)) on the client.

## File Uploads
- **Raw uploads**: `/api/uploads` expects the raw file body (not multipart). Use `fetchUpload()` ([client/src/lib/api.ts](../client/src/lib/api.ts)).
- **Headers**: Set `Content-Type` and `x-file-name` (encodeURIComponent for non-ASCII names). Files are stored in `uploads/` and served at `/uploads/<storageKey>`.

## Internationalization (i18n)
- **i18next**: Configured in [client/src/i18n.ts](../client/src/i18n.ts) with English (en) and Arabic (ar) locales.
- **RTL support**: Automatically sets `dir="rtl"` for Arabic. Translation files in [client/src/locales/](../client/src/locales/).
- **Usage**: `const { t } = useTranslation();` in React components.

## Data Fetching
- **React Query**: Use `useQuery` and `useMutation` from `@tanstack/react-query` for all data fetching.
- **No onError**: Do NOT use `onError` in useQuery options (deprecated). Handle errors via `error` return value.
- **Query keys**: Follow pattern `['entity', id?, params?]` for cache consistency.

## Developer Workflows
- **Dev server**: `npm run dev` (starts Express, mounts Vite for HMR).
- **Build**: `npm run build` (builds client and bundles server with esbuild).
- **Start (prod)**: `npm run start` (runs built server from `dist/index.cjs`).
- **Typecheck**: `npm run check` (TypeScript typecheck for all code).
- **DB migration**: `npm run db:push` (see [drizzle.config.ts](../drizzle.config.ts)).
- **DB shell**: `npm run db:psql` (psql with `PAGER=cat` to disable pagination).
- **Smoke tests**: `npm run smoke:stage1`, `smoke:stage2`, etc. in [scripts/](../scripts) (API integration tests using staged authentication flows).

## Runtime & Environment
- **Production**: Requires `SESSION_SECRET` and `REDIS_URL`/`REDIS_PUBLIC_URL`.
- **Development**: Optional `.env` with `PORT=5002` (avoid macOS port 5000 conflict).
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
- **Migrations**: Data migrations in [scripts/](../scripts), schema migrations via Drizzle in [migrations/](../migrations).

---
For new features, follow the patterns in the referenced files. For cross-cutting changes, update both client and server as needed, and prefer using shared types/schemas. If you are unsure about a workflow or convention, check the referenced files or ask for clarification.