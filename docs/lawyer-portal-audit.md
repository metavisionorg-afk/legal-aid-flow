# Lawyer Portal - Compatibility Audit & Mapping
**Phase 1: Pre-Implementation Analysis**  
**Date**: January 17, 2026  
**Status**: ✅ SAFE - All features use existing infrastructure

---

## (أ) نقطة التحقق من دور المحامي - RBAC Verification Point

### Current RBAC Implementation (EXISTING - NO CHANGES)
```typescript
// Location: server/routes.ts:168-177
async function requireLawyer(req: AuthRequest, res: any, next: any) {
  await requireStaff(req, res, () => {});
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  if (req.user.role !== "lawyer") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}
```

### Lawyer Identification (EXISTING FIELDS)
- **Table**: `users` (NO CHANGES)
- **Fields Used**:
  - `userType = "staff"` (existing)
  - `role = "lawyer"` (existing enum value in `roleEnum`)
  - `isActive = true` (existing, for filtering active lawyers)

### Helper Functions (EXISTING)
- **Backend**: `canLawyerAccessCase(user, caseData)` - checks if `user.role === "lawyer"` and `caseData.assignedLawyerId === user.id`
- **Frontend**: `client/src/lib/authz.ts` → `isLawyer(user)` helper already exists

**✅ RISK ASSESSMENT**: ZERO risk - using existing RBAC, no new permissions needed.

---

## (ب) الـ Endpoints المستخدمة - Existing API Endpoints

### 1. Lawyer-Specific Endpoints (ALREADY IMPLEMENTED)
All endpoints under `/api/lawyer/*` namespace are already implemented and isolated:

| Endpoint | Purpose | Storage Method | Notes |
|----------|---------|----------------|-------|
| `GET /api/lawyer/me/dashboard` | Dashboard stats | `getCasesByLawyer(lawyerId)` | ✅ Existing |
| `GET /api/lawyer/cases` | List assigned cases | `getCasesByLawyer(lawyerId)` | ✅ Existing |
| `GET /api/lawyer/cases/:id` | Case detail | `getCase(id)` + access check | ✅ Existing |
| `PATCH /api/lawyer/cases/:id/status` | Update case status | `updateCase(id, updates)` | ✅ Existing |
| `GET /api/lawyer/cases/:id/timeline` | Case timeline | `getCaseTimelineEventsByCase(caseId)` | ✅ Existing |
| `GET /api/lawyer/cases/:id/documents` | Case documents | `getDocumentsByCase(caseId)` | ✅ Existing |
| `POST /api/lawyer/cases/:id/documents` | Upload documents | `createDocumentsForCase(...)` | ✅ Existing |
| `GET /api/lawyer/beneficiaries` | List beneficiaries | Derived from assigned cases | ✅ Existing |
| `GET /api/lawyer/consultations` | List consultations | `getConsultationsByLawyer(lawyerId)` | ✅ Existing |
| `PATCH /api/lawyer/me` | Update profile | `updateUser(id, data)` | ✅ Existing |
| `GET /api/lawyer/reports/monthly` | Monthly report | `getCasesByLawyer(lawyerId)` + aggregation | ✅ Existing |

### 2. Shared Endpoints (Used by Multiple Roles)
These endpoints check role and return filtered data:

| Endpoint | Lawyer Access | Filter Logic |
|----------|---------------|--------------|
| `GET /api/cases` | ✅ Returns assigned cases only | `if (user.role === "lawyer") getCasesByLawyer(user.id)` |
| `GET /api/sessions` | ✅ Via case access | Access via assigned cases |
| `GET /api/tasks` | ✅ Returns assigned tasks | `listTasksForLawyer(userId)` |

**✅ RISK ASSESSMENT**: ZERO risk - all endpoints are additive under `/api/lawyer/*` namespace, no modifications to existing endpoints.

---

## (ج) Data Mapping - Database to Lawyer Portal Needs

