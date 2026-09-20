# Installable app (PWA) and push notifications

The client and the adviser workspace are one web app. It can be installed to a phone home screen or
a desktop dock, it opens without browser chrome, it starts offline, and it can send push alerts for
reminders. Nothing extra is built or deployed for this: the manifest and service worker are plain
files in `client/public/` that Vite copies into `dist/`.

## What you get

| Feature | How |
| --- | --- |
| Install to the home screen or dock | `manifest.webmanifest` plus an in-app "Install Royal Square" banner |
| Standalone window | `display: standalone` |
| Long-press shortcuts on the installed icon | Claims, Documents and Reminders, from the manifest |
| App opens offline | The service worker caches the app shell |
| "A new version is ready" prompt | The app notices when a new worker has installed |
| Push alerts when a reminder is due | Web Push with VAPID keys, one subscription per device |

**What it does not do.** It never caches signed-in data, so offline the app opens but every page
that needs data shows its usual "couldn't reach the server" state. There is no background sync and
no queue of actions made offline.

## The files

| File | Role |
| --- | --- |
| `client/public/manifest.webmanifest` | Name, icons, start URL, display mode, shortcuts |
| `client/public/sw.js` | The service worker: precache, request handling, push |
| `client/public/icons/` | `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-16/32/48.png` (the Royal Square monogram) |
| `client/index.html` | Links the manifest, sets the theme colours and the iOS Home Screen tags |
| `client/src/lib/pwa.js` | Registers the worker, spots updates, holds the browser's install prompt |
| `client/src/components/PwaPrompts.jsx` | The install and update banners, mounted once at the app root |
| `client/src/components/reminders/PushControl.jsx` | The "Push notifications" card with the on/off switch |
| `client/src/api/reminders.js` | `enablePush` and `disablePush`: permission, subscription, and telling the server |
| `server/server.js`, `server/src/reminders/`, `server/src/services/reminders.service.js` | Push configuration, subscription storage, scheduler and delivery |
| `supabase/migrations/202609190010_reminders_shared.sql` | `push_subscriptions` table and the delivery queue functions |

## Installing

Installing needs **HTTPS** (or `localhost`). Over plain HTTP the app works normally but cannot be
installed.

- **Android Chrome and desktop Chrome or Edge:** the browser offers the install once the app
  qualifies. The app catches that offer and shows its own **Install Royal Square** banner. Choosing
  the cross dismisses it for good on that device (remembered in `localStorage` under
  `rsf-install-dismissed`); the browser's own menu still offers installation afterwards.
- **iPhone and iPad:** Safari does not offer an install prompt. Use **Share, then Add to Home
  Screen**. `index.html` carries the Apple tags (icon, title, status bar) that iOS reads in place of
  the manifest. Push on iOS only works once the app has been added to the Home Screen.

### Manifest

| Field | Value |
| --- | --- |
| `name` / `short_name` | Royal Square Financial / Royal Square |
| `start_url`, `scope`, `id` | `/` |
| `display` | `standalone` |
| `theme_color`, `background_color` | `#ffffff` (the page also sets a dark `theme-color` for dark mode) |
| `icons` | 192 and 512 (`any`) and a 512 `maskable` icon for Android |
| `shortcuts` | `/account/claims`, `/account/documents`, `/account/reminders` |

## The service worker

`sw.js` is registered at `/` by `lib/pwa.js` when the app starts. It is also registered by
`enablePush` when someone turns push on; registering twice is harmless because the browser keeps
one worker per scope.

### Lifecycle

1. **Install:** precaches the app shell (`/`, `/index.html`, the manifest, the icons and the two
   brand images) and calls `skipWaiting()`. One missing file is logged and skipped so it cannot
   stop the whole install.
2. **Activate:** deletes every cache whose name starts with `rsf-` but is not the current version,
   then takes control of open pages (`clients.claim()`).

### How requests are handled

