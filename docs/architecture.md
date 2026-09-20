# Architecture

How the pieces fit, who can see what, and what runs in the background. For the folder layout and
coding patterns see [coding-standards.md](coding-standards.md); for the tables see
[schema.md](schema.md).

## The pieces

| Piece | Where | Job |
| --- | --- | --- |
| **Client app** | `client/` | React single-page app for advisers, clients, insurers and admins. Also the PWA (service worker, manifest) |
| **API** | `server/` | Express. Holds the service-role key, talks to Brevo and the push services, enforces roles, runs the reminder scheduler |
| **Supabase** | hosted | Postgres with row-level security, Auth (every login) and Storage (documents and attachments) |
| **Brevo** | external | Transactional email: client invitations, verification codes, staff password setup, and an email copy of each client notification |
| **Gemini** | external, optional | Wording for AI-assisted reports. Every report also works without it |

The browser has two ways to reach data:

1. **Through the API** for anything that needs the service-role key, an outside service or business
   logic: registration, documents, claims, dashboards, compliance, reports and push.
2. **Directly to Supabase**, protected by row-level security, for plain reads and edits of data the
   signed-in adviser owns, such as the client list and the financial needs analysis.

When unsure, use the API: it is easier to secure and keeps logic in one place.

## Who can sign in and how

| Person | Where the login lives | How they sign in |
| --- | --- | --- |
| Adviser, admin | Supabase Auth user with `app_metadata.role` of `advisor` or `admin` | Email and password |
| Insurer | Supabase Auth user with `app_metadata.role = provider` and a `provider_id` pointing at their organisation's `public.users` row (`role_id` 2) | Email and password, then `/provider` |
| Client | A `public.users` row (`role_id` 1) linked to a Supabase Auth user through `auth_user_id`. The row and the login are created together | 13-digit ID number and password |

Clients type an ID number, not an email. The server finds the matching login, signs in on the
client's behalf and returns only the session tokens, so the email address never reaches the browser
and every failure reads the same (an attacker cannot learn which ID numbers are registered).

Roles come **only** from `app_metadata`, which only the service role can write. `user_metadata` is
editable by the user, so it is never trusted for access. A login with no staff role is a client.

## Who can see what

| | Adviser | Admin | Insurer | Client |
| --- | --- | --- | --- | --- |
| Their client list and financial needs analysis | Their assigned clients | No | No | Their own |
| Documents | Any client (they send them) | No | No | Their own (they sign them) |
| Claims and requests | Clients assigned to them | No | Only those sent to their organisation | Their own |
| Practice dashboard and Client Pulse | Yes (task counts limited to assigned clients) | No | No | No |
| Compliance | All clients; edit only their own adviser record | No | No | No |
| Reports | Their own clients | Every adviser's book | No | No |
| Staff and insurer logins | No | Manage them | No | No |
| Audit log | Their scope | Everything | Their scope | No |

Admins manage staff and never see client financial data. The rule is enforced in four layers, and
each layer assumes the others could fail:

1. **Route guards in the client** (`ProtectedRoute`: staff, admin, provider) decide what to show.
   This is convenience only, never security.
2. **API middleware**: `requireAuth` verifies the Supabase session on every call, `requireRole`
   checks `app_metadata.role`, and `requireClientAccess` guards `/api/clients/:clientId/...` (an
   adviser may reach any client, a client only their own record, an admin never).