### Existing Database Structure (NO CHANGES)

#### 1. Cases (`cases` table)
```typescript
// Existing fields used by lawyer portal:
- id                    // Primary key
- caseNumber            // Display ID
- title                 // Case title
- beneficiaryId         // FK to beneficiaries
- assignedLawyerId      // ✅ EXISTING FK to users (lawyers)
- status                // Case workflow status
- priority              // low/medium/high/urgent
- description           // Case details
- opponentName          // Opponent info
- createdAt, updatedAt  // Timestamps
```

**Filter Logic**: `WHERE assignedLawyerId = :lawyerId` (EXISTING INDEX)

#### 2. Sessions (`sessions` table)
```typescript
// Existing fields:
- id
- caseId                // ✅ FK to cases (access via assigned cases)
- title
- gregorianDate
- hijriDate
- courtName, city, circuit
- sessionType, status
- requirements, notes
```

**Access Logic**: Lawyer can access sessions for their assigned cases via `cases.assignedLawyerId`

#### 3. Documents (`documents` table)
```typescript
// Existing fields:
- id
- caseId                // ✅ FK to cases
- uploadedBy
- title, fileName
- fileUrl, storageKey
- isPublic              // Visibility flag
- category, tags
```

**Access Logic**: Lawyer can access all documents (isPublic=true/false) for their assigned cases

#### 4. Tasks (`tasks` table)
```typescript
// Existing fields:
- id
- title, description
- taskType, status
- beneficiaryId
- lawyerId              // ✅ EXISTING field (can be null)
- assignedTo
- caseId                // ✅ FK to cases
- dueDate, priority
```

**Filter Logic**: `WHERE lawyerId = :lawyerId OR assignedTo = :lawyerId`

#### 5. Case Timeline (`case_timeline_events` table)
```typescript
// Existing fields:
- id
- caseId                // ✅ FK to cases
- eventType             // created, status_changed, etc.
- fromStatus, toStatus
- note
- actorUserId
- createdAt
```

**Access Logic**: Read-only access via assigned cases

---

## Portal Feature Mapping

### My Cases (Dashboard)
- **Data Source**: `cases` table WHERE `assignedLawyerId = current_user.id`
- **API**: `GET /api/lawyer/cases` (✅ existing)
- **Aggregations**: Counts by status (in-memory, no DB changes)

### Case Detail Page
- **Data Sources**:
  1. Case info: `cases` table (✅ existing)
  2. Beneficiary: `beneficiaries` table via `beneficiaryId` (✅ existing FK)
  3. Timeline: `case_timeline_events` (✅ existing)
  4. Documents: `documents` WHERE `caseId` (✅ existing)
  5. Sessions: `sessions` WHERE `caseId` (✅ existing)
  6. Tasks: `tasks` WHERE `caseId` or `lawyerId` (✅ existing)
- **APIs**: All existing under `/api/lawyer/cases/:id/*`

### Sessions View
- **Data Source**: `sessions` table filtered by assigned cases
- **API**: Use existing `GET /api/sessions?caseId=:id` or fetch via case list (✅ existing)

### Documents View
- **Data Source**: `documents` table filtered by assigned cases
- **API**: `GET /api/lawyer/cases/:id/documents` (✅ existing)

### Tasks View
- **Data Source**: `tasks` table WHERE `lawyerId = :id`
- **API**: `GET /api/tasks` with lawyer filter (✅ existing logic in storage.ts:1606)

---

## Client-Side Routes (NEW - ADDITIVE ONLY)

### Proposed UI Routes (Under `/lawyer/*` prefix)
```
/lawyer/dashboard          → LawyerDashboard component
/lawyer/cases              → LawyerCases component (list)
/lawyer/cases/:id          → Reuse existing Cases component with lawyer context
/lawyer/beneficiaries      → LawyerBeneficiaries (derived from cases)
/lawyer/consultations      → LawyerConsultations component
/lawyer/tasks              → LawyerTasks component
/lawyer/calendar           → LawyerCalendar (sessions + tasks)
/lawyer/reports            → LawyerReports component
```

