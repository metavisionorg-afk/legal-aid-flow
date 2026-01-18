# Phase 6.1: Zoom Integration (DB-stored Config)

## Overview
Implemented **secure database-stored Zoom configuration** with encrypted secrets, replacing environment variable approach. This allows admins to configure Zoom credentials via UI without requiring server restarts or .env file edits.

## Implementation Summary

### ✅ Backend Changes (Additive Only)

1. **Database Migration** (`migrations/0008_add_zoom_config.sql`):
   - Added `integrations_zoom_config` table (singleton pattern)
   - Stores encrypted Zoom Server-to-Server OAuth credentials
   - Columns: `account_id`, `client_id`, `client_secret_enc`, `enabled`
   - **NO changes to existing tables** (fully additive)

2. **Encryption Library** (`server/lib/crypto.ts`):
   - AES-256-GCM encryption for secrets
   - Requires `INTEGRATIONS_ENC_KEY` env var (32-byte base64/hex or passphrase)
   - Functions: `encrypt()`, `decrypt()`, `isEncryptionAvailable()`

3. **Storage Layer** (`server/storage.ts`):
   - `getZoomConfig()`: Fetch singleton config
   - `upsertZoomConfig()`: Create/update config with encrypted secret
   - Added to `IStorage` interface

4. **API Endpoints** (`server/routes.ts`):
   - `GET /api/admin/integrations/zoom`: Fetch config (never returns decrypted secret)
   - `POST /api/admin/integrations/zoom`: Upsert config with secret encryption
   - `POST /api/admin/integrations/zoom/test`: Validate credentials
   - `POST /api/sessions/:id/zoom/create`: Generate Zoom link (reads from DB)
   - **Role-gated**: `requireStaff`, `requireRole(["admin", "super_admin"])`

5. **Zoom Integration Update** (`server/lib/zoomIntegration.ts`):
   - Exported `getAccessToken(config?)` to accept explicit credentials
   - Supports both DB config and environment variable fallback

6. **Schema Updates** (`shared/schema.ts`):
   - Added `integrationsZoomConfig` table schema
   - Export types: `InsertIntegrationsZoomConfig`, `IntegrationsZoomConfig`

### ✅ Developer Experience

7. **Paste-Safe Scripts**:
   - `npm run zoom:env`: Check Zoom env vars without manual inspection
   - `npm run i18n:json`: Validate locale JSON files
   - Created `scripts/check-zoom-env.mjs` (Node-based, no heredocs)
   - Added `docs/dev-env-troubleshooting.md` with safe terminal practices

### ✅ Internationalization

8. **i18n Keys** (AR/EN parity):
   - `integrations.zoom.*`: Configuration UI labels
   - `sessions.generate_zoom_link`, `sessions.meeting_created`
   - `errors.zoom_*`: User-friendly error messages

## Security Features

- ✅ **Encrypted at Rest**: Client secrets encrypted with AES-256-GCM
- ✅ **Never Exposed**: API never returns decrypted secrets
- ✅ **Admin-Only Access**: All config endpoints require admin/super_admin role
- ✅ **Audit Logging**: All config changes logged to `audit_log` table
- ✅ **Validation**: Test endpoint verifies credentials before storing

## Usage

### Admin Setup (via API)
```bash
# 1. Set encryption key (one-time, server restart required)
echo "INTEGRATIONS_ENC_KEY=$(openssl rand -base64 32)" >> .env

# 2. Configure Zoom via API (UI coming in next phase)
curl -X POST http://localhost:5002/api/admin/integrations/zoom \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "YOUR_ACCOUNT_ID",
    "clientId": "YOUR_CLIENT_ID",
    "clientSecret": "YOUR_CLIENT_SECRET",
    "enabled": true
  }'
```

### Staff Usage
```bash
# Generate Zoom link for session
POST /api/sessions/{sessionId}/zoom/create

# Response
{
  "success": true,
  "joinUrl": "https://zoom.us/j/1234567890",
  "meetingId": "1234567890"
}
```

## Migration Path

1. **Current**: Environment variables (`ZOOM_ACCOUNT_ID`, etc.) still work
2. **Future**: Admin UI will migrate env-based config to DB on first save
3. **Fallback**: If DB config doesn't exist, falls back to env vars

## Files Changed

### Backend (Additive)
- `migrations/0008_add_zoom_config.sql` (NEW)
- `server/lib/crypto.ts` (NEW)
- `server/lib/zoomIntegration.ts` (MODIFIED - exported getAccessToken)
- `server/storage.ts` (ADDED methods)
- `server/routes.ts` (ADDED endpoints)
- `shared/schema.ts` (ADDED table)

### Developer Tools
- `scripts/check-zoom-env.mjs` (NEW)
- `docs/dev-env-troubleshooting.md` (NEW)
- `package.json` (ADDED scripts)

### i18n
- `client/src/locales/en.json` (ADDED keys)
- `client/src/locales/ar.json` (ADDED keys)

## Next Steps (Phase 6.2)
- [ ] Admin UI for Zoom configuration (`/settings` page)
- [ ] Session detail page "Generate Zoom Link" button
- [ ] Beneficiary portal "Join Meeting" button (when link exists)
- [ ] Lawyer portal session list with Zoom indicators

## Testing

```bash
# Validate i18n JSON
npm run i18n:json

# Check Zoom env vars
npm run zoom:env

# TypeScript check
npm run check

# Database migration
npm run db:push
```

## Backward Compatibility

✅ **Zero breaking changes**:
- Existing sessions table unchanged (uses existing `meetingUrl` field)
- Environment variable config still works
- No changes to existing API contracts
- All changes are additive to schema and routes