| Request | Strategy |
| --- | --- |
| Page navigations | **Network first.** A good response also refreshes the cached `/index.html`. If the network fails, the cached shell is served, which is what lets the app open offline. |
| `/assets/*` (Vite's content-hashed build output) | **Cache first.** A hash never changes meaning, so a hit is always the right file for that build. |
| Shell files and brand images | **Stale while revalidate**: answered from the cache at once and refreshed in the background. |
| `/api/*`, and any other origin (the API host, Supabase, signed document URLs) | **Not touched.** Passed straight to the network. |
| Anything that is not a `GET`, and range requests | Not touched. |

### What is never cached

Nothing signed-in is written to the cache. The Cache API outlives a sign-out and is shared by
everyone who uses the device, so only files that are identical for every visitor go in: the shell,
the build output and the brand images. Do not add user data, API responses or signed URLs to it.

### Releasing a new version

**Bump `VERSION` in `client/public/sw.js` on every release.** The cache names include it
(`rsf-shell-v1`, `rsf-assets-v1`), so a new value makes the next activation delete the old caches.
Without a bump the old hashed build files stay cached until the browser evicts them, and the
precached shell is not refreshed.

### Updates people see

A new worker installs in the background and, because it calls `skipWaiting()`, activates straight
away. `lib/pwa.js` notices a worker reaching `installed` while another already controls the page and
tells `PwaPrompts`, which shows **A new version is ready** with a **Refresh** button. If both an
update and an install offer are pending, only the update banner shows.

### Development

The worker is registered **in production builds only** (`import.meta.env.PROD`), so it never fights
Vite's hot reloading. One exception: turning push on calls `register('/sw.js')` directly, so in
development that also starts the worker.

## Push notifications

Reminders and updates reach a person's phone even when the app is closed.

### How it works

```
Person turns push on (PushControl)
  1. GET  /api/reminders/config              -> push: { enabled, publicKey }
  2. browser asks permission, subscribes with the VAPID public key
  3. POST /api/reminders/push/subscriptions  -> server validates and stores it

Every 30 s the server tick (REMINDERS_TICK_MS)
  4. fires due reminders (reminders_run_reminders) -> creates notifications
  5. claims notifications waiting for push (reminders_claim_push)
  6. sends each one to every subscribed device with web-push
  7. sw.js receives the push and shows the notification; a tap opens the right page
```

Each device subscribes for itself. Advisers and clients get the same alerts for their own
reminders: advisers on `/reminders`, clients on `/account/reminders`. `PushControl` is on both pages
and explains what is wrong when push cannot work (not set up on the server, unsupported browser or
connection, or notifications blocked).

### Server setup

1. Apply the reminders migrations, `202609190010_reminders_shared.sql` then
   `202609190011_reminders_fix_client_link.sql`. See [setup.md](setup.md).
2. Generate the key pair and add all three values to `server/.env`:

   ```sh
   npm run push:keys --prefix server
   ```

   ```
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:you@example.com
   ```

   `VAPID_SUBJECT` is sent to the push services with every message, so use an address you are happy
   to share. If only some of the values are set, or they are invalid, the server logs a
   `Push notifications are OFF` warning; if none are set it logs nothing. Either way it starts
   normally, and the app tells people push is not set up (`/api/reminders/config` reports
   `enabled: false`).
3. Optional: `REMINDERS_TICK_MS` changes how often reminders fire and messages go out (default
   30000).

Keep the same key pair for the life of the deployment. Changing it makes every existing
subscription useless, and people have to turn push off and on again.

### What the server accepts and sends

- **Subscriptions** are accepted only for an `https` endpoint with no credentials, on port 443, on a
  known push service: `fcm.googleapis.com`, `updates.push.services.mozilla.com`,
  `push.services.mozilla.com`, `web.push.apple.com` or `notify.windows.com` (or a subdomain of one).
  The `p256dh` and `auth` keys must be well formed. Anything else is a 400.
- **The message is always generic**: the title is "Royal Square Financial" and the body is "You have
  a new update. Open Royal Square to view it.", so nothing about a client appears on a lock screen.
  It carries a `tag` (so the same notification never shows twice) and a `url` to open.
- **Delivery:** the server sends with a 24-hour TTL and a 10-second timeout. A failed send is
  retried on later ticks up to three attempts in total, then marked failed. A device that already
  received a notification is remembered, so a retry never alerts it twice. A push service that
  answers 404 or 410 has its subscription removed automatically.
- **Tapping a notification** focuses a window that is already open on Royal Square and navigates it,
  or opens a new one.

### Requirements on the device

Push needs HTTPS or `localhost`, a browser with Web Push, and permission from the person. On iPhone
the app must first be added to the Home Screen.

## Testing it

1. Build and serve the production bundle, since the worker does not register in development:

   ```sh
   npm run build --prefix client
   npm run preview --prefix client
   ```

2. In Chrome DevTools, open **Application**:
   - **Manifest:** no errors, icons load, "Installability" shows no blockers.
   - **Service Workers:** the worker is *activated and running*.
   - **Cache storage:** `rsf-shell-<version>` and, after browsing, `rsf-assets-<version>`.
3. Tick **Offline** under Service Workers (or set Network to Offline) and reload. The app shell
   should still open. Check that no `/api/` response and no signed-in data appears under Cache
   storage.
4. Run Lighthouse's **PWA** checks for a second opinion.
5. To try push end to end, set the VAPID values, sign in, turn push on from the Reminders page, and
   add a reminder that is due now. The tick delivers it within `REMINDERS_TICK_MS`.
   `node server/scripts/e2e-reminders.js --yes` runs the whole reminder and push path against the
   real Supabase project with throwaway accounts and cleans up after itself.

**Automated coverage.** The server's push delivery is tested (`server/__tests__/`, part of
`npm test --prefix server`): deep links for advisers and clients, generic message text, retries up
to three attempts, removal of expired subscriptions, and delivery still happening when firing due
reminders fails. The service worker and `client/src/lib/pwa.js` have **no automated tests**, so
check them by hand with the steps above whenever `sw.js` or the prompts change.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| No install offer | Not on HTTPS, already installed, dismissed earlier (clear `rsf-install-dismissed`), or the browser does not support it (Safari: use Add to Home Screen). |
| Old version keeps showing after a deploy | `VERSION` in `sw.js` was not bumped, or the page has not been refreshed since the "new version" banner appeared. |
| A deep link such as `/account/claims` shows 404 on a cold load | The host is not serving `index.html` for unknown paths. Add the SPA fallback (Vercel does this through `client/vercel.json`). |
| Push card says push is not set up | The three VAPID values are missing or invalid on the server. Look for a `Push notifications are OFF` warning in the log (there is none if all three are simply unset), or call `GET /api/reminders/config` and check `push.enabled`. |
| Push card says the browser or connection is unsupported | Not HTTPS, or a browser without Web Push. On iPhone, add to the Home Screen first. |
| Push card says notifications are blocked | The person denied permission. It has to be re-allowed in the browser or site settings. |
| Alerts stopped after a key change | VAPID keys were regenerated. Everyone turns push off and on again. |
| Alerts arrive on one device only | Each device subscribes separately. Turn push on on the other one too. |
| Offline shows errors on every page | Expected: the app opens but signed-in data is never cached. |

## Rules for changing this

- Do not cache anything that depends on who is signed in. Keep `/api/` and other origins out of the
  worker's fetch handling.
- New static files that must work offline go in the `SHELL` list in `sw.js`. Build output needs no
  entry: it is cached as it is requested.
- Keep push messages generic. Put detail behind the sign-in.
- Bump `VERSION` whenever `sw.js`, the shell files or the icons change.
