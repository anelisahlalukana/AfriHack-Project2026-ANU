# Dev 4 — Reminders, notifications and glue

Branch: `feature/reminders-notifications-glue`.

## Shared database (normal mode)

Normal app use now stores Dev 4 data in the team's Supabase project. It never falls back to JSON files.

1. Configure server/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and client/.env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Keep all secrets out of Git.
2. Apply supabase/migrations/202609190010_dev4_shared.sql in the shared project's SQL Editor. It preserves existing data and adds reminder rules, message threads, push subscriptions, mock snapshots, and supporting columns/functions.
3. Run npm run dev and sign in. Open /workspace, or use Reminders & messages in the adviser navigation.

Identity comes from verified Supabase access tokens. Advisers require app_metadata.role=advisor. Clients need a unique users.auth_user_id or legacy users.client_user_id link to their Auth user; conflicting links are rejected. Matching by email or user-editable metadata is not allowed. Admin accounts retain user management and do not access client conversations.

Existing reminders and notifications tables are reused. New tables/functions are backend-only, with RLS and no browser execution grants. Reminder delivery is transactional and uses database row locks; push dispatch uses expiring database leases. Multiple API processes share the same state. Existing legacy task reminders without rule_id remain owned by the claims module.

Provider values remain explicitly fictional as required by the brief. Live client records and Dev 2 consent are real; mock snapshots never overwrite FNA balances.

Missing migrations produce a setup error rather than silently using demo data. The migration has to be applied before shared reminders/messages can operate.

## Optional isolated demo

Use Node 22.12+ (tested on Node 24). From the repository root:

```sh
npm install
npm install --prefix server
npm install --prefix client
npm run dev:demo
```

Open http://127.0.0.1:5173/dev4-demo. The root URL retains the main branch login and client workspace. The API listens on 127.0.0.1:5000, and Vite proxies `/api`.
Two adviser personas and two fictional clients are available in the demo selector.
Changing personas disables this browser's existing push subscription so updates do
not follow the wrong account. Enable push again after switching if needed.

`npm run dev` verifies real Supabase sessions and uses shared storage.
The demo refuses to start with `NODE_ENV=production` and binds to loopback.
Do not expose or tunnel the demo server to a public network.

## Included

- Six seeded types: insurance valuation (24 months, shared), driving licence
  expiry (one time), annual review (12 months, shared), retirement fee renewal
  (12 months, advisers), birthday (12 months, shared), anniversary (12 months).
- Adviser-created client schedules, recipient choice, editable/extensible rule
  types, pause/resume, and completing/stopping schedules.
- Due-date scheduler every 30 seconds; dates use Africa/Johannesburg. An overdue
  recurring reminder sends once and advances to the next future anchored date;
  it does not flood the inbox with every missed year. Jan 31 and Feb 29 anchors
  are retained. One-time reminders become `notified` and remain visible until
  the adviser completes them. Paused rule types suppress delivery; resuming
  delivers overdue reminders. Changing rule defaults affects new schedules;
  existing schedules retain their titles, recipients and repeat intervals.
- Personal notification inbox, unread counts and mark-read, refreshed every
  10 seconds; optional distinct foreground chime activated by a user gesture.
- Browser Web Push, service worker, install manifest, private lock-screen
  previews, expired-subscription cleanup and up to three delivery attempts.
  Push is optional: the in-app inbox works without permission or VAPID keys.
- Client conversation threads shared by BOTH advisers; adviser can message any
  client. Clients can only read/write their own thread. Messages refresh every
  five seconds. Notifications contain no message content.
- Mock financial pull on every request checks Dev 2's current consent decision
  AND its expiry. Missing/expired/revoked consent denies the pull, and a consent
  service failure returns 503. All output is labelled simulated, in ZAR.

## Push setup

Local VAPID keys have been generated in the ignored `server/.env.dev4.local` on this machine.
They are not committed or shared. On another machine, generate your own:

```sh
npm run push:keys --prefix server
```

Copy `server/.env.example` to `server/.env.dev4.local`, then set the generated keys and a
valid `VAPID_SUBJECT` (a contact mailto or HTTPS URL). Restart the backend.
In Notifications, click Enable push and grant browser permission. A pending
update is delivered on the next scheduler tick. Public VAPID keys may be sent
to the browser; the private key must remain on the server. Never commit environment files. The repository already tracks a base `.env`; this change leaves it untouched and stores generated push keys only in `.env.dev4.local`.

Use HTTPS in deployment (localhost is allowed for development). Browser/device
support and user settings govern lock-screen presentation and sound. Custom
background sounds cannot be promised by a browser app. On iPhone/iPad, use a
supported OS and install the app on the Home Screen. The in-app chime plays only
while the page and audio context are active. Actual device push delivery still
needs a user-granted subscription and a device check; transport success alone
is not proof a notification was displayed.

## Integration with Dev 1

SharedWorkspace.jsx hosts the signed-in workspace at /workspace. It requests /api/dev4/me for the verified identity and /api/dev4/config for push configuration. The shared axios client attaches the current Supabase access token for every request, including after token refresh.

