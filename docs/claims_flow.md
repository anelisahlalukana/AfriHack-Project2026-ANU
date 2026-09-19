# Claims & client requests

One engine handles every claim type (motor, life, health, funeral, home and possessions, commercial) and every non-claim request (address, bank details, debit order date, beneficiary, policy document, border letter, IRP5, consultation, balance sheet).

What each type needs (the roadside checklist, form fields, required documents and its step list) is **configuration in the database**, not code: the tables are `claim_categories`, `request_types` and `claim_stages`. Only the motor workflow comes from the Royal Square brief. The other categories are seeded with typical South African claim requirements; confirm them with Royal Square.

## Who is who

- **Clients** are `public.users` rows with `role_id` 1. An adviser adds them at `/clients/new`, which also creates their login (`users.auth_user_id`). Clients sign in with their ID number and land on `/account/claims`.
- **Advisors** (`app_metadata.role = 'advisor'`) work every claim and request for the clients assigned to them.
- **Admins** manage staff accounts only and can't open client claims, the same rule as the FNA data.
- **Product providers** (Santam, Sanlam and others) are the mocked insurers: `public.users` rows with `role_id` 2 and an `organisation_name`. They never log in.

## Setup

1. Run `supabase/migrations/202609190005_claims_and_requests.sql` in the Supabase SQL editor, after 0001–0004. It is safe to re-run, seeds the providers, and creates the private `task-files` storage bucket. It replaces the earlier `202609190003_claims_and_requests.sql`, which targeted the old `clients`/`providers` tables and can't run on the current schema.
2. `server/.env` needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `TASK_FILES_BUCKET` defaults to `task-files`.
3. Run `npm run dev` from the repo root, which starts the server and the client.

## Where things are

| Who | Screen | Path |
| --- | --- | --- |
| Client | My claims & requests (lands here after sign-in) | `/account/claims` |
| Client | Report a claim (type, roadside checklist for motor, details, documents) | `/account/claims/new` |
| Client | Ask for something (non-claim request) | `/account/requests/new` |
| Client | Track one item: steps, "Needs you" actions, messages, documents | `/account/tasks/:id` |
| Advisor | Queue: open, waiting on us, waiting on client, overdue, closed | `/tasks` |
| Advisor | Work one item: next step, simulate insurer, close/decline, internal notes, provider feed | `/tasks/:id` |
| Advisor | Log a request for a client (arrived by email/phone) | `/tasks/new` |
| Advisor | That client's claims and requests, on their profile | `/clients/:id` |

## Code layout

- **Server:** `routes/tasks.routes.js` and `routes/catalog.routes.js` → `controllers/tasks.controller.js` and `controllers/catalog.controller.js` → `services/`:
  - `tasks.service.js` is the engine.
  - `taskAccess.service.js` works out who may see what.
  - `workflow.service.js` handles stage moves.
  - `mockProvider.service.js` is the fake insurer.
  - `catalog.service.js` serves the configuration.
  - `requestEffects.service.js` updates the client record.

  Request checks are in `middleware/validate.js` (the `validateTask*` functions); uploads in `middleware/upload.js`.
- **Client:**
  - `api/tasks.js`, `hooks/useTasks.js` and `lib/taskFormat.js`
  - `components/tasks/*`
  - `pages/Tasks.jsx` and `pages/claims/*`
  - Styles are the `claims & requests` block at the end of `App.css`.

## How a claim moves

- **Submitting a claim sends it to the mock insurer.** The insurer returns a claim number and a claims handler, which is step 1 for every category. Both sides of the exchange are logged in `provider_events` and shown as the "<Insurer> feed" on the advisor screen.
- **Every step has an actor: client, adviser or provider.**
  - **Client steps** (pick a repair date, confirm the car went for assessment, upload documents, final review) show as a red **Needs you** card.
  - **Provider steps** are advanced with **Simulate <insurer> update**. Weekly repair updates repeat without moving the step on.
  - **Adviser steps** are the **Next step** button.
- **Finishing:** **Finish and ask for review** moves a claim to its last step, where the client rates and closes it. **Close as done** completes a request. Address, bank details, debit order day and balance-sheet requests also update the client's `users` row when they're closed.
- **Declined is a separate outcome**, never a step in the progress bar.
- **Police reminder:** motor claims create a 48-hour police-report reminder when the client says the police weren't notified yet.
- **Privacy:** clients never see internal notes or the provider feed. Files live in a private bucket and are opened through 10-minute signed links.

## Demo script (about 3 minutes)

1. **Advisor:** add a client at `/clients/new`. The client finishes registration from the email and signs in with their ID number.
2. **Client:** **Report a claim** → Motor. Tick a few checklist items and add a photo → **Save and continue**. Choose Santam, fill in the form, then **Submit claim**. It shows step 1 of 10 with a Santam claim number and handler.
3. **Advisor:** `/tasks` shows the claim at the top. Open it, then **Ask the client: Client takes the vehicle for assessment**.
4. **Client:** the **Needs you** card → **Done**.
5. **Advisor:** **Simulate Santam update** → **Repair quotes go to the insurer** → **Simulate Santam update** → **Ask the client: pick a date**.
6. **Client:** picks a date. **Advisor:** car hire → simulate twice (the second is a weekly repair update) → hire car returned → **Finish and ask for review**.
7. **Client:** gives a rating, and the claim closes. For a second category, run Life to its upload step, or a **Change of bank details** request, and show the client profile updating when it's closed.

## Tests

- `npm test --prefix server`: the workflow rules (steps, progress, waiting-on, overdue, form validation).
- `npm test --prefix client`: the display and form helpers.
