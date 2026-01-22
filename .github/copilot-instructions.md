

Copilot Instructions — Legal-AidFlow

Architecture (READ FIRST — critical)
	•	Single-port app: Express serves /api/* and the SPA on the same port.
	•	Entry: server/index.ts
	•	Dev uses Vite middleware: server/vite.ts
	•	Production serves static SPA via: server/static.ts
	•	SPA fallback rules:
	•	SPA fallback explicitly skips /api and /uploads
	•	Missing API routes must return 404 JSON, not HTML
	•	If the client receives HTML instead of JSON → you are hitting the SPA shell or running client-only
	•	Client → API:
	•	Cookie-based sessions
	•	client/src/lib/api.ts
	•	API_BASE = "/api"
	•	credentials: "include"
	•	Persistence:
	•	Drizzle + Postgres
	•	Schemas & Zod validators: shared/schema.ts
	•	DB access ONLY via server/storage.ts

⸻

Local Workflows
	•	Full dev (API + SPA)

npm run dev


	•	Typecheck

npm run check


	•	Build & serve (prod-like)

npm run build
npm run start


	•	Database
	•	Push schema: npm run db:push
	•	PSQL (pager disabled): npm run db:psql
	•	Smoke tests:
	•	npm run smoke:stage1 … npm run smoke:stage6
	•	npm run smoke:sessions
	•	macOS note
	•	Port 5000 may be occupied by ControlCenter
	•	Set API port explicitly:

PORT=5002


	•	Vite proxies /api → http://localhost:5002

⸻

Authentication & Sessions
	•	Auth is session/cookie based (express-session), NOT JWT
	•	Identity source: req.session.userId
	•	Production expects Redis-backed sessions:
	•	REDIS_URL must be set
	•	Dev may fall back to in-memory sessions
	•	Optional CORS mode:
	•	When CORS_ORIGINS is set:
	•	Cookies require SameSite=None
	•	Cookies require Secure
	•	See server/index.ts

⸻

Route Namespaces
	•	Staff UI: normal SPA routes
	•	e.g. /dashboard, /cases
	•	Beneficiary portal:
	•	UI: /portal/*
	•	API: /api/portal/*
	•	Lawyer portal:
	•	UI: /lawyer/*
	•	API: /api/lawyer/*

⸻

Validation & API Contracts
	•	All routes validate req.body using Zod schemas
	•	Located in shared/schema.ts
	•	Client error handling expects:

{ "error": "message" }

or

{ "message": "message" }


	•	Never bypass schema validation

⸻

Uploads
	•	Upload endpoint:

POST /api/uploads


	•	Sends raw file bytes
	•	Header:

x-file-name: <URL-encoded filename>


	•	Files served from:

/uploads/<storageKey>



⸻

Feature Flags
	•	Client-visible feature flags:

GET /api/config/features


	•	Defined in server/routes.ts

⸻

Forms & Validation (CRITICAL UX RULES)
	•	If a field is required in Zod, it MUST:
	•	Exist as a visible form input OR
	•	Be deterministically injected in the submit handler
	•	Never require a field the user cannot fill
	•	Multi-step forms:
	•	Required fields MUST be included in stepFields for their step
	•	Call form.trigger() when moving between steps
	•	Submit buttons:
	•	Disabled state must depend ONLY on:
	•	formState.isValid
	•	mutation loading state
	•	Never silently fail validation

⸻

Dialogs & Long Content (MANDATORY)
	•	Any view / edit / report screen with long content MUST:
	•	Open inside a Dialog
	•	Dialog layout requirements:
	•	max-h-[80vh]
	•	overflow-y-auto
	•	Never render long forms or reports inline inside tables or cards

⸻

Calendar & Dates (FullCalendar)
	•	Calendar source of truth: /api/calendar
	•	Server:
	•	Always send datetimes in UTC
	•	ISO 8601 format
	•	Client:
	•	Convert to local timezone
	•	Default: Asia/Riyadh
	•	FullCalendar configuration:

locale: "ar",
direction: "rtl"


	•	Event color mapping:
	•	Tasks → Blue
	•	Sessions → Green
	•	Cases → Amber

⸻

Local Dev Stability (IMPORTANT)
	•	❌ Do NOT run vite dev alone unless explicitly asked
	•	✅ Always use:

npm run dev


	•	If a port is busy:

lsof -i :PORT
kill <PID>


	•	Never pass --port twice to Vite
	•	Avoid running multiple servers simultaneously

⸻

Guardrails (DO NOT BREAK)
	•	❌ Do NOT modify:
	•	Vite proxy / root / build outDir
	•	vite.config.ts (/api must proxy to API port)
	•	❌ Do NOT change:
	•	API base (/api)
	•	Cookie behavior
	•	❌ Do NOT rename or move auth routes:
	•	/api/auth/login
	•	/api/auth/me
	•	/api/auth/logout
	•	❌ DB rules:
	•	Migrations are ADD-ONLY
	•	Never delete columns or enum values
	•	Never edit existing migration files
	•	i18n:
	•	Translations only in:
	•	client/src/locales/en.json
	•	client/src/locales/ar.json
	•	RTL handled in client/src/i18n.ts
	•	Do NOT add new translation keys unless asked

⸻

Output & Change Discipline
	•	Modify ONE critical file only per change
	•	After every change:

npm run check


	•	When fixing bugs:
	1.	Explain root cause in 1–2 lines
	2.	Apply minimal fix
	3.	Output diff only
	•	Never refactor unrelated code while fixing a bug
