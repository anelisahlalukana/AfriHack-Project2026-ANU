# Demo data

`server/scripts/seed-demo.js` fills the workspace with fictional data so the dashboard, Client
Pulse, reports, claims queue, compliance and reminders pages all have something to show.

```bash
cd server
npm run seed:demo -- --yes                              # add demo data
npm run seed:demo -- --yes --demo-password='Demo#2026'  # same, and let you sign in as the demo advisers
npm run seed:demo -- --fresh --yes                      # remove it and add it again
npm run seed:demo -- --reset --yes                      # remove it
```

It uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `server/.env`. Run it against a
development or demo project, not production (it refuses when `NODE_ENV=production`).

## What it adds (60 clients by default)

| Area | What you get |
|---|---|
| Advisers | Your existing adviser logins get most of the clients (so you see a full book when you sign in). Two demo advisers (`…@demo.royalsquare.test`) get the rest, so admin views and workload charts have more than one adviser. |
| Clients | Onboarding, active and inactive clients with fictional names, well-formed SA ID numbers, occupations, incomes, risk profiles, marital status and addresses. A few are politically exposed. |
| FNA | Assets (home, car, retirement annuity, pension, unit trusts, savings), liabilities (home loan, vehicle finance, credit card…), income and expenses, sized to each client's income. |
| Goals | Retirement, education, home deposit, emergency fund and other goals, some ahead of schedule and some behind. |
| Dependants | Spouses, children and parents, with beneficiary splits that add up to 100%. |
| Documents | The five onboarding documents: all signed for active clients, a mix of signed/sent/not sent for onboarding ones. Consents are spread so some expire soon and a few already have. |
| Claims and requests | About 2–3 per client over the past year, following the stage lists in `claim_stages`, with a stage history, insurer activity (claim numbers, handlers, replies, declines with reasons) and client ratings. Insurers differ: one is slow to reply, one declines more. If the claim-amount migration is applied, claims also get a claimed amount (sized by product line) and, once settled, a paid-out amount after the insurer's excess. |
| Reminders | Birthdays, annual reviews, valuations and retirement-fee reviews: upcoming, done, and some overdue. |
| Compliance | PEP and terrorism-financing screening results (a few flagged, some not yet run) and CPD hours per adviser (some complete, some behind). |
| Notifications | Recent claim updates for each adviser. |

Options: `--clients=120`, `--advisers=you@example.com,colleague@example.com` (only these real
advisers get demo clients), `--demo-advisers=0..5`, `--seed=7` (the same seed gives the same data).

## How it stays safe

- Everything is fictional; emails use the reserved `.test` domain, so nothing is delivered.
- It reads the stage lists, claim categories, request types, reminder rules and insurers from
  the database, so it follows your project's configuration. It only creates insurers if there
  are none, and names them "… (demo)".
- Past reminders are stored as already notified or completed, and demo notifications are never
  queued for push, so seeding doesn't set off a burst of alerts. Upcoming reminders fire normally
  when they come due, like real ones.
- `--reset` removes only what the seed added (demo clients and everything linked to them, CPD
  entries starting with "Demo:", demo notifications, the demo adviser logins, demo insurers).
  Real clients, real advisers' own CPD entries and your configuration are untouched. The
  compliance audit log is append-only by design, so a demo client someone acted on in the app
  (for example, by running a screening) keeps its row; everything else about it is removed.
- It refuses to seed twice; use `--fresh` to redo it.

Demo clients have no login of their own (the client portal isn't part of the demo data), and
their documents have no signed PDF files behind them.