Normal createDev4 connects services/dev4.service.js, controllers/dev4.controller.js and routes/dev4.routes.js to the existing backend-only Supabase client. It does not construct the file store. Only the explicit demo mode uses the ignored server/data/dev4-demo.json file and demo identity headers.

The existing clients API now reads the shared users table and restricts the queries to client role rows, matching the team's current schema. Client login links are database-managed; new registrations must be linked by the team's onboarding flow before opening private client conversations.

Use disablePush(api) before account switching. Shared notification clicks open /workspace#notifications and require sign-in. Push payloads contain no message or financial details.

For onboarding dates such as birthdays/licence expiry, call `addReminder` after
Dev 1 has saved the date, using a verified adviser/service identity. The initial
release schedules exact due dates; advance notice can be scheduled separately.
Do not add the same schedule again on every profile read. Automated date-change
synchronisation is an integration task once the shared onboarding schema exists.

## Integration with Dev 2

`checkConsent(clientId)` must return:

```js
{ valid: true, expiresAt: '2027-09-19T21:59:59.999Z' }
// or { valid: false, expiresAt: null }
```

Dev 2 owns signature state, scope, expiry and revocation. The callback must
return the current status on every invocation. Unconfigured consent fails
closed. Demo only: Thandi is allowed, Sipho is denied; this fixture does not
create legal consent or sign a document.

`POST /api/dev4/financial-pull/:clientId` returns the new snapshot with
`clientId`, `assets[]`, `liabilities[]`, calculated `netWorth`, `currency`,
`source`, `simulated: true`, and `pulledAt`. Dev 1 can use the returned payload
to update the financial dashboard. The latest demo snapshot is persisted but
no real bank/aggregator API is called. No financial snapshot is returned after
a failed check.

## Integration with Dev 3 (and document expiry events)

Publish from trusted server code after your domain transaction succeeds:

```js
await req.app.locals.dev4.publishEvent({
  eventId: `${claim.id}:${claim.stageVersion}`,
  clientId: claim.clientId,
  type: "claim.stage_changed",
  title: "Claim update",
  body: "The assessment is complete. Your adviser will explain the next step.",
  audience: "both",
});
```

Types: `claim.stage_changed`, `task.updated`, `document.expiring`.
Audience: `client`, `adviser`, or `both`. The same type/client/eventId combination
is idempotent for each recipient; use a stable persisted ID/version for retries.
There is deliberately no browser-accessible arbitrary-event or recipient API.
There is no insurer user or claim submission endpoint in Dev 4; Dev 3 owns that.
A production integration should retry events via a transactional outbox.
The notification appears immediately in the inbox; queued push is attempted
on the next 30-second scheduler tick.

## API summary

All paths are under `/api/dev4`. All except `/config` require authentication.

| Method/path                    | Access           | Payload/result                                                 |
| ------------------------------ | ---------------- | -------------------------------------------------------------- |
| GET /config                    | Public           | Demo state, demo users only in demo, public push configuration |
| GET /clients                   | Scoped           | `{id,name}[]`; clients only see themselves                     |
| GET /rules                     | Authenticated    | Reminder type defaults                                         |
| POST /rules                    | Adviser          | `{title,repeatMonths,audience,enabled}`                        |
| PUT /rules/:id                 | Adviser          | Same fields; updates or pauses a rule                          |
| GET /reminders                 | Scoped           | Client sees own client/shared reminders; advisers see all      |
| POST /reminders                | Adviser          | `{clientId,ruleId,dueDate,audience?,repeatMonths?}`            |
| POST /reminders/:id/complete   | Adviser          | Completes reminder, stops recurrence                           |
| GET /notifications             | Own user         | Notification inbox                                             |
| PATCH /notifications/:id/read  | Own user         | Idempotent mark-read                                           |
| GET /messages/:clientId        | Scoped           | Conversation history                                           |
| POST /messages                 | Scoped           | `{clientId,body}`; 4,000 character limit                       |
| POST /push/subscriptions       | Own user         | Browser subscription JSON                                      |
| DELETE /push/subscriptions     | Own user         | `{endpoint}`                                                   |
| POST /financial-pull/:clientId | Scoped + consent | Simulated financial snapshot                                   |

Dates are `YYYY-MM-DD`; intervals are 0–120 whole months, with 0 meaning once.
Errors use `{error: string}`. 401 unauthenticated, 403 unauthorized/invalid
consent, 404 missing record, 400 invalid input, 503 unavailable integration.

## Verification and demo script

```sh
npm test
npm run lint --prefix client
npm run build
```

Tests cover recurrence, month-end/leap dates, South Africa date boundaries,
paused rules, overdue catch-up, recipient routing, cross-client authorization,
consent revocation/expiry/outage, idempotent events, push retries/cleanup,
persistence across restart and authenticated HTTP routes.

Demo: as Qiniso, schedule a valuation reminder for Thandi due today. Within
30 seconds both advisers and Thandi get an inbox update. Switch to Thandi to
view it and message the practice; switch to Vusi to read/reply. Try financial
refresh for Thandi (allowed) and Sipho (denied). Add and pause a custom reminder
type. Completing a recurring reminder stops its future deliveries.
