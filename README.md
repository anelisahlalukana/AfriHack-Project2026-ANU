# Royal Square Financial

An adviser workspace, client portal and insurer portal for a South African financial advisory
practice, built for AfriHack 2026. Advisers manage their client book, paperwork, claims and
compliance in one place. Clients sign documents, log claims, ask for changes and get reminders on
their phone. Insurers work the claims and requests sent to them. The whole app installs to a phone
home screen and can send push notifications.

> **Status: prototype.** The insurer systems are mocked, there is no live PEP or terrorism-financing
> screening provider, and the consent-renewal and CPD rules are placeholder policies. See
> [Known limits](#known-limits).

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [How it fits together](#how-it-fits-together)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Commands](#commands)
- [Testing and CI](#testing-and-ci)
- [Deployment](#deployment)
- [Installable app (PWA)](#installable-app-pwa)
- [People and where they land](#people-and-where-they-land)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Known limits](#known-limits)

## What it does

| Who | What they can do |
| --- | --- |
| **Advisers** | See the whole practice on a live dashboard (what needs attention, work over time, risk mix). Rank clients by risk of disengaging (**Client Pulse**) and send a check-in. Capture each client's financial needs analysis: profile, dependants, assets, liabilities, income, expenses and goals. Send the five compliance documents. Work every claim and request through its stages. Track consent, screenings and CPD. Set reminders. Ask questions in plain English on **Reports**. Browse the audit log. |
| **Clients** | Sign in with their ID number. See what needs doing today, their net worth and goals. Sign or acknowledge documents in the app, or download, sign and upload them back. Report a claim with a guided roadside checklist. Ask for a change of address, bank details or a policy document through a chat. Track everything through to completion. Receive reminders and push alerts. |
| **Insurers** | A separate portal at `/provider`. Each insurer sees only what was sent to it: complete its steps, post updates, decline with a reason, reassign the claims handler, exchange files and messages with Royal Square. |
| **Admins** | Create and manage staff and insurer logins, run reports across every adviser's book and read the full audit log. Admins never see client financial data. |

Clients and the workspace both work on a phone. There is a light and a dark theme.

## Tech stack

| Layer | Built with |
| --- | --- |
| Client | React 19, Vite 8, React Router 7, Recharts, react-hook-form, axios, lucide-react, plain CSS |
| Server | Node.js, Express 5, `@supabase/supabase-js` (service role), pdf-lib, multer, web-push |
| Data | Supabase: Postgres with row-level security, Auth and Storage |
| Email | Brevo transactional email (invitations, verification codes, password setup) |
| AI (optional) | Google Gemini for report wording; everything works without it |
| Tests | `node:test` (server and client logic), Vitest with Testing Library (components), ESLint |
| Delivery | GitHub Actions for CI, Vercel for the client, Render for the server |

## How it fits together

```
                  ┌──────────────────────────────────────────────────────────┐
  Browser / PWA   │  React single-page app (client/)                         │
  (phone, laptop) │  service worker: app shell offline + push notifications  │
                  └───────┬───────────────────────────────┬──────────────────┘
                          │ REST + Bearer token           │ supabase-js (RLS)
                          ▼                               ▼
                  ┌───────────────────┐          ┌────────────────────┐
                  │  Express API      │─service─►│  Supabase          │
                  │  (server/)        │   role   │  Postgres · Auth · │
                  │  + reminder tick  │          │  Storage           │
                  └──┬────────┬───────┘          └────────────────────┘
                     │        │
        Brevo (email)│        │web-push ──► browser push services
                     │        └── Gemini (optional report wording)
```

- The browser talks to **Supabase directly** only for straightforward reads and edits that row-level
  security can protect, such as the adviser's client list and financial needs analysis.
- Everything that needs the service-role key, an outside service or real business logic goes through
  the **Express API**: registration, documents and signing, claims, dashboards, compliance, reports
  and push. The API checks the caller's Supabase session on every request and enforces their role.
- One process also runs the **reminder scheduler**: every 30 seconds it fires due reminders and
  delivers waiting push messages.

More detail is in [docs/architecture.md](docs/architecture.md).

## Repository layout

```
client/            React app (Vite)
  public/          manifest.webmanifest, sw.js (service worker), icons, brand images
  src/
    pages/         one file per route, grouped by role: advisor/, client/, provider/, admin/, claims/
    components/    reusable UI, grouped by feature (documents/, dashboard/, reminders/, ...)
    api/           one file per backend resource; axios calls only
    hooks/         reusable stateful logic
    lib/           pure helpers (formatting, table logic, PWA plumbing)
  tests/           unit tests (node --test) and tests/component (Vitest)
server/            Express API
  server.js        entry point: routes, CORS, push setup, reminder scheduler
  src/
    routes/        HTTP verb and path only
    controllers/   read the request, call one service, return JSON
    services/      business logic and every Supabase or third-party call
    middleware/    auth, role and client-access checks, request validation
    reminders/     reminders, notifications and push module
    reports/       AI-assisted reports: templates, scope, model client
  scripts/         admin and demo scripts (see server/README.md)
  tests/           server tests
supabase/          SQL migrations
docs/              project documentation (start at docs/README.md)
.github/workflows/ CI, deploy and release-PR workflows
```

## Getting started

You need **Node.js 24** (what CI runs; 22.13 or newer also satisfies the toolchain), npm, and a
**Supabase project**. There is no offline or in-memory mode for the whole app: it reads and writes a
real Supabase project. Brevo and Gemini are optional for local work.

1. **Install**

   ```sh
   npm ci --prefix server
   npm ci --prefix client
   ```

   The `package.json` at the repository root is only a placeholder. There is no root-level dev
   script, so run everything with `--prefix` or from inside `client/` and `server/`.

2. **Configure.** Copy `client/.env.example` to `client/.env.local` and create `server/.env`. The
   variables are listed under [Configuration](#configuration). The service-role key belongs in
   `server/.env` only, never in a client file.

3. **Prepare the database.** The tables are described in [docs/schema.md](docs/schema.md) and the
   migrations in `supabase/migrations/`. The migration history is not a complete bootstrap for an
   empty database, so follow [docs/setup.md](docs/setup.md) for the order and the cautions.

4. **Run the server and the client** in two terminals:

   ```sh
   npm run dev --prefix server      # http://localhost:5000
   npm run dev --prefix client      # http://localhost:5173
   ```

   Check the API at `http://localhost:5000/api/health`.

5. **Create the first admin**, who can then add everyone else from `/admin/users`:

   ```sh
   npm run create-admin --prefix server -- "you@example.com" "Your Name"
   ```

   This needs Brevo configured, because it emails a password-setup link. Advisers, insurers and
   clients are created from inside the app. See [docs/setup.md](docs/setup.md) for roles.

6. **Optional: demo data**, so the dashboard, Client Pulse, reports and claims pages have something
   to show. It refuses to run in production.

   ```sh
   npm run seed:demo --prefix server -- --yes
   ```

   Options are in [docs/demo-data.md](docs/demo-data.md).

## Configuration

**Server** (`server/.env`). An optional `server/.env.reminders.local` is read first.

| Variable | Needed | Default | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | yes | | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | | Service-role key. Server only; bypasses row-level security |
| `PORT` | no | `5000` | Port the API listens on |
| `CLIENT_ORIGIN` | no | `http://localhost:5173` | The site allowed to call the API (CORS). Set it to the deployed client URL |
| `CLIENT_APP_URL` | no | `http://localhost:5173` | Base URL in emailed client links |
| `ADMIN_INVITE_REDIRECT_URL` | no | `http://localhost:5173/reset-password` | Where staff password-setup links land |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | for email | name: `Royal Square Financial` | Invitations, verification codes and password setup |
| `DOCUMENT_TEMPLATES_BUCKET` | no | `document-templates` | Storage bucket holding the PDF templates |
| `CLIENT_DOCUMENTS_BUCKET` | no | `client-documents` | Private bucket for filled and signed documents |
| `TASK_FILES_BUCKET` | no | `task-files` | Bucket for claim and request attachments |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | | Web push identity. Generate with `npm run push:keys --prefix server` |
| `REMINDERS_TICK_MS` | no | `30000` | How often reminders fire and push messages are sent |
| `GEMINI_API_KEY` | no | | Enables model-written report titles and wording. Without it, reports use built-in fallbacks |
| `GEMINI_MODEL` | no | `gemini-2.5-flash` | Model used for reports |
| `REPORTS_LLM_TIMEOUT_MS` | no | `10000` | Hard timeout for the model call |
| `DEMO_ADVISER_PASSWORD` | no | | Password for demo advisers created by `seed:demo` |
| `NODE_ENV` | no | | `production` disables demo mode and simulated screening flags |

**Client** (`client/.env.local`). These are read at build time and end up in the browser, so nothing
secret goes here.

| Variable | Needed | Default | Purpose |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | | Publishable (anon) key |
| `VITE_API_BASE_URL` | no | `http://localhost:5000` | URL of the Express API |

## Commands

Run each from the repository root with `--prefix`, or from inside the folder.

| Command | What it does |
| --- | --- |
| `npm run dev --prefix client` | Start the client with hot reload |
| `npm run build --prefix client` | Production build into `client/dist` |
| `npm run preview --prefix client` | Serve the production build (use this to try the PWA) |
| `npm run lint --prefix client` | ESLint |
| `npm test --prefix client` | Unit tests, then component tests |
| `npm run dev --prefix server` | Start the API with nodemon |
| `npm start --prefix server` | Start the API |
| `npm run dev:demo --prefix server` | Start with the reminders module on a local demo store |
| `npm run lint --prefix server` | ESLint |
| `npm test --prefix server` | Server tests (no database needed) |
| `npm run push:keys --prefix server` | Generate a VAPID key pair |
| `npm run create-admin --prefix server -- "email" "Name"` | Create the first admin |
| `npm run seed:demo --prefix server -- --yes` | Add demo data |

More scripts, such as creating an insurer login, are described in [server/README.md](server/README.md).

## Testing and CI

```sh
npm run lint --prefix client && npm test --prefix client && npm run build --prefix client
npm run lint --prefix server && npm test --prefix server
```

The same checks run on every pull request into `development` or `main`. A single **CI passed**
check summarises them and is the one branch protection requires. The client tests cover pure logic
(`client/tests/*.test.js`) and rendered components (`client/tests/component/`). The server tests
need no database. Details are in [docs/ci-cd.md](docs/ci-cd.md).

## Deployment

Nothing is pushed straight to `development` or `main`: work goes in through pull requests that pass
CI.

- **Client:** Vercel deploys it through its own Git integration (a preview on every pull request,
  production on `main`). The Vercel project root is `client/`.
- **Server:** on a push to `main`, GitHub Actions runs CI again and then calls a Render deploy hook.
  Render's own Auto-Deploy must be switched off, otherwise the CI gate means nothing.

Secrets, branch protection and rollbacks are in [docs/ci-cd.md](docs/ci-cd.md).

## Installable app (PWA)

The app installs from the browser to a phone home screen or a desktop dock and opens without
browser chrome. It caches its own shell so it starts offline, and it delivers push notifications
for reminders. Signed-in data is never cached: an offline app opens, but its pages need the network
to load anything. Two habits matter:

- **Bump `VERSION` in `client/public/sw.js` on every release**, so devices drop the old caches and
  pick up the new build.
- **Use HTTPS in production.** Installing and push both need it (`localhost` is exempt).

The service worker only registers in production builds. Try it with `npm run build --prefix client`
then `npm run preview --prefix client`. How it works, how push is wired, how to test it and what to
do when it misbehaves are in [docs/pwa.md](docs/pwa.md).

## People and where they land

| Person | Signs in with | Lands on |
| --- | --- | --- |
| Adviser | Email address and password | `/` (dashboard) |
| Admin | Email address and password | `/admin` |
| Insurer | Email address and password | `/provider` |
| Client | 13-digit ID number and password | `/account` |

Roles are set in the Supabase Auth user's **app metadata** (`role` is `advisor`, `admin` or
`provider`), never in user metadata, which people can edit themselves. An account with no staff role
is treated as a client. There is no public sign-up: advisers add clients, and admins add staff and
insurer logins.

## Documentation

Everything is indexed in [docs/README.md](docs/README.md). The most useful starting points:

| Read | For |
| --- | --- |
| [docs/setup.md](docs/setup.md) | Database, migrations, roles, environment and verification checks |
| [docs/architecture.md](docs/architecture.md) | How the pieces fit, who can see what, background work |
| [docs/api.md](docs/api.md) | Every API route, its access rule and what it does |
| [docs/pwa.md](docs/pwa.md) | Install, offline, service worker and push notifications |
| [docs/dashboard-and-client-pulse.md](docs/dashboard-and-client-pulse.md) | The adviser dashboard and the Client Pulse scoring |
| [docs/claims_flow.md](docs/claims_flow.md) | The claims and requests engine and the insurer portal |
| [docs/reports.md](docs/reports.md) | AI-assisted reports |
| [docs/demo-data.md](docs/demo-data.md) | Seeding fictional data |
| [docs/ci-cd.md](docs/ci-cd.md) | CI, deployment, secrets and rollbacks |
| [docs/coding-standards.md](docs/coding-standards.md) | The patterns to follow when changing code |
| [docs/schema.md](docs/schema.md) | The database schema |

## Contributing

- Branch from `development`, open a pull request, and merge only when **CI passed** is green.
  `development` is released to `main` by pull request too.
- Follow [docs/coding-standards.md](docs/coding-standards.md): routes, then controllers, then
  services on the server; plain CSS and the `api/` layer on the client; no secrets in code.
- Before committing: lint, tests and the client build (see [Testing and CI](#testing-and-ci)).
- If you change behaviour, a route, a setting or a script, update the matching doc in the same pull
  request.

## Known limits

- **Insurers are mocked.** Registering a claim and acknowledging a request happen automatically on
  submit. Everything an insurer does happens in the provider portal.
- **No live screening.** No PEP or terrorism-financing provider is connected: the screening endpoint
  returns a 503 and simulated results can never clear a client. CPD and qualifications are
  self-recorded. A "compliant" badge covers the tracked controls only.
- **Prototype policies.** Annual consent renewal and an 18-hour CPD target are placeholders awaiting
  Royal Square's confirmation.
- **Documents.** A signed copy overwrites the previous one; there is no version history.
- **Offline.** The PWA opens offline but does not keep data or queue actions; see
  [docs/pwa.md](docs/pwa.md).
- **Financial data pull** is gated by a real, unexpired client consent, but the data it stores comes
  from a fictional provider.
