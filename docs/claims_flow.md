# Claims & client requests

One engine handles every claim type (motor, life, health, funeral, home and possessions, commercial) and every non-claim request (address, bank details, debit order date, beneficiary, policy document, border letter, IRP5, consultation, balance sheet).

What each type needs (the roadside checklist, form fields, required documents and its step list) is **configuration in the database**, not code: the tables are `claim_categories`, `request_types` and `claim_stages`. Only the motor workflow comes from the Royal Square brief. The other categories are seeded with typical South African claim requirements; confirm them with Royal Square.

## Who is who

- **Clients** are `public.users` rows with `role_id` 1. An adviser adds them with **Add client** on `/clients`, which also creates their login (`users.auth_user_id`). Clients sign in with their ID number, land on `/account`, and open their claims from the **Claims** tab (`/account/claims`).
- **Advisors** (`app_metadata.role = 'advisor'`) work every claim and request for the clients assigned to them.
- **Admins** manage staff accounts only and can't open client claims, the same rule as the FNA data.
- **Product providers** (Santam, Old Mutual and others) are the insurers: `public.users` rows with `role_id` 2 and an `organisation_name`. Each can have provider portal logins: Supabase Auth users with `app_metadata.role = 'provider'` and `app_metadata.provider_id` pointing at that `users` row. A provider login sees only the claims and requests sent to its organisation, and only what it needs: the policyholder's name, the policy number, the claim form, the documents and the steps. It never sees the client's contact details, other products, or Royal Square's messages to the client.
- **What's still mocked:** the insurer's system. Registering a claim (claim number and handler) and acknowledging a request happen automatically on submit. Everything a person at the insurer does happens in the provider portal.

## Setup

1. Run `supabase/migrations/202609190005_claims_and_requests.sql` in the Supabase SQL editor, after 0001–0004. It is safe to re-run, seeds the providers, and creates the private `task-files` storage bucket. It replaces the earlier `202609190003_claims_and_requests.sql`, which targeted the old `clients`/`providers` tables and can't run on the current schema. Then run `202609190006_provider_portal.sql`.
2. Create a provider login: as an admin, go to `/admin/users`, choose the role **Provider** and the insurer (for example Old Mutual). Or, from `server/`, run `node scripts/create-provider-login.js "claims@oldmutual.example" "Thabo Mokoena" "Old Mutual"`. They get the same password-setup email as advisers, then sign in at `/login` with their email address.
3. `server/.env` needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. `TASK_FILES_BUCKET` defaults to `task-files`.
4. Run `npm run dev` from the repo root, which starts the server and the client.

## Where things are

| Who | Screen | Path |
| --- | --- | --- |
| Client | My claims & requests (the **Claims** tab) | `/account/claims` |
| Client | Report a claim (type, roadside checklist for motor, details, documents) | `/account/claims/new` |
| Client | Ask for something (non-claim request) | `/account/requests/new` |
| Client | Track one item: steps, "Needs you" actions, messages, documents | `/account/tasks/:id` |
| Advisor | Queue: open, waiting on us, waiting on client, overdue, closed | `/tasks` |
| Advisor | Work one item: next step, simulate insurer, close/decline, internal notes, provider feed | `/tasks/:id` |
| Advisor | Log a request for a client (arrived by email/phone) | `/tasks/new` |
| Advisor | That client's claims and requests, on their profile | `/clients/:id` |
| Provider | Inbox: needs your action, with the client or Royal Square, closed | `/provider` |
| Provider | Work one item: complete your step, post updates, decline, reassign the handler, documents, messages with Royal Square | `/provider/tasks/:id` |
| Admin | Create advisor, admin and provider logins | `/admin/users` |

## Code layout

