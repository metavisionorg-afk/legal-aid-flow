
# Copilot instructions — Legal-AidFlow

## Architecture (read these first)
- Single-port app: Express serves `/api/*` plus the SPA on the same port. Entry is [server/index.ts](server/index.ts); dev uses Vite middleware [server/vite.ts](server/vite.ts); prod serves [server/static.ts](server/static.ts).
- SPA fallback explicitly skips `/api` and `/uploads`; missing API routes should 404 (not return HTML). If the client gets HTML, you’re likely hitting the SPA shell or running only the client.
- Client → API uses cookie sessions: [client/src/lib/api.ts](client/src/lib/api.ts) uses `API_BASE = "/api"` and `credentials: "include"`.
- Persistence: Drizzle + Postgres. Schemas + Zod insert validators live in [shared/schema.ts](shared/schema.ts); DB access goes through [server/storage.ts](server/storage.ts).

## Local workflows
- Dev (API + SPA): `npm run dev`
- Typecheck: `npm run check`
- Build/serve: `npm run build` then `npm run start`
- DB: `npm run db:push`, `npm run db:psql` (pager disabled), smoke scripts: `npm run smoke:stage1`…`npm run smoke:stage6`, `npm run smoke:sessions`
- macOS: port `5000` may be taken by ControlCenter → set `PORT=5002` in `.env` (Vite proxies `/api` → `http://localhost:5002`).

## Project-specific patterns
- Auth is session/cookie (`express-session`), not JWT; identity is `req.session.userId`. Production expects Redis-backed sessions (`REDIS_URL`); dev may fall back to in-memory sessions.
- Optional cross-origin mode: when `CORS_ORIGINS` is set, cookies require `SameSite=None` + `Secure` (see [server/index.ts](server/index.ts)).
- Route namespaces:
	- Staff UI: normal SPA routes (e.g. `/dashboard`, `/cases`)
	- Beneficiary portal UI: `/portal/*` and API: `/api/portal/*`
	- Lawyer portal UI: `/lawyer/*` and API: `/api/lawyer/*`
- Validation: routes parse `req.body` with Zod schemas from [shared/schema.ts](shared/schema.ts) (e.g. `insert*Schema`). Client error handling expects `{ error }` / `{ message }` bodies.
- Uploads: `POST /api/uploads` sends raw file bytes with `x-file-name` (URL-encoded); files are served at `/uploads/<storageKey>`.
- Feature flags exposed to the client via `GET /api/config/features` (see [server/routes.ts](server/routes.ts)).

## Guardrails (critical files)
- Do not change Vite proxy/root/build outDir unless explicitly asked: [vite.config.ts](vite.config.ts) proxies `/api` → `http://localhost:5002` and builds to `dist/public`.
- Do not change API base or cookie behavior unless explicitly asked: [client/src/lib/api.ts](client/src/lib/api.ts) must keep `API_BASE = "/api"` and `credentials: "include"`.
- Do not rename/move auth routes: `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` live in [server/routes.ts](server/routes.ts).
- DB/migrations are add-only: never delete columns/enum values; never edit existing files in `migrations/`. Change [shared/schema.ts](shared/schema.ts) and add a new migration instead.
- i18n: translations are in [client/src/locales/en.json](client/src/locales/en.json) + [client/src/locales/ar.json](client/src/locales/ar.json); RTL is handled in [client/src/i18n.ts](client/src/i18n.ts). Don’t add new translation keys unless asked.

## Change discipline
- Never modify more than ONE “critical file” in a single change.
- Always run `npm run check` after edits.