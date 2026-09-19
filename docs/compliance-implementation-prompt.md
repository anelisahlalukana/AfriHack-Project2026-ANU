# Reviewed compliance implementation prompt

This is a proposed prompt for the implementation stage. Saving this document does not start that stage. Read `compliance-project-review.md` first; it records the existing code, source conflicts, and verification limits.

## Scope and sequence

Build the Royal Square compliance module only when the user moves from review to implementation. Work in this repository on `feature/compliance`; preserve unrelated changes, do not edit main, do not push. Commit the completed implementation and report anything unverified.

Read `docs/coding-standards.md`, `docs/schema.md`, `docs/setup.md`, `docs/system_requirments.md`, the review, and the existing integration files before editing. Use routes -> controllers -> services, CommonJS on the server, `{ error: "message" }` errors, validation middleware, plain existing CSS, lucide-react, the shared Axios instance, and cancellation-aware effects. No new libraries or replacement architecture.

Proceed in order: confirm schema contracts and baseline tests; add migration and pure rules/tests; implement services and authorization; connect the small document/reminder hooks; implement the API and UI; verify and commit. Do not apply the new migration to a shared database as part of a code-only build. Document its prerequisites and execution separately.

The deliverable tracks selected compliance controls for a hackathon. Mock screening and manually recorded qualifications/CPD are not independent regulatory verification. Keep that scope visible near the status display. Retain annual consent renewal and an 18-hour target as documented demo policies pending business confirmation; do not claim they are universal legal requirements. Consent withdrawal and full firm-level regulatory controls are gaps outside this initial scope.

## Preserve existing contracts

- Client IDs reference `public.users.id`, filtered by `CLIENT_ROLE_ID`. Adviser and actor IDs reference `auth.users.id`. Staff accounts may exist in Auth without a corresponding public users row.
- Preserve role `advisor`, column `advisor_id`, table `adviser_compliance`, column `adviser_id`, and API field `adviserId` exactly.
- Reuse document type/status constants. FAIS acknowledgement is stored as `signed`; do not invent an `acknowledged` DB status. `filed` alone is not evidence of signature for this prototype.
- Preserve `/api/clients/:clientId/consent-status` and its existing response keys, including `valid` and `expiresAt`; clients must retain access to their own consent/documents.
- Preserve `/compliance/:adviserId` for existing links and add `/compliance` as the advisor dashboard.

## Shared rules and consent

Add `server/src/constants/compliance.js` for new rules and event names: 12 months, 30 days, 18 hours, June cycle start, screening types/results, and audit events. Reuse existing role/document/status constants rather than copying them.

Put pure evaluators in `server/src/utils/complianceRules.js` with an injectable clock. All consent consumers, including the existing documents service, use the same evaluator. Put reusable audit persistence in its own service to avoid circular imports between documents and compliance.

Consent requires a signed client_consent document and a valid nonfuture signing timestamp. Respect a valid explicit expires_at; only use the 12-calendar-month fallback when expires_at is absent. Clamp month-end fallback dates; use stable UTC arithmetic. Invalid/inconsistent dates must never authorize a pull. Expiry at or before now is expired; a future expiry within 30 days inclusive is expiring; otherwise valid. Expiring consent remains valid for data refresh. Return not_signed for missing/unsigned consent and expose malformed-record issues as action required. Database verification errors throw, rather than masquerading as missing consent.

Export `isClientConsentValid(clientId)` from compliance.service.js as a side-effect-free boolean check which throws on lookup failure. Reading a dashboard must not create financial-pull audit events.

## Client controls

Add PEP and terrorism-financing screening records. Select latest per client/type by created_at descending plus a deterministic ID tie-breaker. Current `users.is_politically_exposed = true` overrides an older clear PEP result. An undeclared client without a screening is not_screened, never automatically clear.

The provider is explicitly mocked: PEP is flagged for declared PEPs; terrorism financing is clear unless demo simulation is requested. Accept only boolean simulateFlag; reject true in production. Store/display source and simulation metadata; never present this as a real external clearance. Keep adviser self-declaration flags separate from client screening evidence.

Count the five required document types once each. Only signed/acknowledged records count as complete. Detect duplicate per-client/type document records instead of arbitrarily choosing one. Do not silently discard or repair duplicates.

