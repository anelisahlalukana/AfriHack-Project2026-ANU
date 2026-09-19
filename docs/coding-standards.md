# Coding standards

This describes the patterns already in use in this repo. Match them — don't introduce a
new pattern (a different HTTP client, a different CSS approach, a different file layout)
without checking with the team first. If you're an AI tool working in this repo, read this
file before writing code, and prefer copying the shape of an existing file in the same
folder over inventing your own.

Two reference files to know about:
- `docs/schema.md` — the authoritative database schema. Use existing tables/columns as-is.
  If you need a new table, match the naming and constraint style already there and add it
  to that file.
- `docs/style_reference/royal-square-dashboard-concepts.html` — the intended visual
  direction (colours, layout ideas). The actual implementation is plain CSS (see below),
  not the HTML/CSS in that file directly — treat it as a mood board, not literal markup.

## Project layout

```
server/src/
  routes/       HTTP verb + path only, no logic
  controllers/  reads req, calls a service, returns res.json()
  services/     all business logic + all Supabase/third-party calls
  middleware/   auth, role checks, request validation
  constants/    shared enums/lookup values (roles, document types, ...)
  utils/        stateless helpers (PDF filling, email sending, ...)
  config/       client setup (Supabase admin client, ...)

client/src/
  pages/        one file per route, composes components + hooks
  components/   reusable UI, grouped by feature folder (components/documents/*)
  api/          one file per backend resource — axios calls only, no business logic
  hooks/        reusable stateful logic (useAuth, useClients, ...)
  context/      React context providers (AuthContext, NotificationContext)
  lib/          pure helper functions, no side effects (money formatting, role checks, ...)
```

## Backend: three-layer separation

Every backend feature is **routes → controller → service**, each in its own file, never
collapsed together.

- **routes/`<domain>`.routes.js** — only `router.get/post/patch(...)`, plus middleware
  (`requireAuth`, `requireRole`, validators). No `req`/`res` logic, no Supabase calls.
- **controllers/`<domain>`.controller.js** — reads `req`, calls exactly one service
  function, returns `res.json(...)` or `res.status(n).json({ error: ... })`. No Supabase
  calls, no business logic, no `if` branches beyond picking what to send back.
- **services/`<domain>`.service.js** — where the actual work happens: Supabase queries,
  third-party API calls (Brevo, PDF generation), calculations. Services throw
  `new Error("message")` on failure; they never touch `req`/`res`.

File naming: `<domain>.routes.js` / `<domain>.controller.js` / `<domain>.service.js`,
lowercase, matching the resource name (see `documents.*`, `compliance.*`, `users.*`).

```js
// controllers/documents.controller.js — thin, no business logic
async function sendDocument(req, res) {
  try {
    const document = await documentsService.sendDocument(req.params.clientId, req.params.type);
    res.json({ document });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
```

### Validation

Validate request input in `middleware/validate.js`, not inline in the controller. Reject
with a clear `400` before bad input reaches the service layer.

```js
function validateDocumentType(req, res, next) {
  if (!DOCUMENT_TYPE_VALUES.includes(req.params.type)) {
    return res.status(400).json({ error: `Invalid document type '${req.params.type}'` });
  }
  next();
}
```

### Backend error handling

Every non-2xx response — from a controller's `catch`, a validation middleware, or
`requireAuth`/`requireRole` — is `res.status(n).json({ error: "human-readable message" })`.
Always this exact shape, `error` always a plain string. The frontend's `http.js` response
interceptor reads `error.response.data.error` and puts it on the thrown error's `.message`,
which is what every component's `catch (error) { setError(error.message) }` displays — a
different shape (`{ message: ... }`, an array, a nested object) silently breaks that and the
user sees a generic "Request failed with status code 400" instead of the real reason.

Write the message for the person using the app, not a stack trace — e.g.
`"Field 'email' must be a full email address, e.g. name@example.com"`, not
`"ValidationError: email"`.

### Auth & roles