**✅ RISK ASSESSMENT**: ZERO risk - all routes under `/lawyer/*` prefix, no modifications to existing `/dashboard`, `/cases`, etc.

---

## Storage Methods Inventory (EXISTING)

All required database operations already exist in `server/storage.ts`:

| Method | Line | Purpose |
|--------|------|---------|
| `getLawyerUsers()` | 483 | Get all active lawyers |
| `getCasesByLawyer(lawyerId)` | 921 | Get cases assigned to lawyer |
| `getConsultationsByLawyer(lawyerId)` | 1081 | Get lawyer's consultations |
| `listTasksForLawyer(userId)` | 1606 | Get tasks for lawyer |
| `getSessionsByCase(caseId)` | 4945 | Get case sessions |
| `getDocumentsByCase(caseId)` | 724 | Get case documents |
| `getCaseTimelineEventsByCase(caseId)` | 1028 | Get case timeline |

**✅ NO NEW STORAGE METHODS NEEDED** - all data access patterns already implemented.

---

## Risk Analysis & Mitigation

### ✅ Zero-Risk Areas
1. **RBAC**: Using existing `role = "lawyer"` enum value
2. **Database**: No schema changes needed (assignedLawyerId already exists)
3. **APIs**: All endpoints under isolated `/api/lawyer/*` namespace
4. **Storage**: All required methods already implemented
5. **Auth Flow**: Reuses existing session-based auth

### ⚠️ Potential Risks & Mitigation

| Risk | Mitigation Strategy | Status |
|------|---------------------|--------|
| Accidentally modifying shared components | Use dedicated `LawyerPortalLayout` component | ✅ Already implemented |
| Breaking existing staff routes | All lawyer routes under `/lawyer/*` prefix | ✅ Safe |
| Modifying case workflow logic | Use read-only access or existing update endpoints | ✅ Safe |
| UI state conflicts | Separate query keys for lawyer portal (`['lawyer', ...]`) | ⚠️ Implement |

### Required UI Components (NEW - ISOLATED)
```
client/src/components/layout/LawyerPortalLayout.tsx  ✅ Already exists
client/src/pages/lawyer/LawyerDashboard.tsx           ✅ Already exists
client/src/pages/lawyer/LawyerCases.tsx               ✅ Already exists
```

---

## Implementation Checklist (Phase 2+)

### Before Implementation
- [ ] Review this audit with team
- [ ] Confirm no schema changes needed
- [ ] Verify all endpoints are working (`npm run check`)
- [ ] Run smoke tests baseline (`npm run smoke:stage1-6`)

### During Implementation
- [ ] Use only `/lawyer/*` UI routes
- [ ] Use only `/api/lawyer/*` backend routes (already exist)
- [ ] Add i18n keys with AR/EN parity
- [ ] Test incrementally after each component
- [ ] Run `npm run check` after each change

### After Implementation
- [ ] Run all smoke tests (no regressions)
- [ ] Manual test: staff/admin portal (unchanged)
- [ ] Manual test: beneficiary portal (unchanged)
- [ ] Manual test: lawyer portal (new features working)
- [ ] Commit with message: "feat: lawyer portal UI (additive, zero breaking changes)"

---

## Summary

**✅ SAFE TO PROCEED** - Lawyer Portal can be implemented using 100% existing infrastructure:
- Existing RBAC (`role = "lawyer"`)
- Existing database fields (`assignedLawyerId`)
- Existing API endpoints (`/api/lawyer/*`)
- Existing storage methods

**NO DATABASE MIGRATIONS NEEDED**  
**NO BREAKING CHANGES**  
**ZERO RISK TO EXISTING FUNCTIONALITY**

Next Phase: Implement UI components under `/lawyer/*` routes using existing APIs.