3. **Services** re-check ownership (for example a client's task must belong to them) and never trust
   an id or a role sent in a request body.
4. **Row-level security** in Postgres for anything the browser reads directly.

## The server

```
routes/       HTTP verb + path + middleware only
controllers/  read the request, call one service, send the JSON
services/     all business logic and every Supabase or third-party call
middleware/   auth, roles, client access, request validation
constants/    shared enums and thresholds (documents, roles, dashboard, tasks)
utils/        stateless helpers
```

Every error leaves as `{ "error": "message" }` with a plain-string message written for the person
using the app, and the client's response interceptor puts that text straight onto the thrown error.
Secrets, URLs and role lists come from `process.env` or `constants/`, never inline.

## Main flows

### A client joins

1. An adviser adds the client (`POST /api/clients`). The server creates their record and login and
   emails an invitation to `/complete-registration`.
2. The client enters their ID number and a password. The server stores the ID number, sets the
   password and emails a 6-digit code (from Supabase's `generateLink`, sent through Brevo).
3. The browser confirms the code with `verifyOtp`, then calls `finish-registration`, which sends the
   client their first documents (the FAIS Disclosure and Confidentiality Agreement).
4. They land on `/account`.

### Documents and signing

The five compliance documents are templates in a Storage bucket. Sending one fills the template with
the client's details (pdf-lib) and stores the unsigned PDF in a private bucket. The client then
either signs in the app (the drawn signature is placed into the PDF; the FAIS Disclosure is
acknowledged with a typed name instead) or downloads, signs elsewhere and uploads the signed PDF.
Once all five are signed the client's status moves from `onboarding` to `active`. A signed Client
Consent is valid for 12 months. The button that starts signing shows only while a document is
waiting for the client.

### Claims and requests

One engine handles every claim type and every request type. What each needs (form fields, checklist,
required documents, stage list) is configuration in the database, so new types appear without code
changes. The insurer is mocked: registering a claim and acknowledging a request happen
automatically, and everything an insurer does happens in the provider portal. See
[claims_flow.md](claims_flow.md).

### Reminders, notifications and push

A reminder rule and a reminder row live in Postgres. Every 30 seconds the server calls
`reminders_run_reminders()`, which turns due reminders into notifications, then delivers waiting push
messages. Delivery details, validation and limits are in [pwa.md](pwa.md).

Separately, an in-app notification created for a client (a document sent to them, onboarding
complete, a Client Pulse check-in) is also pushed to their devices and emailed through Brevo the moment
it is saved. That runs in the background and every failure is logged and swallowed, so it can never
fail the action that caused it. Adviser, claim and request notifications remain in-app only.

### Reports

An adviser or admin asks a question in plain English. The server matches it to one of the fixed
report templates (using Gemini if it is enabled and quick enough, otherwise keyword matching), runs a
query scoped to what the caller may see, and returns rows for a chart. A written report can be
generated from the result. Client names are removed before anything is sent to the model. See
[reports.md](reports.md).

## Background work

The API process runs one in-process scheduler (`setInterval`, every `REMINDERS_TICK_MS`, default 30
seconds). Firing reminders and sending push are separate steps, so a failure in one never holds back
the other. The SQL functions take row locks with `SKIP LOCKED`, so if more than one server instance
ever ran, two of them could not deliver the same reminder twice.

## Storage

Three private Supabase Storage buckets, named by environment variables:

| Variable | Default | Holds |
| --- | --- | --- |
| `DOCUMENT_TEMPLATES_BUCKET` | `document-templates` | The PDF templates for the five documents |
| `CLIENT_DOCUMENTS_BUCKET` | `client-documents` | Filled and signed documents |
| `TASK_FILES_BUCKET` | `task-files` | Photos, documents and voice notes attached to claims and requests |

Files are handed to the browser as short-lived signed URLs, never as public links.

## The client app

`pages/` (one file per route), `components/` (reusable UI by feature), `api/` (one file per backend
resource, axios only), `hooks/` (stateful logic), `lib/` (pure helpers). Data is fetched in a
`useEffect` with a cancellation flag. Styling is plain CSS in `index.css` (design tokens) and
`App.css`, with a light and a dark theme chosen by `data-theme` on the root element and remembered in
`localStorage` (`rsf-theme`). The app is an installable PWA: see [pwa.md](pwa.md).

## Security notes

- The service-role key exists only in `server/.env`. Anything named `VITE_*` is compiled into the
  browser bundle, so only public values go there (the Supabase anon key is designed to be public).
- CORS allows only `CLIENT_ORIGIN`.
- The service worker never caches anything signed-in, and push messages carry no client detail.
- The compliance audit log is append-only: database triggers reject updates and deletes, so a record
  of something done cannot be quietly rewritten.
- Compliance and claims data are personal information; treat exports, logs and demo data with the
  same care as production.
