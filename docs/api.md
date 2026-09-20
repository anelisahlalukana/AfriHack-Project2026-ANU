# API reference

The Express API in `server/` under `/api`. This is an overview of what exists and who may call it.
The route files in `server/src/routes/` (and `server/src/reminders/router.js`) are the source of
truth for exact paths and validation.

## Conventions

- **Base URL:** `VITE_API_BASE_URL` on the client (default `http://localhost:5000`).
- **Authentication:** `Authorization: Bearer <Supabase access token>`. The server verifies the token
  with Supabase Auth on every request and reads the person's role from `app_metadata.role`
  (`advisor`, `admin` or `provider`; no role means a client). Missing or malformed headers are a
  `401`.
- **Errors:** every non-2xx response is `{ "error": "human-readable message" }`, with `error` always
  a plain string. The client shows it as it is.
- **Bodies:** JSON, up to 10 MB (signatures are base64 PNGs). `/api/reminders` accepts 32 KB.
  File uploads are multipart.
- **Validation** runs before the controller and answers `400` with a specific message.

### Access levels used below

| Label | Meaning |
| --- | --- |
| **Public** | No sign-in |
| **Signed in** | Any valid session. The service then decides what that person may see (a client sees only their own records) |
| **Adviser** | `app_metadata.role = advisor` |
| **Admin** | `app_metadata.role = admin` |
| **Provider** | `app_metadata.role = provider`, linked to an insurer organisation |
| **Client record** | Signed in, and either an adviser (any client) or the client the path names. Admins are refused |

## Health and catalogue

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | `{ "status": "Server is running" }`. Used by CI's boot test |
| `GET /api/catalog` | Signed in | `{ claimCategories, requestTypes, providers }`: what the claim and request forms are built from |
| `GET /api/me` | Signed in | Who the caller is for the claims module: staff, or which client |

## Clients and registration

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /api/clients` | Adviser | Add a client: creates their record and login, and emails an invitation |
| `POST /api/clients/complete-registration` | Public | Client enters ID number and password; a 6-digit code is emailed |
| `POST /api/clients/finish-registration` | Signed in | Runs once the code is verified: sends the client their registration documents (FAIS Disclosure and Confidentiality Agreement) and reports which were sent or failed |
| `POST /api/clients/login` | Public | Sign in with ID number and password; returns session tokens only |

## Documents

All under `/api/clients/:clientId/documents`, access **Client record**.

| Method and path | Extra rule | Purpose |
| --- | --- | --- |
| `GET /` | | The five compliance documents and their status |
| `GET /:type/download` | | Signed URL for the current copy |
| `POST /:type/send` | Adviser | Fill the template and send it to the client |
| `POST /:type/sign` | Must have been sent | Sign with a drawn signature (FAIS Disclosure: typed name) |
| `POST /:type/upload-signed` | Must have been sent | Upload a copy signed outside the app (PDF only) |

`:type` is one of `confidentiality_agreement`, `broker_appointment`, `client_consent`,
`service_agreement`, `fais_disclosure`. Also `GET /api/clients/:clientId/consent-status`.

## Claims and requests

Access **Signed in**: clients act on their own, advisers on the clients assigned to them.

| Method and path | Purpose |
| --- | --- |
| `GET /api/tasks` | List, filtered by view, kind, category, search or client |
| `POST /api/tasks/claims` | Start a claim (a draft) |
| `POST /api/tasks/requests` | Log and submit a request |
| `GET /api/tasks/:taskId` | Full detail: stages, updates, files, insurer activity |
| `PATCH /api/tasks/:taskId/draft` | Save a draft claim |
| `POST /api/tasks/:taskId/submit` | Submit a draft to the insurer |
| `POST /api/tasks/:taskId/cancel` | Cancel a draft |
| `POST /api/tasks/:taskId/updates` | Post a note or move to a stage |
| `POST /api/tasks/:taskId/client-action` | The client confirms, picks a date, reviews or rates |
| `POST /api/tasks/:taskId/files` | Upload a photo, document or voice note |
| `GET /api/tasks/:taskId/files/:fileId/url` | Signed URL for an attachment |
| `POST /api/tasks/:taskId/close` | **Adviser.** Close as completed or declined |
| `POST /api/tasks/:taskId/provider-messages` | **Adviser.** Message the insurer |

See [claims_flow.md](claims_flow.md) for the stages and how the engine is configured.

## Provider portal

Under `/api/provider`, access **Provider**. An insurer only ever sees what was sent to it.

| Method and path | Purpose |
| --- | --- |
| `GET /me` | The signed-in insurer login and organisation |
| `GET /tasks`, `GET /tasks/:taskId` | Claims and requests sent to this insurer |
| `POST /tasks/:taskId/respond` | Complete its next step or post a progress update |
| `POST /tasks/:taskId/decline` | Decline. The reason (`note`) is required: an empty one is a `400` |
| `POST /tasks/:taskId/messages` | Message Royal Square (the adviser sees an internal note). Text required |
| `POST /tasks/:taskId/handler` | Reassign the claims handler |
| `POST /tasks/:taskId/files`, `GET /tasks/:taskId/files/:fileId/url` | Exchange files |

## Dashboards and Client Pulse

Under `/api/dashboard`. Explained in [dashboard-and-client-pulse.md](dashboard-and-client-pulse.md).

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /` | Adviser | The practice overview snapshot |
| `GET /me` | Signed in (clients only in practice) | The client's own overview: what needs them, paperwork, goals, money, activity |
| `GET /at-risk` | Adviser | Clients ranked by risk of disengaging |
| `GET /at-risk/:clientId` | Adviser | One client's signals in full |
| `POST /at-risk/:clientId/check-in` | Adviser | Send the client an in-app check-in |

