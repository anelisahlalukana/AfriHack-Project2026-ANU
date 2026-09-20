# AI-assisted reports

Advisers and admins type a plain-English question on **Reports** (`/reports`, `/admin/reports`),
get a live chart from Supabase, and can turn it into a short written report (Download PDF uses
the browser's print dialog, "Save as PDF").

## How it works

| Piece | File |
|---|---|
| Templates (30 fixed reports, each a scoped query builder) | `server/src/reports/templates.js`, `templates.extra.js`, `templates.money.js` |
| Scope: who the caller is and which clients they may see | `server/src/reports/scope.js` |
| Parameter schema and validation | `server/src/reports/params.js` |
| Keyword fallback + relative-date parsing | `server/src/reports/keywords.js` |
| Gemini client (server only, hard timeout) | `server/src/reports/llm.js` |
| Prompts | `server/src/reports/prompts.js` |
| Privacy guards (redaction, payload check) | `server/src/reports/privacy.js` |
| Service / controller / routes | `server/src/services/reports.service.js`, `controllers/reports.controller.js`, `routes/reports.routes.js` |
| Page, chart, API, helpers | `client/src/pages/advisor/Reports.jsx`, `Reports.css`, `components/reports/ReportChart.jsx`, `api/reports.js`, `lib/reportFormat.js` |

Endpoints (all `requireAuth` + `requireRole(["advisor","admin"])`, mounted at `/api/reports`):

- `GET /templates` – the list behind the chips and "Browse all reports".
- `POST /ask { question }` – intent model picks a template (falls back to keyword match), runs it.
- `POST /run { template_id, parameters }` – runs a template directly. No model; chips always work.
- `POST /generate { template_id, parameters }` (or `{ query }`) – re-runs the query server-side, then builds
  the written report: up to three key figures, a short two-paragraph story (what happened, then what the
  related charts add and what to do), the main chart, one or two related charts
  (`server/src/reports/related.js`), and a closing "What this means for the business" paragraph
  (`meaning`) – how healthy the result is, what it does to revenue, retention, workload, provider
  dependency or regulatory exposure, and the decision or next step the numbers support. The model sees
  only aggregated rows of the main and related charts; without it the story and the business reading are
  written from the figures (`fallbackMeaning`, framed per report category by `CATEGORY_LENS`). Percentage
  splits are withheld below `MEANINGFUL_COUNT` records, so thin data is never presented as a pattern.

## Configuration (`server/.env`)

```
GEMINI_API_KEY=...            # Google AI Studio key (free Flash tier). Leave unset to run on fallbacks only.
GEMINI_MODEL=gemini-2.5-flash # optional
REPORTS_LLM_TIMEOUT_MS=10000  # optional; keep below the browser's 15s timeout
```

Without a key, or if Gemini is slow or returns bad JSON, intent falls back to keyword matching
("Closest match" label), and the narrative and the business reading are templated from the top rows.
A model reply that omits `meaning` keeps its own story and takes the templated business reading, so the
section is always present.

## Scope and privacy

- Scope comes from `req.user.app_metadata.role`. An adviser only reaches their own clients
  (`users.advisor_id = auth.uid`), whatever `advisor_id` the request or the model supplies.
  Admins see every adviser's book and may narrow it with `advisor_id`.
- The model only ever receives the question (with client names, 13-digit ID numbers, emails
  and phone numbers redacted) and aggregated rows (counts, averages, category labels). Decline
  notes are bucketed server-side and never sent. The consent pipeline sends date-bucket counts;
  client names appear only in the browser. A final check refuses to send any payload that still
  contains a client name or ID number.

## Schema check (templates → tables)

| Template | Tables / columns used | Gaps |
|---|---|---|
| claims_by_status | `tasks` (task_type='claim', status, created_at, claim_category), `users` (advisor_id) | none |
| avg_time_to_close | `tasks` (submitted_at, closed_at, status='completed', task_type, provider_id), `users` (organisation_name) | none |
| overdue_reminders | `reminders` (trigger_date, status, reminder_type, client_id), `users.advisor_id`, auth user names | none. "Overdue" = trigger_date before today and status pending/active/notified |
| goal_progress | `client_goals` (target_amount, current_progress, target_date, goal_type, status) | **`client_goals` has no created_at**, so the client's `users.created_at` is used as the goal's start date |
| declined_claims_by_reason | `tasks` (status='declined', closed_at), `provider_events` (event_type='declined', payload.note), `task_updates` (note) | none |
| task_volume_trend | `tasks` (created_at, task_type, claim_category) | none |
| document_completion | `documents` (document_type, status signed/filed) × the 5 types in `constants/documentTypes.js` | none |
| net_worth_distribution | `client_financial_items` (category asset/liability, amount) | none |
| provider_responsiveness | `provider_events` (direction, event_type, created_at, provider_id), `tasks` | none. The mocked instant acknowledgements (`claim_registered`, `request_acknowledged`) are not counted as replies |
| consent_expiry_pipeline | `documents` (client_consent, signed_at, expires_at) via `consentState()` | none |

Optional migration (not applied; only needed for exact goal start dates):

```sql
ALTER TABLE public.client_goals ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
```

## All reports (30)

Suggested-question chips show the featured ones (★); "Browse all reports" lists every report by area.

| Area | Report | Answers |
|---|---|---|
| Claims & requests | ★ claims_by_type | Claims per product line (motor, funeral, life…) split by status, with decline rates |
| | ★ claims_by_status | Open / waiting on client / completed / declined / cancelled |
| | ★ claims_by_provider | Claims per insurer and how many each declined |
| | ★ stuck_tasks | Open items idle for N+ days, oldest first (table; names in UI only) |
| | ★ avg_time_to_close | Days from submission to completion, by provider or type |
| | requests_by_type | Service requests (address, bank details…) by type and status |
| | work_waiting | Open work by age, waiting on us vs the client |
| | client_satisfaction | Average client rating by provider or type |
| | adviser_workload | Open work per adviser (admin) or per type (adviser) |
| | declined_claims_by_reason | Decline notes bucketed into documents / exclusion / lapsed / other |
| | task_volume_trend | Claims and requests per week or month |
| | provider_responsiveness | Hours from our message to the provider's next reply |
| Clients | clients_by_status | Onboarding / active / inactive |
| | risk_profile_mix | Risk profile categories, including not assessed |
| | new_clients_trend | New clients per week or month |
| Money & goals | ★ claim_amounts_by_type | Average claimed and paid per product line * |
| | ★ claim_value_trend | Rand claimed and paid out per week or month * |
| | settlement_by_provider | Claimed vs paid, payout rate and declined value per insurer * |
| | monthly_cash_flow | Monthly surplus bands from FNA income and expenses |
| | ★ goal_progress | Goals on track vs behind |
| | goals_by_type | % of target saved per goal type |
| | financial_breakdown | Assets and liabilities by item type (rand totals) |
| | net_worth_distribution | Clients in net-worth bands |
| Compliance | ★ document_completion | Clients with all five onboarding documents signed |
| | ★ consent_expiry_pipeline | Consents expired or expiring within N days (table) |
| | documents_awaiting_signature | Sent-but-unsigned documents by type |
| | screening_results | Latest PEP / terrorism-financing result per client |
| | cpd_progress | CPD hours this cycle against the 18 required |
| Reminders | ★ overdue_reminders | Past-due reminders not completed |
| | upcoming_reminders | Reminders due in the next N days |

\* Needs the claim-amount migration below. Until it is applied these reports show a notice
and everything else keeps working.

### Claim amounts (migration `supabase/migrations/202609200001_claim_amounts.sql`)

The schema had no money on claims, so claim-value reports need two nullable columns:

```sql
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS claimed_amount numeric;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS settled_amount numeric;
```

Apply it in the Supabase SQL editor (it is idempotent). Nothing in the app captures these
amounts yet; `npm run seed:demo` fills them for demo claims. Custom queries can also use them:
"average claim amount per week", "total claimed per provider", "list motor claims over R40k".

## Free-form questions (custom queries)

Questions no prepared report answers ("how many motor claims were declined this year",
"show me open claims with Santam", "average client rating per provider", "list clients who
are onboarding", "claims per month by status", "show me Thandiwe's claims") are answered by a
**custom query** over the records.

- A query is a small JSON spec, never SQL: dataset, filters, group by (or per week/month/year),
  split by, metric (count, number of clients, sum, average, min, max), list-of-records mode.
- Datasets and the only fields they expose (`server/src/reports/datasets.js`): claims, service
  requests, clients (status, risk profile, occupation, marital status, nationality, PEP, age,
  annual income), reminders, documents, goals, assets and liabilities, dependants (relationship
  only, never names), screenings. ID numbers, contact and bank details, addresses, FNA health
  data and free-text notes are not queryable.
- `normalizeQuery()` rejects anything outside that allowlist (unknown dataset or field, wrong
  operator for the type, grouping by client, invalid client ids) with a 400.
- Every dataset loader starts from `scopedClients()`: an adviser's query only ever reads their
  own clients' rows. Model-supplied `client_ids`/`advisor_id` are discarded.
- Client names are matched locally, against the adviser's own clients only, and turned into a
  client filter. The question sent to Gemini has names replaced with `[client]`.
- Gemini sees the dataset/field descriptions (and provider organisation names) and returns
  either a template id or a query spec. Without a key, `queryParser.js` builds the spec
  locally, and the service picks the query only when the question is more specific than the
  best prepared report (filters, a named client, averages/sums, a list, a time series).
- The page shows how the question was read ("Claims · Product line is Motor · Status is
  Declined · Number of claims"), a "Custom query" label, and nearby prepared reports.
- Record lists show up to 100 rows (client names in the browser only). The narrative model only
  gets counts and a breakdown by category, never the rows.
- `POST /api/reports/query { query }` re-runs a spec; `POST /api/reports/generate { query }`
  writes a report from one.

## How questions are matched

1. **Gemini** (when `GEMINI_API_KEY` is set) gets every report's id, label, description, example
   questions and parameters, plus the queryable datasets, and returns
   `{template_id, parameters, confidence}` or `{query, confidence}`.
2. **Keyword fallback** (no key, timeout, bad JSON, unknown id or confidence < 0.45) scores each
   report on its keywords plus similarity to its example questions, after light stemming and
   domain synonyms (insurer→provider, rejected→declined, motor/funeral/life→product line…).
   It gets 60/60 on a tuning set and 20/20 on unseen phrasings (see `server/tests/reports.test.js`).
3. When the match came from keywords, or the model's confidence is under 0.75, the page offers
   the next three reports as "Not what you meant? Try:" buttons.

To teach it a new phrasing, add it to that report's `examples` in `templates.js` /
`templates.extra.js`.

Without a key the written summary is templated, using each report's own insights (e.g. highest
decline rate, stalest item waiting on us, least-funded goal type).
