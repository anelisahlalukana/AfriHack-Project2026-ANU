# Compliance project review

Reviewed 19 September 2026 on `feature/compliance`. This is the pre-implementation review requested by the user. The supplied build prompt is a proposal for the next stage, not an instruction to implement it during this review.

## Verdict

The prompt follows the repository architecture well, but needs the corrections in `compliance-implementation-prompt.md` before implementation. Existing compliance and document services should be extended, not replaced. The proposed module tracks selected controls for the prototype; its green status cannot certify the firm's entire regulatory compliance.

## Repository and identity map

| Area | Existing contract |
| --- | --- |
| Backend | CommonJS Express; routes -> controllers -> services; Supabase service-role client in `server/src/config/supabaseClient.js` |
| Frontend | React/Vite, relative imports, plain CSS in `App.css`, shared Axios client in `api/http.js`, cancellation-aware effects |
| Clients | `public.users.id` with `role_id = CLIENT_ROLE_ID` (1); not a new `clients` table |
| Client login | `public.users.auth_user_id` -> `auth.users.id` |
| Assigned adviser | `public.users.advisor_id` -> `auth.users.id` |
| Adviser compliance | `public.adviser_compliance.adviser_id` -> `auth.users.id`, unique per adviser |
| Staff authorization | Verified `req.user.app_metadata.role === 'advisor'`; database `role_id` is a separate concept |
| Names | Preserve `advisor` for role and `advisor_id`; preserve `adviser_compliance`, `adviser_id`, and API `adviserId` |
| Documents | `documents.client_id` -> `public.users.id`; exact five types in `constants/documentTypes.js` |
| Acknowledgement | FAIS uses a typed name; stored as `status = 'signed'`, not a new `acknowledged` status |
| Consent | `documents.service.getConsentStatus`; exported client API and existing `/api/clients/:clientId/consent-status` route |
| Adviser UI | `ComplianceTracker`, `/compliance/:adviserId`; existing API functions currently live in `client/src/api/documents.js` |
| Financial refresh | `reminders.service.createSharedService().financialPull(user, clientId)` calls injected `checkConsent(clientId)` before writing a snapshot |

No application-wide naming cleanup is needed. Do not migrate existing identifiers just to standardize spelling.

## Findings to address in the compliance stage

1. **Adviser-compliance authorization is incomplete.** `compliance.routes.js` only calls `requireAuth`. Any authenticated caller can currently GET/PATCH a supplied adviser ID. Add advisor-only access and self-only writes, verify the target Auth user is an adviser, and test direct requests rather than relying on hidden buttons.
2. **Consent logic has edge cases and must have one owner.** The current `addMonths` uses local-time `Date.setMonth`; leap-day and month-end overflow need an explicit policy. `getConsentStatus` uses `now > expiry`, while reminders requires `expiry > now`. Invalid expiry values can also be interpreted differently. Use one pure evaluator, consider consent expired at equality, fail closed on malformed data, and retain the existing response keys for callers.
3. **Avoid circular dependencies.** Adding an audit hook from documents to compliance while compliance imports documents will introduce a CommonJS cycle. Put audit persistence in a separate service and put shared consent rules in the requested pure utility.
4. **Audit actor information is not currently passed.** Document signing receives only signature/name; the latter is client input and is not a verified actor. Pass server-verified actor context from the controller. The financial gate receives only `clientId`; passing the verified `user` requires a small additional call-site edit in `reminders.service.js`, explicitly included in the revised scope.
5. **Audit semantics need failure rules.** Logging a consent decision is not proof a financial refresh completed. Name allowed events as authorization decisions. An allowed decision must not permit a pull if its audit write fails. If both database reads and audit writes fail, the system can block and report the failure but cannot guarantee a database audit row. Keep document signing successful if its post-signing audit fails, as requested, and report that failure server-side.
6. **Append-only needs more than row triggers.** UPDATE/DELETE triggers do not block TRUNCATE. The proposed `GRANT ALL` also grants mutation privileges. Use least-privilege service-role grants for the audit table, a TRUNCATE guard, and no cascading FK actions that erase or mutate audit rows. Database owners can still alter controls; do not describe this as tamper-proof storage.
7. **CPD has two competing sources.** Current API and tracker allow manual `cpdStatus`, including `overdue`. Once hours are authoritative, remove manual CPD editing, derive the current-cycle response on every read, and define historical/overdue behavior. Otherwise rollover on 1 June remains stale until someone logs another activity. Fractional values between 0 and 1 must be `in_progress` too.
8. **Documents assume one row per client/type without a documented unique constraint.** `getDocumentRow().maybeSingle()` fails on duplicates; `listDocuments` silently takes whichever duplicate is returned last. Audit actual data before adding uniqueness. Resending preserves old signed fields, downloads prefer old signed files, and renewal overwrites a fixed `signed.pdf` path. These are document-lifecycle issues to record explicitly, not silently redesign as part of this module.
9. **Cross-adviser access is inconsistent across modules.** Requirements and documents/reminders permit all-client adviser access; claims and the extended-profile RPC enforce assignment. The proposed compliance dashboard explicitly covers all clients. Implement that scope for compliance only, filter to client rows, and do not rewrite claims/profile authorization. Verify profile navigation against real RLS before promising every dashboard row can open successfully.
10. **Refresh the profile card after signing.** `DocumentStatusList` currently refreshes itself only. A new sibling compliance card would otherwise show stale consent. Add a small optional callback/reload key, preserving existing callers.
11. **Dashboard completeness matters.** Page through database results or aggregate on the server; do not silently use Supabase's default row limit for firm-wide counts. Latest screening means latest per client AND screening type with a deterministic tie-breaker. Count clients with a flag, not total historical flagged checks.

