# Claims & client requests

One engine handles every claim type (motor, life, health, funeral, home and possessions, commercial) and every non-claim request (address, bank details, debit order date, beneficiary, policy document, border letter, IRP5, consultation, balance sheet).

What each type needs (the roadside checklist, form fields, required documents, and its step list) is **configuration in the database**, not code. The tables are `claim_categories`, `request_types` and `claim_stages`. Adding a claim type or changing what Life requires is a data change.

Only the motor workflow comes from the Royal Square brief. The other categories are seeded with typical South African claim requirements; confirm them with Royal Square.

## Setup

1. Run `supabase/migrations/202609190003_claims_and_requests.sql` in the Supabase SQL editor, after 0001 and 0002. It is safe to re-run. It also creates the private `task-files` storage bucket.
2. Make sure `server/.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The build script adds `TASK_FILES_BUCKET=task-files` if it's missing.
3. `npm run dev` from the repo root, which starts the server and the client.
4. **Link a client login.** A client signs up at `/signup`. On that client's profile, the adviser opens **Client login** under "Claims & requests" and links the email. Until then, the client portal says "Your account is not linked yet".

## Where things are

| Who | Screen | Path |
| --- | --- | --- |
| Client | My claims & requests | `/account/claims` |
| Client | Report a claim (category, roadside checklist for motor, details, documents) | `/account/claims/new` |
| Client | Ask for something (non-claim request) | `/account/requests/new` |
| Client | Track one item: steps, "Needs you" actions, messages, documents | `/account/tasks/:id` |
| Adviser | Queue: open, waiting on us, waiting on client, overdue, closed | `/tasks` |
| Adviser | Work one item: next step, simulate insurer, close/decline, internal notes, provider feed | `/tasks/:id` |
| Adviser | Log a request for a client (arrived by email/phone) | `/tasks/new` |
| Adviser | Client profile: that client's claims + client-login link | `/clients/:id` |

## How a claim moves

- Submitting a claim sends it to the mock insurer. The insurer returns a claim number and a claims handler, which is step 1 for every category. Both sides of the exchange are logged in `provider_events` and shown as the "<Insurer> feed" on the adviser screen.
- Steps have an actor: client, adviser or provider.
  - **Client steps** (pick a repair date, confirm the car went for assessment, upload documents, final review) show as a red **Needs you** card for the client.
  - **Provider steps** are advanced with **Simulate <insurer> update**. Weekly repair updates repeat without moving the step on.
  - **Adviser steps** are the **Next step** button.
- **Finish and ask for review** moves a claim to its last step, where the client rates and closes it. **Close as done** completes a request. Some requests also update the client record on close: address, bank details, debit order day, and new balance-sheet items.
- **Declined** is a separate outcome, never a step in the progress bar.
- Motor claims create a 48-hour police-report reminder when the client says the police were not yet notified.
- Clients never see internal notes or the provider feed. Files are in a private bucket and opened through 10-minute signed links.

## Demo script (about 3 minutes)

1. Client: **Report an accident or loss** → Motor. Tick a few checklist items and add a photo → **Save and continue** → choose Santam, fill the form → **Submit claim**. It shows step 1 of 10 with a Santam claim number and handler.
2. Adviser: `/tasks` shows the claim at the top. Open it → **Ask the client: Client takes the vehicle for assessment**.
3. Client: the **Needs you** card → **Done**.
4. Adviser: **Simulate Santam update** (assessment) → **Repair quotes go to the insurer** → **Simulate Santam update** (authorised) → **Ask the client: pick a date**.
5. Client picks a date. Adviser: car hire → simulate twice (weekly repair updates) → hire car returned → **Finish and ask for review**.
6. Client: 5 stars → closed. For a second category, run **Life** to its upload step, or a **Change of bank details** request and show the client record updating when it's closed.

## Tests

- `npm test --prefix server` runs the workflow rules (steps, progress, waiting-on, overdue, form validation).
- `npm test --prefix client` runs the display helpers.
