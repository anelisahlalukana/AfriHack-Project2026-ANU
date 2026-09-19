# Compliance implementation handoff

Implemented on `feature/compliance`, 19 September 2026. The pre-implementation review is retained in `compliance-project-review.md`; the implemented scope follows `compliance-implementation-prompt.md`.

## Delivered

- Advisor dashboard at `/compliance`: six totals, client search/status filters, client controls, own qualification/CPD tracker, and recent audit events.
- Client profile compliance card: consent status, mock PEP/terrorism checks, outstanding documents, required actions and client-filtered audit. Signing in the existing document panel refreshes this card.
- CPD activities, fractional-hour totals, June-to-May cycle, current-cycle status and progress. Historical activities stay visible; only current-cycle hours count. Manual CPD status edits are rejected.
- Advisor-only compliance APIs; self-only adviser writes; adviser target validation; all-client compliance views without modifying claims/profile ownership rules.
- Shared consent evaluator and lookup used by documents and compliance. Read-only consent checks do not create audit events. Financial-pull decisions are audited before the existing reminders service writes a snapshot and fail closed on verification/audit errors.
- Transactional database RPC for screenings, adviser updates and CPD plus audit insertion. CPD changes serialize per adviser. Consent signing audit is intentionally best-effort after successful signing and uses the authenticated actor.
- Three new tables, service-only access, restricted RPC execution, and audit UPDATE/DELETE/TRUNCATE protection. Direct browser table/column privileges on existing adviser compliance are removed by the migration.

## Verification completed

| Check | Result |
| --- | --- |
| `npm test --prefix server` | 51 passed |
| `npm test --prefix client` | 58 passed |
| `npm run lint --prefix client` | Passed |
| `npm run build --prefix client` | Passed; main chunk exceeds Vite's 500 kB advisory threshold |
| Actual `server.js` boot and HTTP smoke check | Health 200; new summary route without authentication 401 |
| Real route/middleware/controller/service tests with an in-memory database | Role/self checks, input rejection, endpoint wiring and actor attribution passed |
| Financial gate integration with existing reminder service | Allowed/blocked decisions, lookup/audit failures, duplicate consent, and no unauthorized snapshot writes passed |
| Actual PDF signing service with in-memory storage/database | Signing succeeds when the post-signing audit insert fails; first signing/renewal distinguished |

Tests use fictional data. Database fakes verify service contracts, not PostgreSQL transaction or RLS behavior.

## Required to run against Supabase

Follow **Compliance module setup** in `docs/setup.md`. Configure backend/frontend Supabase settings and apply `supabase/migrations/202609190012_compliance.sql` through the project's database deployment process. No shared-database migration was applied during implementation.

This checkout has no configured Supabase credentials. Live schema/grant/RLS verification, migration execution/rerun, database concurrency/rollback/immutability checks, authenticated browser interactions and visual layout checks, and real storage/template signing remain unverified. No local PostgreSQL or Docker executable was available for a disposable SQL run. The existing migration history is not a complete fresh-database bootstrap.

## Behavior and policy limits

Previously any authenticated user could read/update adviser compliance. Those routes now require `advisor`; changing another adviser's record is denied. CPD is derived, not manually selectable. A data refresh now requires an audit write as well as valid consent, so a missing compliance migration blocks refresh rather than silently proceeding.

The prototype uses annual consent renewal and an 18-hour CPD target pending business confirmation. The supplied consent wording continues until written withdrawal, and this change does not implement withdrawal. Screenings remain explicitly mocked, qualifications/CPD self-recorded, and a compliant status covers only the displayed client controls.

Existing document duplicates are detected, not repaired. Existing PDF overwrites/signature/template limitations are unchanged; no document-versioning workflow was added. The two legacy `.doc` forms remain unverified. All-client compliance visibility intentionally does not expand access in the team's claims/profile modules.