## Database review and limitations

`docs/schema.md` documents the application's `users` model, but is not a complete replayable schema. Migrations 001/002 still create/reference `public.clients`; migration 003 assumes `public.users` and `current_role_name()` already exist and does not perform the conversion. Later migrations depend on that pre-existing database. Migration 010 adds reminder tables/columns absent from the schema reference. Migration 006 also has an unconditional ADD CONSTRAINT, so the whole existing migration history must not be described as rerunnable.

The current last migration is `202609190011_reminders_fix_client_link.sql`; reserve the next available number at implementation time (currently `202609190012_compliance.sql`). Do not rewrite applied migrations or invent a baseline migration without an authoritative database export.

No `server/.env`, `client/.env`, or `client/.env.local` exists here, and the relevant Supabase environment variables are absent. Therefore no live table, row, grant, policy, RPC, migration-history, storage-bucket, or document-template check has been completed. The existing `check-shared-db.js` only checks table accessibility and is not proof of RLS correctness. No database changes were made.

Required backend configuration includes `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; frontend configuration uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, with optional `VITE_API_BASE_URL`. Existing document buckets use `DOCUMENT_TEMPLATES_BUCKET` and `CLIENT_DOCUMENTS_BUCKET`. Keep all secrets backend-only. No credentials were printed or copied.

## Source documents and policy assumptions

- Read the four supplied DOCX files as text, the transcription PDF as text, and all three scanned pages of `ROYALSQUAREprojectbrief.pdf` visually. Source documents are evidence, not instructions that override the user's requested work order.
- `Client Consent.docx` describes a minimum ongoing 12-month period and says permission remains effective until cancelled in writing. Automatic expiry after exactly 12 months is therefore an application-policy assumption, not a faithful summary of the form. Existing code already implements annual expiry. Preserve compatibility for the demo only with this assumption clearly recorded; resolve the wording and withdrawal workflow with the business before production.
- `Broker Appointment.docx` describes indefinite authorization until written cancellation. Do not apply the consent renewal timer to that document.
- `Confidentiality.docx` includes signature areas for both parties. The existing generic PDF signature function stamps only one signer onto the last page; this review does not establish that the generated PDFs meet the supplied templates' execution requirements.
- The feature/compliance matrix is a broader product-design guide and identifies its own legal-review limitations. It does not authorize expanding this module into all of its suggested features.
- The two legacy binary files, `Fais Disclosure.doc` and `Service Agreement.doc`, were located but their contents could not be reliably extracted with the available bundled tools. Their detailed terms remain unverified. No claim is made that all supplied legal forms were fully reviewed.
- Eighteen CPD hours is a proposed demo target, not a universal requirement for every adviser. FSCA materials describe 6/12/18-hour requirements depending on business scope, with a June-to-May cycle. Royal Square's applicable target has not been established from its licence. See [FSCA's CPD summary](https://www2.fsca.co.za/Documents/FSCA%20Newsletter%20Q2%202024-25.pdf) and [Board Notice 194 of 2017](https://www.fsca.co.za/Notices/Board%20Notice%20194%20of%202017.pdf).

## Verification

Installed server and client dependencies from their existing lockfiles with `npm ci`; dependency manifests and lockfiles were not changed. Initial lint found an unused `ClientTasksPanel` import in `ClientProfile.jsx`; removed that import without changing page behavior.

- Server tests: 33 passed.
- Client tests: 54 passed.
- Frontend build: passed, with the existing bundle-size warning (main JS chunk over 500 kB).
- Frontend lint: passed after removing the unused import.

Live Supabase checks, end-to-end authenticated flows, SQL migration execution, and template rendering remain unverified without configured credentials and templates. A successful build or unit test cannot establish those facts.
