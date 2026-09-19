# CI/CD

Nothing is pushed straight to `development` or `main`. Work happens on a branch, goes in through a pull request, and only merges once CI is green.

```
feature/*  ──PR──▶  development  ──PR──▶  main  ──▶  CI  ──▶  Vercel production (client)
              │                     │                    └──▶  Render production (backend)
              ├─ CI (lint, tests, build)           ├─ CI again on the merged commit
              └─ Vercel preview + URL comment      └─ deploy client and backend to production
```

The client and the backend share one gate: both production deploys run from the same job in [deploy.yml](../.github/workflows/deploy.yml), and only after CI has passed. Neither host deploys on its own.

## What runs when

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [ci.yml](../.github/workflows/ci.yml) | PR into `development` or `main` | **Client:** lint, unit tests, component tests, production build. **Server:** lint, tests, and a boot smoke test that starts `server.js` and calls `/api/health`. A final **CI passed** job summarises the result; that is the check to require. |
| [deploy.yml](../.github/workflows/deploy.yml) | PR into `development` or `main` | Builds and deploys a Vercel **preview** and comments the URL on the PR (updated on every push). |
| [deploy.yml](../.github/workflows/deploy.yml) | Merge / push to `main` | Runs CI again, then deploys the client to Vercel **production** and triggers the backend deploy on Render. A failing CI blocks both. |
| [release-pr.yml](../.github/workflows/release-pr.yml) | Push to `development` | Opens a `development` → `main` pull request if `development` is ahead and none is open. Optional; delete the file if you would rather open release PRs by hand. |

## One-time setup

### 1. Vercel project

1. In Vercel, import this repository as a new project.
2. Set **Root Directory** to `client`. The framework is detected as Vite; `client/vercel.json` already sets the build and the single-page-app rewrite for React Router.
3. Under **Settings → Environment Variables**, add these for **both Production and Preview**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_BASE_URL`: the public URL of the backend (see [The backend](#the-backend-deploys-through-this-pipeline)).
4. Vercel's own Git integration is switched off by `client/vercel.json` (`git.deploymentEnabled: false`), so the workflows are the only thing that deploys. That is what lets CI gate production.

### 2. GitHub repository secrets

In **Settings → Secrets and variables → Actions**, add:

| Secret | Where to find it |
| --- | --- |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` | `.vercel/project.json` after running `vercel link` in the repo root (`orgId`), or Vercel team settings |
| `VERCEL_PROJECT_ID` | Same file (`projectId`), or the project's Settings → General |
| `RENDER_DEPLOY_HOOK_URL` | Render → the backend service → Settings → Deploy Hook |
| `RELEASE_PR_TOKEN` *(optional)* | A fine-grained personal access token with **Pull requests: read and write** on this repo. Without it, the auto-opened release PR is created but GitHub does not start CI on it (a GitHub rule for PRs opened with the built-in token). Close and reopen the PR to trigger CI, or add the token. |

Until the three Vercel secrets exist, PR previews are skipped with a warning and the production job fails with a message naming what is missing. The production job also fails, with a message naming the secret, if `RENDER_DEPLOY_HOOK_URL` is missing; it never silently skips the backend deploy. Treat the hook URL as a secret: anyone who has it can trigger a deploy. If it leaks, regenerate it in Render and update the GitHub secret.

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

The backend goes through the same gate as the client. After CI passes on a push to `main`, the `production` job in [deploy.yml](../.github/workflows/deploy.yml) deploys the client to Vercel and then calls the service's Render **deploy hook** (`RENDER_DEPLOY_HOOK_URL`), which tells Render to build and deploy the backend. A failing CI blocks both, and a failed Vercel deploy stops the job before the hook is called.

**Turn off Render's Auto-Deploy.** In Render → the backend service → Settings → Build & Deploy, set **Auto-Deploy** to off. If it stays on, Render deploys directly on every push to the tracked branch regardless of the CI result, and the gate above means nothing. The deploy hook still works with Auto-Deploy off; that is the only way the backend should deploy.

Things to know:

- The hook only queues the deploy. The workflow step succeeds as soon as Render accepts the request, so a build or start-up failure on Render shows in Render's dashboard, not in the GitHub run. CI's boot smoke test is what protects against a server that doesn't start.
- Preview deployments are Vercel only. There is no Render preview environment.
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

Production is a normal Vercel deployment. To roll back, promote an earlier deployment in the Vercel dashboard (**Deployments → ⋯ → Promote to Production**), then fix forward through a pull request. Reverting the merge on `main` also works and redeploys through the same pipeline. The backend rolls back separately, from the service's deploy history in the Render dashboard.
