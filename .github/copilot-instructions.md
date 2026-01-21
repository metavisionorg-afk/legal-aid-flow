
# Copilot instructions — Legal-AidFlow

## Big picture
- Single-port app: Express serves `/api/*` + the SPA on the same port (dev: Vite middleware). See [server/index.ts](server/index.ts) and [server/vite.ts](server/vite.ts).
- Client calls the API via `fetch` with cookies enabled; base path is `/api`. See [client/src/lib/api.ts](client/src/lib/api.ts).
- Persistence: Drizzle + Postgres; all DB types/schemas live in [shared/schema.ts](shared/schema.ts) and are imported by [server/storage.ts](server/storage.ts).

## Dev workflows
- Dev (API + SPA): `npm run dev`
- Typecheck: `npm run check`
- Build/Prod: `npm run build` then `npm run start`
- DB: `npm run db:push`, `npm run db:psql` (pager disabled), smoke scripts: `npm run smoke:stage1`…`npm run smoke:stage6`, `npm run smoke:sessions`
- macOS: port `5000` may be taken by ControlCenter → set `PORT=5002` in `.env` (README covers this)

## Project conventions (do this, not the "typical" way)
- Auth is session/cookie (`express-session`), not JWT; the canonical identity is `req.session.userId` (see [server/index.ts](server/index.ts) and [server/routes.ts](server/routes.ts)).
- Optional cross-origin mode: when `CORS_ORIGINS` is set, cookies require `SameSite=None` + `Secure` (see [server/index.ts](server/index.ts)).
- Uploads: `POST /api/uploads` sends raw file bytes; files are served at `/uploads/<storageKey>` (see [client/src/lib/api.ts](client/src/lib/api.ts) and [server/index.ts](server/index.ts)).
- Portals/routing: Staff routes under normal SPA paths; beneficiary portal under `/portal/*`; lawyer portal under `/lawyer/*` and server endpoints under `/api/lawyer/*` (see [server/routes.ts](server/routes.ts)).
- Feature flags exposed to the client via `/api/config/features` (see [server/routes.ts](server/routes.ts)).

## Guardrails (critical files)
- Do not change Vite proxy/root/build outDir unless explicitly asked: [vite.config.ts](vite.config.ts) must proxy `/api` → `http://localhost:5002`.
- Do not change API base or cookie behavior unless explicitly asked: [client/src/lib/api.ts](client/src/lib/api.ts) must keep `API_BASE = "/api"` and `credentials: "include"`.
- Do not rename/move auth routes: `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` live in [server/routes.ts](server/routes.ts).
- DB changes are add-only: never delete columns/enum values; never edit existing files in `migrations/`. Schema source of truth is [shared/schema.ts](shared/schema.ts).
- i18n: translations are in [client/src/locales/en.json](client/src/locales/en.json) + [client/src/locales/ar.json](client/src/locales/ar.json); RTL is handled in [client/src/i18n.ts](client/src/i18n.ts). Avoid duplicate namespaces; don’t add new keys unless asked.

## Fail-fast checks (when /api breaks)
- If the client receives HTML instead of JSON, you’re likely hitting the SPA shell: ensure the Express dev server is running (`npm run dev`) and that Vite proxies `/api` correctly.

## Change discipline
- Never modify more than ONE “critical file” in a single change.
- Always run `npm run check` after edits.