- **Server:** `routes/tasks.routes.js` and `routes/catalog.routes.js` → `controllers/tasks.controller.js` and `controllers/catalog.controller.js` → `services/`:
  - `tasks.service.js` is the engine.
  - `taskAccess.service.js` works out who may see what.
  - `workflow.service.js` handles stage moves.
  - `mockProvider.service.js` is the insurer's side: its automatic replies and the steps a provider completes.
  - `providerPortal.service.js` is the provider portal (routes in `routes/provider.routes.js`, mounted at `/api/provider`).
  - `catalog.service.js` serves the configuration.
  - `requestEffects.service.js` updates the client record.

  Request checks are in `middleware/validate.js` (the `validateTask*` functions); uploads in `middleware/upload.js`.
- **Client:**
  - `api/tasks.js`, `hooks/useTasks.js` and `lib/taskFormat.js`
  - `components/tasks/*`
  - `pages/Tasks.jsx` and `pages/claims/*`
  - `pages/provider/*`: the provider portal (`ProviderLayout`, `ProviderInbox`, `ProviderTaskDetail`), with `api/provider.js` and `hooks/useProvider.js`
  - Styles are the `claims & requests` block at the end of `App.css`.

## How a claim moves

- **Submitting a claim sends it to the mock insurer.** The insurer returns a claim number and a claims handler, which is step 1 for every category. Both sides of the exchange are logged in `provider_events` and shown as the "<Insurer> feed" on the advisor screen.
- **Every step has an actor: client, adviser or provider.**
  - **Client steps** (pick a repair date, confirm the car went for assessment, upload documents, final review) show as a red **Needs you** card.
  - **Provider steps** are completed by the insurer in the provider portal with **Done: <step>**. On a repeating step (weekly repair updates) the button is **Post update**, which doesn't move the step on. The advisor sees "Waiting on <insurer>" and can message them from the <insurer> card.
  - The insurer can also **decline** (a reason is required and the client sees it), **reassign the claims handler** (the client is told), **upload documents** (an assessment report, a settlement letter) and **message Royal Square**. Messages both ways stay between the insurer and the advisor.
  - **Adviser steps** are the **Next step** button.
- **Finishing:** **Finish and ask for review** moves a claim to its last step, where the client rates and closes it. **Close as done** completes a request. Address, bank details, debit order day and balance-sheet requests also update the client's `users` row when they're closed.
- **Declined is a separate outcome**, never a step in the progress bar.
- **Police reminder:** motor claims create a 48-hour police-report reminder when the client says the police weren't notified yet.
- **Privacy:** clients never see internal notes or the provider feed. Files live in a private bucket and are opened through 10-minute signed links.

## Demo script (about 3 minutes)

Use three browser windows (or one normal and two private windows): the advisor, the client, and an insurer (for example a Santam provider login).

1. **Advisor:** add a client with **Add client** on `/clients`. The client finishes registration from the email and signs in with their ID number.
2. **Client:** **Report a claim** → Motor. Tick a few checklist items and add a photo → **Save and continue**. Choose Santam, fill in the form, then **Submit claim**. It shows step 1 of 10 with a Santam claim number and handler.
3. **Santam** (`/provider`): the claim is in the inbox. Open it to see the form, the documents and the steps. **Advisor** (`/tasks`): open it and **Ask the client: Client takes the vehicle for assessment**.
4. **Client:** the **Needs you** card → **Done**.
5. **Santam:** **Done** on the assessment step. **Advisor:** **Repair quotes go to the insurer**, then message Santam: "Quotes uploaded, please authorise". **Santam:** reply, then **Done: Insurer authorises repairs**.
6. **Advisor:** **Ask the client: pick a date**. **Client:** picks a date. **Advisor:** car hire. **Santam:** **Done: Weekly repair updates pushed to us** starts the repairs, then **Post update** sends a weekly update, which the client sees. **Advisor:** hire car returned → **Finish and ask for review**.
7. **Client:** gives a rating, and the claim closes. For a second category, run a Funeral claim with Old Mutual: Old Mutual reassigns the handler, the advisor verifies the documents, and Old Mutual marks the benefit paid. Or show Old Mutual declining with a reason.

## Tests

- `npm test --prefix server`: the workflow rules (steps, progress, waiting-on, overdue, form validation).
- `npm test --prefix client`: the display and form helpers.
