# CI/CD

Nothing is pushed straight to `development` or `main`. Work happens on a branch, goes in through a pull request, and only merges once CI is green.

```
feature/*  ──PR──▶  development  ──PR──▶  main  ──┬──▶  Vercel production (client)   [Vercel's Git integration]
              │                     │             └──▶  CI  ──▶  Render production (backend)   [deploy hook]
              ├─ CI (lint, tests, build)           ├─ Vercel deploys the client on its own
              └─ Vercel preview (its own           └─ CI again on the merged commit, then the backend deploy
                 Git integration)
```

The two halves deploy differently. **Vercel deploys the client itself** through its native Git integration: a preview for every pull request and production on every push to `main`, with no GitHub Actions step and no GitHub secrets involved. **The backend goes through GitHub Actions:** after CI passes on a push to `main`, [deploy.yml](../.github/workflows/deploy.yml) calls Render's deploy hook. Only the backend deploy is gated by that CI run; Vercel does not wait for it. Code still reaches `main` only through a pull request whose **CI passed** check was green (see [branch protection](#3-github-settings-that-enforce-pr-only-no-direct-push)).

## What runs when

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) | PR into `development` or `main` | **Client:** lint, unit tests, component tests, production build. **Server:** lint, tests, and a boot smoke test that starts `server.js` and calls `/api/health`. A final **CI passed** job summarises the result; that is the check to require. |
| [deploy.yml](../.github/workflows/deploy.yml) | Merge / push to `main` | Runs CI again, then triggers the backend deploy on Render through its deploy hook. A failing CI blocks the deploy. |
| Vercel Git integration (not a workflow) | PR into any branch / push to `main` | Vercel builds and deploys the client: a **preview** with a URL comment on each PR, and **production** on `main`. It runs independently of GitHub Actions. |
| [release-pr.yml](../.github/workflows/release-pr.yml) | Push to `development` | Opens a `development` → `main` pull request if `development` is ahead and none is open. Optional; delete the file if you would rather open release PRs by hand. |

## One-time setup

### 1. Vercel project

1. In Vercel, import this repository as a new project.
2. Set **Root Directory** to `client`. The framework is detected as Vite; `client/vercel.json` already sets the build and the single-page-app rewrite for React Router.
3. Under **Settings → Environment Variables**, add these for **both Production and Preview**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL`: the public URL of the backend (see [The backend](#the-backend-deploys-through-this-pipeline)).
4. Vercel deploys through its native Git integration, not through GitHub Actions: it builds a preview for every pull request and deploys production on every push to `main`. `client/vercel.json` no longer switches that off (`git.deploymentEnabled` was removed), so there are no Vercel tokens or IDs to add to GitHub. Because Vercel doesn't wait for the CI workflow, a client deploy is not blocked by a failing CI run on `main`.

### 2. GitHub repository secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Where to find it |
| --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | Render → the backend service → Settings → Deploy Hook |
| `RELEASE_PR_TOKEN` *(optional)* | A fine-grained personal access token with **Pull requests: read and write** on this repo. Without it, the auto-opened release PR is created but GitHub does not start CI on it (a GitHub rule for PRs opened with the built-in token). Close and reopen the PR to trigger CI, or add the token. |

The production job fails, with a message naming the secret, if `RENDER_DEPLOY_HOOK_URL` is missing; it never silently skips the backend deploy. Treat the hook URL as a secret: anyone who has it can trigger a deploy. If it leaks, regenerate it in Render and update the GitHub secret.

### 3. GitHub settings that enforce "PR only, no direct push"

Workflow files can't lock a branch, so this part is a repository setting. Repeat for **both** `main` and `development`.

**Settings → Branches → Add branch protection rule** (or a ruleset), with:

- Require a pull request before merging (with at least 1 approval, or 0 if you are working solo)
- Require status checks to pass before merging: select **CI passed**
- Require branches to be up to date before merging
- Do not allow bypassing the above settings (include administrators)
- Block force pushes and deletions

Also enable **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** so `release-pr.yml` can open PRs.

The same thing from a terminal, if you have the GitHub CLI (`gh`) and admin rights:

```sh
for branch in main development; do
  gh api -X PUT "repos/anelisahlalukana/AfriHack-Project2026-ANU/branches/$branch/protection" --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["CI passed"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
done
```

Branch protection on a private repository needs a paid GitHub plan; on a free plan private repository the rules can be created but are not enforced.

## The backend deploys through this pipeline

The React client (`client/`) goes to Vercel. `server/` is a long-running Express process with an in-process reminder scheduler, and it binds to `127.0.0.1`, so it does not fit Vercel's serverless functions; it runs as a Node service on Render.

The backend is the part of production that GitHub Actions deploys. After CI passes on a push to `main`, the `production` job in [deploy.yml](../.github/workflows/deploy.yml) calls the service's Render **deploy hook** (`RENDER_DEPLOY_HOOK_URL`), which tells Render to build and deploy the backend. A failing CI blocks it.

**Turn off Render's Auto-Deploy.** In Render → the backend service → Settings → Build & Deploy, set **Auto-Deploy** to off. If it stays on, Render deploys directly on every push to the tracked branch regardless of the CI result, and the gate above means nothing. The deploy hook still works with Auto-Deploy off; that is the only way the backend should deploy.

Things to know:

- The hook only queues the deploy. The workflow step succeeds as soon as Render accepts the request, so a build or start-up failure on Render shows in Render's dashboard, not in the GitHub run. CI's boot smoke test is what protects against a server that doesn't start.
- Preview deployments come from Vercel's Git integration. There is no Render preview environment.
- Set `VITE_API_BASE_URL` in Vercel to the Render service's public URL.
- Set `CLIENT_ORIGIN` on the server (in Render's environment settings) to the production Vercel URL, because the API only allows CORS from that origin. Preview URLs change on every deploy, so previews will only reach the API if their origin is allowed too.

## Running the checks locally

Exactly what CI runs:

```sh
# client
cd client && npm ci && npm run lint && npm run test:unit && npm run test:components && npm run build

# server
cd server && npm ci && npm run lint && npm test
```

`npm test` in `client/` runs both client test suites. Unit tests (`client/tests/*.test.js`) use Node's built-in runner; component tests (`client/tests/component/`) use Vitest with Testing Library.

## Rolling back

The client's production is a normal Vercel deployment. To roll back, promote an earlier deployment in the Vercel dashboard (**Deployments → ⋯ → Promote to Production**), then fix forward through a pull request. Reverting the merge on `main` also works: Vercel redeploys the client, and the pipeline redeploys the backend. The backend can also be rolled back on its own, from the service's deploy history in the Render dashboard.