- Every route that isn't public goes through `requireAuth` (verifies the Supabase session
  token from the `Authorization: Bearer <token>` header, attaches `req.user`).
- Role checks use `requireRole(["admin"])` and read `req.user.app_metadata.role` — never a
  client-supplied role value. Roles live in `server/src/constants/roles.js`
  (`admin` / `advisor`); clients have no staff role. `provider` is **not** a login role —
  it's the mocked external insurer/integration layer (see `docs/system_requirments.md`),
  never a value in `app_metadata.role`.
- Never trust anything about identity/permissions that came from the request body.

### No hardcoding

- No literal API keys, URLs, bucket names, or role lists inline in code. They come from
  `process.env.*` (backend) or a `constants/` file, never copy-pasted in two places.
- If a value is genuinely fixed (an enum like the 5 document types, or the storage bucket
  default), it lives once in `constants/`, and everything else imports it.
- Every secret (`SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, etc.) is backend-only, lives
  in `server/.env`, and is never sent to the frontend in any API response.

## Frontend

### Styling — plain CSS, no Tailwind/shadcn

The app uses hand-written CSS classes in `client/src/index.css` (design tokens, resets)
and `client/src/App.css` (layout + component classes), **not** Tailwind utility classes or
a component library. Before adding a new class, check whether an existing one already
does what you need: `.card`, `.page-heading`, `.section-heading`, `.stats`, `.two-columns`,
`.detail-row`, `.form-stack`, `.form-grid`, `.badge` (+ `.status-signed` /`.status-sent` /
`.status-flagged` modifiers), `.button` / `.primary`, `.empty`, `.error`, `.auth-notice`,
`.modal-backdrop` / `.modal`.

- New reusable classes go in `App.css`, appended near related classes, in the same
  compact style already there.
- One-off layout tweaks (e.g. a specific width or gap) use an inline `style={{ }}` rather
  than inventing a new single-use class — that's the existing convention (see
  `ClientProfile.jsx`, `ComplianceTracker.jsx`).
- Icons come from `lucide-react`, sized with the `size` prop (`<Users size={18} />`), not
  custom SVGs.

### API layer

All network calls go through `client/src/api/<domain>.js` — never call `axios` (or
`fetch`) directly from a component. Every `api/*.js` file that talks to the Express
backend imports the shared instance from `client/src/api/http.js`, which already attaches
the Supabase session token:

```js
// client/src/api/documents.js
import { http } from "./http";

export async function listDocuments(clientId) {
  const { data } = await http.get(`/api/clients/${clientId}/documents`);
  return data.documents;
}
```

`http.js` also has a response interceptor that rewrites `error.message` to the backend's
actual `{ error: "..." }` body on failure. This is why `catch (error) { setError(error.message) }`
works and shows a real message instead of axios's generic `"Request failed with status code
400"` — every backend error response **must** keep using the `{ error: "message" }` shape
(see Backend error handling below) for this to keep working. Don't add a second, different
error-shape convention on a new route.

**Two valid data-access patterns exist in this codebase — pick the right one:**

1. **Through the Express API** (`api/*.js` → `http.js` → `server/src/routes/...`) — use
   this whenever the operation needs the service-role key, a third-party API (Brevo, PDF
   generation), an admin-level action, or business logic you don't want duplicated/trusted
   client-side. This is how `documents`, `compliance`, and `users` work.
2. **Direct Supabase client + RLS** (`api/clients.js` calling `supabase.from(...)` /
   `supabase.rpc(...)` directly) — acceptable for straightforward CRUD on data the signed-in
   user is allowed to see/edit under Row Level Security, where there's no server-side logic
   needed. This is how `clients` works.

If you're unsure which applies, default to the Express API — it's easier to secure
correctly and keeps business logic in one place.

Either way: **the frontend never uses the Supabase service-role key**, and never embeds a
secret API key (Brevo, etc.) — those calls happen in `server/src/`.

### Data fetching in components

Fetch in a `useEffect`, with a `cancelled`/`active` flag, and call `setState` directly
inside the effect body — either via an inline `.then()/.catch()` chain or an `async`
function *declared inside* the effect. Do **not** call a same-file-scoped named function
that itself calls `setState` from inside the effect — the `react-hooks` lint rule
(`set-state-in-effect`) flags that pattern, and it also just means the fetch isn't
cancellation-safe.

```js
// ✅ matches the codebase (see hooks/useClients.js, ComplianceTracker.jsx)
useEffect(() => {
  let active = true
  listDocuments(clientId)
    .then(docs => { if (active) setDocuments(docs) })
    .catch(error => { if (active) setError(error.message) })
  return () => { active = false }
}, [clientId])
```

To re-fetch after a mutation (e.g. after saving), bump a `reloadKey` state value in the
effect's dependency array rather than calling the fetch function directly from an event
handler.

### Forms

Simple forms (login, add-user) are **uncontrolled**, submitted via `FormData`:

```jsx
async function submit(event) {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  await createStaffUser({ email: data.get('email'), fullName: data.get('full_name') })
}
```

Forms with dynamic/repeating fields (client onboarding) use `react-hook-form`
(`useForm`, `useFieldArray`) — see `pages/ClientForm.jsx`. Don't hand-roll controlled-input
state management for a form that already fits one of these two patterns.

### Auth & role gating

- `hooks/useAuth.js` + `context/AuthContext.jsx` expose the current Supabase `session`.
- Route-level gating uses `<ProtectedRoute>` (`staffOnly`, `adminOnly`, `excludeAdmin`
  props), not ad hoc checks scattered in page components. There are only two staff roles
  (`admin`, `advisor`), so `staffOnly excludeAdmin` is how the advisor workspace excludes
  admin, and `staffOnly adminOnly` is how the admin area excludes everyone else.
- Role checks (`isStaff`, `isAdmin`) live in `lib/authRoles.js` — always import from there
  rather than re-checking `user.app_metadata.role` inline elsewhere.

### Imports

Use relative imports (`../lib/supabaseClient`, `./http`) — there's no `@/` path alias
configured for app code despite one existing in `vite.config.js`; don't rely on it.

## Naming

| What | Convention | Example |
|---|---|---|
| React component file | PascalCase.jsx | `DocumentStatusList.jsx` |
| Hook file | camelCase, `use` prefix | `useAuth.js` |
| Backend layer file | `<domain>.<layer>.js` | `documents.service.js` |
| CSS class | kebab-case | `.section-heading` |
| DB column | snake_case | `is_politically_exposed` |
| JS variable/function | camelCase | `getDownloadUrl` |
| Env var (backend) | SCREAMING_SNAKE_CASE | `SUPABASE_SERVICE_ROLE_KEY` |
| Env var (frontend, exposed to browser) | `VITE_` + SCREAMING_SNAKE_CASE | `VITE_SUPABASE_ANON_KEY` |
| Role/enum value | snake_case string | `not_sent`, `client_consent` |

## Environment variables

- Backend secrets live in `server/.env`, read via `process.env.X`. Never commit a real
  key — `server/.env` is gitignored (it was accidentally tracked early on and has since
  been untracked; don't re-add it).
- Frontend env vars live in `client/.env` and **must** be prefixed `VITE_` to be readable
  in the browser (`import.meta.env.VITE_X`) — this also means anything with that prefix is
  publicly visible in the shipped bundle, so only non-secret config (URLs, the Supabase
  *anon* key) belongs there. Never give a secret key the `VITE_` prefix.
- When adding a new required env var, add a placeholder line (with a comment saying where
  to get the real value) to the relevant `.env` file — don't leave teammates guessing the
  variable name.

## Before committing

- `npm run lint` in `client/` — must be clean.
- `npx vite build` in `client/` — must succeed.
- For backend-only changes, at least boot `node server.js` and hit the new route to check
  for wiring/syntax errors — there's no automated backend test suite yet.
