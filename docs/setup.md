# Advisor workspace setup

1. Create a Supabase project (or use the existing project with the tables in `docs/schema.md`).
2. Run `supabase/migrations/202609190001_advisor_workspace.sql` in its SQL editor. It creates missing FNA tables, enables advisor-scoped RLS on all four tables, and installs the transactional `save_client_fna` function. Review existing policies and back up production data before applying migrations.
3. Apply `supabase/migrations/202609190002_client_registration_roles.sql` before enabling sign-ups. It restricts all FNA table operations (including the save RPC) to administrator-provisioned staff roles, in addition to existing record ownership rules.
4. Keep email/password sign-in enabled in Supabase Authentication (public sign-ups aren't used: advisers add clients, and the server creates each client's login). Keep email confirmation on. Add your app's `/login` and `/reset-password` URLs to the allowed Auth redirect URLs (for local development: `http://localhost:5173/login` and `http://localhost:5173/reset-password`). Without `/reset-password` on the list, Supabase ignores the invite link's redirect and sends people to the Site URL instead. Set the production Site URL when deploying.
5. Create advisor/admin accounts through Supabase Authentication → Users, the server-side Admin API, or `npm run create-admin --prefix server` (bootstraps the first admin). Set their **app metadata** role to `advisor` or `admin` using the Admin API or the SQL example below. Do not use editable user metadata for roles. Existing client records still require an `advisor_id` matching their assigned staff user's Auth ID. (`provider` is not a logged-in role — it's the mocked external insurer/integration layer described in `docs/system_requirments.md`.)
6. Copy `client/.env.example` to `client/.env.local`, then supply your Supabase URL and publishable/anon key. Never put a service-role key in frontend environment variables.
7. Run `npm install --prefix client`, then `npm run dev --prefix client`. Viewing and editing clients talks directly to Supabase. Adding a client, completing registration, documents and staff management need the Express server (`npm run dev --prefix server`) because they use the service-role key and Brevo.
8. For deployment, configure the host to serve `index.html` for frontend paths such as `/clients/:id/edit`.

## Behaviour

- Signed-out users are redirected to login and returned to the requested route after signing in. Sessions persist and auth events update protected routes. Logout clears access to the workspace.
- Create/edit captures the client fields in `docs/schema.md`, dependants, assets/liabilities, income/expenses, and financial goals. Client status, risk category, financial categories, and goal status use the options in the form.
- FNA saves are atomic. Child rows removed in the editor are deleted on save, retained row IDs are preserved, and a failed save rolls the whole transaction back. Concurrent saves use last-write-wins semantics; avoid editing the same client in multiple sessions.
- All monetary amounts are ZAR. Net worth = asset balances − liability balances. Recurring income/expense entries and annual income are excluded. Goal progress is the saved amount ÷ target, bounded to 0–100% visually; actual amounts remain visible. Goal status is manually editable.
- Risk score/category are advisor-entered assessment results; this app does not score a risk questionnaire.

## Verification

Run `npm run build --prefix client`, `npm run lint --prefix client`, and `npm test --prefix client`.

Live Supabase acceptance checks (require configured project and two advisor accounts):

1. Visit a client URL signed out; verify login redirect, invalid-password error, successful login, and session restoration after refresh.
2. Add a client, two dependants, an asset of 100000, a liability of 25000, and a goal with target 10000 and saved amount 2500. Verify net worth is R75,000 and the goal is 25% funded.
3. Edit the profile, remove a dependant, change a balance and goal progress, save, and refresh; verify changes persist.
4. Verify blank required fields, negative amounts, future birth dates, and combined beneficiary allocations above 100% are rejected. Disconnect the network when saving and confirm entered values remain available for retry.
5. Sign in as a second advisor and confirm the first advisor's clients are absent. Direct table requests and `save_client_fna` calls for another advisor's client must be denied. Verify failed child validation rolls back profile changes. Verify an admin account lands on `/admin`, sees only the placeholder dashboard and User management, and is redirected away from `/`, `/clients/*`, and `/compliance/*`.
6. Sign out and use browser Back; protected data must remain inaccessible. Check the form and dashboard at mobile widths.

Auth integration follows the [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) and [auth event](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) APIs. Database authorization is enforced by RLS, independently of frontend route checks.

## Client registration and staff provisioning

- There is no public sign-up. An advisor adds a client at `/clients/new`; the server creates the client's login and emails an invitation to `/complete-registration` (set `CLIENT_APP_URL` in `server/.env`; defaults to `http://localhost:5173`). The client enters their ID number and a password, then the 6-digit code emailed to them, and lands on `/account`. `/login` has one Username box: advisors and admins enter their email address, clients enter their 13-digit ID number (the one they registered with). Clients can't sign in with an email address. `provider` is not a logged-in role — see `docs/system_requirments.md`.
- Accounts without an administrator-assigned staff role are treated as clients, even if user metadata claims a different role. They land on `/account` and cannot access the advisor workspace, admin area, or FNA tables.
- The client account page confirms successful sign-in. Each client's login is created together with their advisor-managed record (`users.auth_user_id`), so no matching by email is needed. A self-service financial portal is not implemented.
- Advisors and admins have no public registration flow. Provision their account and role administratively — either `npm run create-admin --prefix server "email" "Full Name"` (creates an admin, emails a password-setup link via Brevo), the in-app admin User management screen (once at least one admin exists), or directly in the Supabase SQL editor, substituting the exact Auth user UUID and required role (`advisor` or `admin`):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'advisor')
where id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid;
```

Have the staff member sign out and back in after assigning a role so their access token includes it. No service-role key belongs in the browser. Advisors share the advisor workspace and can access only records assigned to their own user ID; admins can only reach `/admin` and `/admin/users`, never client FNA data.

Verify a client added by an advisor can complete registration with the emailed code, log in and sign out, but is redirected from `/` and `/clients/new` to `/account`. Verify direct FNA table writes and RPC saves from the client session are denied after both migrations. Verify a client-supplied `user_metadata.role = advisor` does not grant access. Then verify an administratively provisioned advisor can log in to the workspace, and an admin lands on `/admin` instead.

Registration codes come from Supabase's [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) (`email_otp`), are emailed through Brevo, and are checked in the browser with `verifyOtp` (type `email`).
