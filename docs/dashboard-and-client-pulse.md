# Dashboard and Client Pulse

Three views built from live data: the **adviser dashboard** (`/`), **Client Pulse** (`/client-pulse`)
and the **client home** (`/account`). Every number is computed when it is asked for, so a refresh
always reflects the database as it is now. Thresholds and weights are in one file,
`server/src/constants/dashboard.js`; change them there and nothing else needs to change.

Dates are read in the practice's time zone, `Africa/Johannesburg`.

## The adviser dashboard

`GET /api/dashboard` returns one snapshot (`server/src/services/dashboard.service.js`). The page
(`client/src/pages/advisor/Dashboard.jsx`) loads it, re-checks every 15 seconds while the tab is
showing and immediately when the tab comes back into view, and keeps the last good numbers on
screen if a refresh fails.

### What is on the page

| Panel | Shows | Source |
| --- | --- | --- |
| **Needs attention** (chart) | One bar each for: waiting on us, documents to sign, stalled onboarding, consents to renew, overdue reminders, clients needing a financial analysis. Red means overdue, stalled or expired. Every bar and label opens the page where it is dealt with | The dashboard snapshot |
| **Work over time** (chart) | Claims and requests logged per month, as a filled line, against the same stretch before it as a dashed line. A selector switches between the last 6 and 12 months | The reports engine (see below) |
| **Clients** | Clients by status and how many are fully documented | The snapshot |
| **Money under advice** | Combined net worth, assets against liabilities, goals in progress and how funded they are | The snapshot |
| **Onboarding pipeline** | The longest-waiting onboarding clients: documents signed, what they are waiting on, days onboarding | The snapshot |
| **Compliance and risk** | Your qualification and CPD status, politically exposed clients, and clients by risk profile (each bar opens the Clients table filtered to that profile) | The snapshot |
| **Latest activity** | Your unread and most recent notifications | The snapshot |

### Work over time

This chart does not come from the dashboard snapshot. `useWorkTrend` calls the existing reports
template `task_volume_trend` (`POST /api/reports/run`) twice: once for the last N **completed**
months and once for the N months before. The current month is left out on purpose, because half a
month would always look like a drop. Every task type in a month is added together, and months line
up by position. The chart is scoped by the reports engine like the Reports page: an adviser sees
their own clients.

### Key thresholds

| Setting | Value | Meaning |
| --- | --- | --- |
| `STALLED_ONBOARDING_DAYS` | 14 | A client still onboarding after this long is stalled |
| `CONSENT_EXPIRY_WARNING_DAYS` | 30 | A consent expiring within this many days is flagged |
| `REMINDER_DUE_SOON_DAYS` | 7 | Reminders due within this many days count as due soon |
| `NEW_CLIENT_WINDOW_DAYS` | 30 | The window for "new clients" |
| `ONBOARDING_LIST_LIMIT` | 8 | Rows in the onboarding table |

### Who sees what

The client, goal, document and reminder counts are **practice-wide**. Notifications are the signed-in
adviser's own. **Open requests and claims are scoped to the clients assigned to the signed-in
adviser** (their `advisor_id`), because the task list is. A client with no assigned adviser never
contributes to task-based numbers, on the dashboard or in Client Pulse.

## Client Pulse

Ranks clients by how likely they are to drift away. Each **signal** is one thing going stale for a
client, and a client's **score** is the sum of the weights of every signal that applies. Signals are
worked out in `buildSignals` in `dashboard.service.js`.

| Signal | When it applies | Weight |
| --- | --- | --- |
| Unsigned document | A document was sent to the client and is still unsigned after `UNSIGNED_DOCUMENT_DAYS` (7) | 3 each |
| Overdue reminder | A pending reminder's date has passed | 1 each |
| Stale request or claim | An open request or claim has had no update for `STALE_TASK_DAYS` (7) | 3 each |
| Stalled goal | An in-progress goal has zero progress (no time component) | 2 each |
| Stalled onboarding | Status `onboarding` for at least `STALLED_ONBOARDING_DAYS` (14) | 4, once |

### Levels and the list

| Constant | Value | Effect |
| --- | --- | --- |
| `AT_RISK_MIN_SCORE` | 2 | A client is listed only when their score is **above** this |
| `AT_RISK_HIGH_SCORE` | 5 | Above this is **high**; anything else that is listed is **medium** |
| `AT_RISK_LIST_LIMIT` | 5 | How many clients the ranking returns |
| `CHECK_IN_MAX_REASONS` | 2 | How many reasons a check-in message mentions |

Some consequences worth knowing:

- Two overdue reminders on their own (score 2), or a single stalled goal (score 2), do **not** reach
  the list. A third overdue reminder, or any document or request signal, does.
- Only the top five are shown. The response also carries `flaggedTotal`, the number of clients over
  the threshold, so the page can say "showing the 5 highest-risk of N".
- Ties are broken by name, so the order is stable.
- The list shows each client's heaviest reason plus "+N more". Reasons are sorted heaviest first.

### Pages and API

| Page | Route | API |
| --- | --- | --- |
| The ranking | `/client-pulse` | `GET /api/dashboard/at-risk` |
| A client's drill-down: every signal on a timeline, oldest first, undated signals last | `/client-pulse/:clientId` | `GET /api/dashboard/at-risk/:clientId` |
| **Send a check-in** | Button on the drill-down | `POST /api/dashboard/at-risk/:clientId/check-in` |

The drill-down works for any client, flagged or not, so it still opens if a client drops off the
ranking between refreshes. All of these are adviser-only.

### The check-in

Sending a check-in creates an in-app notification for the client titled "Your adviser is checking
in". The text is built on the server from the client's **current** top signals, in the client's own
words (for example "the Client Consent is waiting for your signature"), and never comes from the
request. If the notification could not be stored the call fails with a 502 so the adviser knows it
did not go out.

### Tuning

Edit the constants in `server/src/constants/dashboard.js`. The server's scoring tests
(`server/tests/clientPulse.test.js` and `dashboard.test.js`) import those constants rather than
hard-coding them, but run `npm test --prefix server` after retuning and update any expectation that
assumed the old numbers. Also sanity-check that the list still separates clients: with the current
numbers a client needs at least three points to appear.

## The client home

`GET /api/dashboard/me` (`server/src/services/clientOverview.service.js`) powers the client's own
home screen. It resolves the caller's own client record and refuses anyone who is not a client, so
it can only return that person's data. It returns:

- **Actions:** what needs the client, ranked, with a link that finishes each one (documents and
  consent to sign, requests waiting on them, unfinished drafts, reminders, and suggestions such as
  adding financial details). The client sees the top few.
- **Paperwork:** how many of the five documents are signed and which are waiting.
- **Goals and money:** goal progress, and net worth with the biggest assets and debts.
- **Activity:** recent updates.

The list lengths for each panel are constants at the top of `constants/dashboard.js`, because the
client portal is a phone screen.