Overall state priority: action_required for any invalid/missing consent, outstanding document, flagged or unperformed screening; attention only when everything else passes and consent is expiring; compliant only when all tracked controls pass. Return plain-English actions. This overall client state does not certify the adviser or firm.

## Adviser controls and CPD

Extend existing adviser_compliance and ComplianceTracker. Qualification remains qualified/pending/suspended. Verify target adviser IDs against Auth app metadata. Any advisor may view another advisor; only the authenticated adviser may change their own record. Admin/client callers receive 403 on every compliance-specific endpoint.

Add adviser_cpd_records with id, adviser_id, activity, numeric hours, completed_on date, and created_at. Validate trimmed activity and finite numeric hours greater than 0 and at most 100, at most two decimal places, plus a real past-or-today YYYY-MM-DD using Africa/Johannesburg's current date. Do not accept impossible dates, numeric strings, NaN, or arbitrary request fields.

The active cycle is 1 June through 31 May inclusive in South African calendar dates. Historical activities remain visible with their dates, but only active-cycle hours count toward the active target. Zero hours = not_started; any positive total below 18 = in_progress; at least 18 = up_to_date. Derive the active status on reads, including immediately after cycle rollover, and make cpdStatus read-only in PATCH/UI. Do not invent overdue evidence for cycles before records were captured; record this limitation and preserve the existing enum for compatibility.

Show total/target, remaining hours clamped to zero, accessible progress, cycle dates, activities, and an add form. Use exact numeric sums or integer hundredths to avoid floating-point threshold errors. Persist cpd_status on CPD writes, but treat it as a cache, never the authoritative active-cycle result. Keep CPD insertion, recalculation, and audit insertion transactional; concurrent submissions must not overwrite the correct result.

## Audit and financial consent gate

Add compliance_audit_log: id, event_type, summary, result, actor_id, actor_name, client_id, adviser_id, object metadata jsonb, created_at. Actor IDs/names come from verified server identity, never submitted signerName/actor fields. Allow null actor_id for explicit system events with a truthful System label. Do not store signatures, tokens, bank details, or full client profiles in metadata.

Log screenings, first consent signing/renewal, adviser updates, CPD addition, and allowed/blocked financial authorization decisions. Log successful changes after they succeed; for compliance-owned database writes use a transaction/RPC with audit insertion. The post-sign consent audit is the specified exception: audit failure must not undo signing, but must produce an identifiable server-side error. Determine signed versus renewed from previous signing evidence.

Append-only protection must reject UPDATE, DELETE, and TRUNCATE and avoid cascading changes through foreign keys. Give the service_role only SELECT/INSERT on audit rows, not GRANT ALL; other new tables may use appropriate service-role grants. Trigger/RPC functions must use a fixed search_path and restricted EXECUTE privileges. Do not claim these controls prevent the database owner from changing the schema.

Provide a separate `checkFinancialPullConsent(clientId, actor)` returning the consent object and writing financial_pull_allowed/financial_pull_blocked. Fail closed on missing/expired consent, verification errors, or failure to persist an allowed decision. Attempt a blocked/error event on lookup failure; if storage is unavailable, log operationally and throw. Do not promise successful audit persistence during a database outage. An allowed event records permission to attempt the pull, not successful completion.

Wire this into the existing shared reminders service. Explicitly permitted edits: change dependency injection in reminders/index.js and pass its already-verified user as the second checkConsent argument in reminders.service.js. Preserve reminder scheduling, mock snapshot generation, demo mode, and its final expiry check. Pass verified req.user into the signing service via the existing document controller. Do not rewrite other modules.

## Database migration

Use one new migration with the next unused number (currently 202609190012_compliance.sql). Create client_screenings, adviser_cpd_records, and compliance_audit_log with UUID primary keys, correct foreign keys, NOT NULL/defaults, enum/numeric checks, and useful indexes for client/type/time, adviser/date, and audit time/filtering.

Enable RLS, create no end-user policies on the three new tables, and revoke access from PUBLIC, anon, and authenticated. Restrict service-role grants as above. Secure any new RPCs too. Protect the existing adviser_compliance table from direct-browser writes if the actual grants/policies allow bypassing self-only API rules; first inspect those grants and report any unknowns.

