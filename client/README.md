# Royal Square client (`client/`)

The React app for advisers, clients, insurers and admins, and the installable PWA. The project
overview is in the [root README](../README.md); how it fits with the API is in
[docs/architecture.md](../docs/architecture.md).

Built with React 19, Vite 8, React Router 7, Recharts, react-hook-form and axios. Styling is plain
CSS, and icons come from `lucide-react`.

## Run it

```sh
cp .env.example .env.local     # then fill in your Supabase URL and anon key
npm ci
npm run dev                    # http://localhost:5173
```

The API needs to be running too (`npm run dev` in `../server`, default port 5000).

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL | required |
| `VITE_SUPABASE_ANON_KEY` | Publishable (anon) key | required |
| `VITE_API_BASE_URL` | URL of the Express API | `http://localhost:5000` |

These are compiled into the browser bundle, so never put a secret in them. In particular the
service-role key belongs in `server/.env` only.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build. Use it to try the PWA, which registers only in production builds |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (`node --test tests/*.test.js`), then component tests (Vitest) |
| `npm run test:unit` / `npm run test:components` | Either half on its own |

## Layout

```
public/            manifest.webmanifest, sw.js (service worker), icons, images
src/
  pages/           one file per route, grouped by role: advisor/, client/, provider/, admin/, claims/
  components/      reusable UI, grouped by feature (documents/, dashboard/, reminders/, ...)
  api/             one file per backend resource; axios calls only
  hooks/           reusable stateful logic
  context/         React context providers
  lib/             pure helpers, no side effects
  constants/       shared static data
tests/             unit tests; tests/component holds the Vitest component tests
```

Routes are declared in `src/App.jsx`. A route is wrapped in `ProtectedRoute` with `staffOnly`,
`adminOnly`, `excludeAdmin` or `providerOnly` to say who may open it. That decides what to show; the
server enforces the real access rules.

## Conventions

- **Network calls** go through `src/api/<resource>.js` and the shared instance in `src/api/http.js`,
  never straight from a component. That instance attaches the Supabase session token and turns the
  server's `{ error: "message" }` into the thrown error's `message`.
- **Fetching in components:** a `useEffect` with a cancellation flag, setting state inside the
  effect. Re-fetch after a change by bumping a `reloadKey`.
- **Styling:** reuse the classes in `src/index.css` and `src/App.css` before adding one. Design tokens
  are CSS variables in `index.css`. Colours must work in both the light and the dark theme.
- **Imports** are relative. The `@/` alias exists in `vite.config.js` but is not used.
- **Pure logic** goes in `src/lib/` with a `node --test` unit test beside the others in `tests/`.
  Rendered behaviour is tested in `tests/component/`.

The full list is in [docs/coding-standards.md](../docs/coding-standards.md).

## The PWA

`public/manifest.webmanifest` and `public/sw.js` make the app installable, let it start offline and
receive push notifications. Two habits: **bump `VERSION` in `public/sw.js` on every release**, and
never cache anything signed-in. The whole story, including how to test it, is in
[docs/pwa.md](../docs/pwa.md).

## Deploying

Vercel builds and deploys this folder through its own Git integration (project root `client/`).
`vercel.json` sets the Vite build and the single-page-app rewrite, so a deep link such as
`/account/claims` opens correctly on a cold load. See [docs/ci-cd.md](../docs/ci-cd.md).