## Compliance

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/compliance/summary` | Adviser | The compliance dashboard across clients |
| `GET /api/compliance/audit` | Adviser | Recent audit entries |
| `GET /api/advisers/:adviserId/compliance` | Adviser | An adviser's qualification and CPD record (any adviser can read) |
| `PATCH /api/advisers/:adviserId/compliance` | Adviser, own record only | Update qualification or declarations |
| `POST /api/advisers/:adviserId/compliance/cpd` | Adviser, own record only | Record CPD hours |
| `GET /api/clients/:clientId/compliance` | Adviser | A client's consent, screening status and outstanding items |
| `GET /api/clients/:clientId/compliance/audit` | Adviser | Audit entries for that client |
| `POST /api/clients/:clientId/compliance/screenings` | Adviser | Returns `503`: no live screening provider is connected, and simulated results cannot clear a client |

## Audit log

`GET /api/audit-log` and `GET /api/audit-log/facets`. Access: advisers, admins and providers; each
sees only what their role allows.

## Reports

Under `/api/reports`, access **Adviser** or **Admin**. See [reports.md](reports.md).

| Method and path | Purpose |
| --- | --- |
| `GET /templates` | The report catalogue and whether the model is enabled |
| `POST /ask` | A plain-English question, answered with a chart |
| `POST /run` | Run a named template with parameters. Also used by the dashboard's work-over-time chart |
| `POST /query` | Run a structured custom query |
| `POST /generate` | Turn a result into a written report |

## Admin

Under `/api/admin/users`, access **Admin**: `GET /` (list), `POST /` (create a staff or insurer
login and email a password-setup link), `POST /:id/resend-invite`.

## Reminders, notifications and push

Under `/api/reminders`, handled by the reminders module with its own sign-in check. Advisers see
every reminder for their clients; clients see only their own.

| Method and path | Purpose |
| --- | --- |
| `GET /config` | **Public.** Whether push is set up, and the VAPID public key |
| `GET /me`, `GET /clients` | Who is asking; the clients they can see |
| `GET /rules`, `POST /rules`, `PUT /rules/:id` | Reminder types (adviser) |
| `GET /reminders`, `POST /reminders`, `POST /reminders/:id/complete` | Reminders |
| `GET /notifications`, `PATCH /notifications/:id/read` | The in-app notification feed |
| `GET /messages/:clientId`, `POST /messages` | Messages between a client and their adviser |
| `POST /push/subscriptions`, `DELETE /push/subscriptions` | Subscribe or unsubscribe this device. See [pwa.md](pwa.md) |
| `POST /financial-pull/:clientId` | Pull a financial snapshot. Needs valid, unexpired client consent; the data itself is fictional |
