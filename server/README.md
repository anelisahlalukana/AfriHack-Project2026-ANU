# Royal Square API (`server/`)

The Express API behind the client app. It holds the Supabase service-role key, talks to Brevo and
the browser push services, enforces roles on every request, and runs the reminder scheduler. The
project overview is in the [root README](../README.md); how it fits together is in
[docs/architecture.md](../docs/architecture.md); the routes are in [docs/api.md](../docs/api.md).

## Run it

```sh
npm ci
npm run dev          # nodemon, http://localhost:5000
npm start            # plain node
npm run dev:demo     # reminders module on a local demo store (see below)
```

Check it is up: `GET http://localhost:5000/api/health` returns `{ "status": "Server is running" }`.

It needs a `server/.env` (an optional `.env.reminders.local` is read first). At minimum:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Every variable, with defaults, is in the table in the [root README](../README.md#configuration).
Keep the client's `VITE_API_BASE_URL` pointing at the same port as `PORT` (default 5000). The
service-role key must never be given to the client.

## Layout

```
server.js          entry: CORS, push setup, routes, reminder scheduler
src/
  routes/          HTTP verb and path only
  controllers/     read the request, call one service, return JSON
  services/        business logic and every Supabase or third-party call
  middleware/      auth (requireAuth, requireRole, requireClientAccess) and validation
  config/          the Supabase service-role client
  constants/       shared enums and thresholds (roles, documents, dashboard, tasks)
  reminders/       reminders, notifications and push module, with a local demo store
  reports/         AI-assisted reports: templates, scope, model client
  utils/           stateless helpers (email, errors, PDF, names)
scripts/           admin and demo scripts
tests/, __tests__/ server tests
```

Follow routes, then controllers, then services, each in its own file. Every error response is
`{ "error": "message" }`. See [docs/coding-standards.md](../docs/coding-standards.md).

## Scripts

Run these from `server/`. They use the same `.env` as the API.

| Command | What it does |
| --- | --- |
| `npm run create-admin -- "email" "Full Name"` | Creates the first admin and emails a password-setup link (needs Brevo) |
| `node scripts/create-provider-login.js "email" "Full Name" "Old Mutual"` | Creates an insurer portal login for one of the seeded insurers |
| `npm run seed:demo -- --yes` | Adds fictional data across the workspace. Also `--fresh`, `--reset`, `--clients=`, `--demo-password=`. Refuses in production. See [docs/demo-data.md](../docs/demo-data.md) |
| `npm run push:keys` | Generates a VAPID key pair for push notifications. See [docs/pwa.md](../docs/pwa.md) |
| `node scripts/check-shared-db.js` | Read-only check that the credentials and schema work. Prints no keys or client data |
| `node scripts/e2e-reminders.js --yes` | End-to-end test of reminders and push against the **real** project, using throwaway accounts that it deletes afterwards |

## Tests

```sh
npm test         # unit tests, no database needed
npm run lint
```

`npm test` runs `node --test tests/*.test.js __tests__/*.test.js`. The tests use in-memory fakes for
Supabase, so they need no network and no credentials, and they run on every pull request in CI.

## Demo mode

`--demo` only replaces the **reminders** backend with a local JSON store and a few built-in demo
users (a request header picks which one you are). It does not stub the rest of the API: everything
else still needs a real Supabase project. Demo mode refuses to start when `NODE_ENV=production`.

## Background work

On start-up the server runs the reminder tick once and then every `REMINDERS_TICK_MS` (default
30000 ms): it fires due reminders and delivers waiting push messages. The two steps are independent,
so a failure in one does not hold back the other. If the VAPID variables are only partly set, or invalid, the server logs `Push notifications are OFF` and carries on; with none set it is silent. Either way push simply reports as not set up.