Make this new migration safe to rerun, including constraints, triggers, functions, and indexes. IF NOT EXISTS does not validate an incompatible pre-existing table: detect/report mismatches. Add new schema contracts to docs/schema.md and setup instructions. Do not rewrite the historic clients/users migrations or delete existing document rows.

## API

All these routes require requireAuth + requireRole([ADVISOR_ROLE]):

| Method | Path | Result |
| --- | --- | --- |
| GET | /api/compliance/summary | { summary, clients } |
| GET | /api/compliance/audit?limit= | { entries } |
| GET | /api/clients/:clientId/compliance | { compliance } |
| GET | /api/clients/:clientId/compliance/audit?limit= | { entries } |
| POST | /api/clients/:clientId/compliance/screenings | { screening, compliance }; body { screeningType, simulateFlag? } |
| GET | /api/advisers/:adviserId/compliance | { compliance }, including CPD summary/activity records |
| PATCH | /api/advisers/:adviserId/compliance | { compliance }; self only |
| POST | /api/advisers/:adviserId/compliance/cpd | { record, compliance }; self only; body { activity, hours, completedOn } |

Document the response fields in the client API module and keep camelCase API/snake_case database mapping explicit. Use middleware/validate.js for UUIDs, object bodies, supported enums, dates, numbers, and trimmed strings. Validate limit as a positive integer, default 50, cap 200. Return 400 for invalid input, 403 for denied access, 404 for missing client/adviser, and an appropriate server error for unavailable verification, always with a string error field.

Compliance's all-client access is intentional per the prompt; select only client-role rows. Do not expand claims/profile access. Avoid N+1 client queries; batch/page inputs so totals cover all rows rather than an implicit API limit. Audit ordering is newest-first with a stable tie-breaker; apply client filters server-side.

## Frontend

Add api/compliance.js via api/http.js. Move existing adviser API consumers together or retain compatibility exports in api/documents.js; do not leave dangling imports.

Use a new /compliance dashboard and replace My compliance in the advisor sidebar. Show six totals: clients, compliant, action required, consent expiring soon, clients with flagged screenings, clients with outstanding documents. These categories can overlap. Show a searchable client table with All/Action required/Attention/Compliant filters and status, consent, PEP, terrorism financing, and documents x/5 columns. Add the current adviser's ComplianceTracker with CPD and recent audit entries.

Keep /compliance/:adviserId and hide Edit/CPD entry when the ID differs from the authenticated user. Keep independent server authorization. Add a client-compliance card below the existing advisor client profile, with consent, screening actions, outstanding documents, and client-filtered audit entries. Refresh it after document signing through a small optional DocumentStatusList callback; preserve all existing uses.

Put labels/classes, South African date formatting, filtering, and CPD percent helpers in client/src/lib/complianceStatus.js. Use plain CSS and existing components; provide loading, empty, error/retry, disabled mutation states, and accessible form/progress labels. Show mocks as mocks and flagged checks as needing review. Do not treat a request error as a clear result. No new signature/template workflow in this stage; retain the document-history limitations in the handoff.

## Tests and completion

Use node --test and existing test conventions. Include consent missing/unsigned/expired/exact-boundary/30-day-boundary/default-expiry/leap-day/invalid-date cases; overall precedence; declared-PEP override; latest screening per type; simulated flags rejected in production; CPD fractions, thresholds, calendar boundaries, historical records and rollover; validation and self-only/role/target checks.

Inject a fake Supabase client and clock for service tests. Prove allowed/blocked gates write the correct actor/event and that lookup/audit failures do not authorize writes. Test that consent audit failure does not fail successful signing. Exercise route authorization for unauthenticated, client, admin, self-advisor, and other-advisor callers. Verify client-filtered audit and no read-triggered audit writes. Test pure frontend helpers. Put server tests in tests/*.test.js (already matched) or add globs only if a new directory needs them.

Run npm test --prefix server, npm test --prefix client, npm run lint --prefix client, and npm run build --prefix client. Verify imports/exports and client URLs against mounted server routes. With a configured disposable database, verify migration rerun, grants/RLS, audit immutability, transactions, and real template flow; otherwise explicitly record these as unverified. Keep existing test failures separate from introduced failures. Report changed files, checks, limits, and behavior changes, then commit only this implementation's files without pushing.
