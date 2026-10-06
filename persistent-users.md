# Persistent users (Neon Postgres) + email invites

Status: **merged to master and live** (pull request #1, 2026-10-06, together with review requests; see `review-requests.md`). It was built on the branch `feature/persistent-users`. Render holds the production `DATABASE_URL`, Netlify serves the client, and invite and reset emails go out through the n8n Send Email workflow. The user-facing summary is in the README (Authentication & roles, Seeding, Setup). The sections below are the build notes as written before the deploy; where something has since changed it is marked.

## Why

Render's free tier has no persistent disk, so `server/users.json` was wiped on every
redeploy and after idle spin-down. Only env-seeded users survived. Users now live in
Neon Postgres (free tier), which survives both. Admin-created users are permanent.

## What was built

| Area | Files |
|---|---|
| Postgres access, migrations, retry | `server/db.js` |
| One-time password tokens | `server/tokens.js` |
| User store (async, Postgres) + seeding | `server/users.js` (replaces the `users.json` logic) |
| Email sender (n8n webhook) + templates | `server/email.js` |
| Rate limiter | `server/rateLimit.js` |
| Routes, boot sequence | `server/index.js`, `server/auth.js` |
| n8n workflow | `workflows/Project Part 2 - Document Assistant - Send Email.json` |
| Client | `Users.jsx`, `SetPassword.jsx`, `ChangePassword.jsx`, `Login.jsx`, `App.jsx`, `api/auth.js`, `api/errorText.js`, `en.json`, `he.json` |
| Netlify | `client/netlify.toml` (SPA fallback rule appended last) |

`server/users.json` is left on disk (git-ignored) but no code reads it any more.

## Schema

```
users           id, username, email, password_hash (NULL until set), role, created_at
                unique index on lower(username), unique index on lower(email)
password_tokens id, user_id -> users (ON DELETE CASCADE), token_hash (unique),
                purpose 'invite'|'reset', expires_at, used_at, created_at
```

Status is derived: `password_hash IS NULL` is **Pending**, otherwise **Active**.
There is no status column to drift out of sync. Migrations are `CREATE ... IF NOT EXISTS`
run at every boot inside one transaction under `pg_advisory_xact_lock`, so two instances
overlapping during a redeploy cannot race.

## Endpoints

Public: `GET /auth/set-password/validate?token=`, `POST /auth/set-password`.
Any signed-in user: `POST /auth/change-password`.
Admin only: `GET|POST /auth/users`, `PATCH|DELETE /auth/users/:id`,
`POST /auth/users/:id/resend-invite`, `POST /auth/users/:id/reset-password`.

## Decisions and why

- **Role re-read from the DB on every request.** Unchanged from before: a role change
  takes effect on the user's next request, no forced logout.
- **Whole-table `SELECT ... FOR UPDATE` for guarded changes.** The table is tiny. Locking
  all rows makes "cannot remove the last Admin" race-free if two Admins act at once.
- **Tokens:** 32 random bytes (base64url), only the SHA-256 hash is stored. The lookup is a
  DB equality match on the hash, so there is no application-level string compare to make
  constant-time. Spending a token is one atomic `UPDATE ... WHERE used_at IS NULL AND
  expires_at > now() RETURNING`, so two simultaneous submissions cannot both win (tested).
  Issuing a new token invalidates the user's older unused ones. TTL is 48h for both
  invite and reset.
- **Reset is Admin-triggered only.** No public "forgot password" endpoint, so there is no
  user-enumeration surface. Resetting does not change the current password; it keeps
  working until the link is used.
- **Generic token failure message.** Unknown, expired and used tokens all give the same
  `INVALID_TOKEN` response.
- **Login timing.** Unknown users, pending users and wrong passwords all cost one bcrypt
  compare (against a fixed dummy hash when there is nothing real to compare) and return the
  same 401.
- **Passwords:** bcrypt only, 8 to 72 bytes (bcrypt ignores bytes past 72, so longer is
  refused rather than silently truncated). Never logged, returned, or emailed.
- **Emails never contain a password**, only the username, the app link and the expiry.
- **A token or link is never returned by the API.** In dev mode it is printed to the
  server console only. Verified: the create/resend/reset responses contain no token.
- **Email failure does not roll back.** The user (or the reset) still exists; the response
  carries `email: { status: 'failed' }` and the UI shows a warning with a Resend action.
- **Placeholder emails.** A seed without `SEED_*_EMAIL` gets `<username>@seed.invalid`
  (a reserved TLD that can never receive mail) so a missing variable cannot take the
  deploy down. The server logs a warning at boot and every 15 minutes; the Users screen
  shows a red banner plus a per-row flag; invites and resets to a placeholder are refused
  with a clear message; real users cannot be created with a placeholder.
- **Boot order:** connect + migrate (5 attempts, 4s apart, for Neon wake-up) -> if still
  unreachable log a clear error and `exit(1)`, no fallback -> seed -> placeholder warning
  -> listen.
- **Seed passwords have no minimum length** (env values keep working as they are, for example an existing reviewer sign-in); the 8-character rule applies to passwords chosen in the app. A bad optional Submitter/Viewer seed is logged and skipped instead of stopping the boot; only the Admin seed is fatal. Found when a 7-character seed password aborted the first boot against the dev branch.
- **Seeding** runs only when the table is empty (all three env users, Active, no email
  sent) or when there is no Admin (restore the env Admin; if that username exists as
  another role it is promoted and its password reset to the env value). A user an Admin
  deletes does not come back on the next boot.
- **Rate limiting** (in memory, per instance): login is limited by IP (100 / 10 min, generous
  on purpose) and by IP + username (8 / 10 min); token endpoints by IP (60 / 10 min);
  change-password by user id (8 / 10 min).
- **Link base:** `APP_BASE_URL`, falling back to `CLIENT_ORIGIN`.

## Env lines

### Local `server/.env` (add these; this file was not touched)

```
DATABASE_URL=<your Neon POOLED connection string for the dev/local use>
SEED_ADMIN_EMAIL=<your real email>
SEED_SUBMITTER_EMAIL=<alex's real email>
SEED_VIEWER_EMAIL=<yoni's real email>
# optional, only to try real sending from local:
# N8N_EMAIL_PATH=/send-email
# EMAIL_MODE=n8n
```

Existing `SEED_*_USERNAME` / `SEED_*_PASSWORD` stay as they are and keep working.
Without `N8N_EMAIL_PATH` (or with `NODE_ENV` not `production`) invite and reset links are
printed to the server console instead of emailed.

### Render (Environment)

```
DATABASE_URL=<Neon PRODUCTION pooled connection string>
SEED_ADMIN_EMAIL=...
SEED_SUBMITTER_EMAIL=...
SEED_VIEWER_EMAIL=...
N8N_EMAIL_PATH=/send-email
NODE_ENV=production            (already set)
CLIENT_ORIGIN=<the Netlify URL>   (already set; used as the link base)
```

Optional: `APP_BASE_URL` (if the public URL differs from `CLIENT_ORIGIN`),
`TRUST_PROXY_HOPS` (default 2 in production).

### Netlify

No env change. `client/netlify.toml` gains a last rule `/* -> /index.html 200` so
`/set-password?token=...` deep links load. It is last on purpose: Netlify applies the
first match, so `/api/*` and `/auth/*` still go to Render. The client page `/set-password`
does not collide with the API path `/auth/set-password/...`.

## n8n import checklist ("Document Assistant - Send Email")

> Done for production: the workflow is imported and published, and invites and resets are sent through it. The steps are kept as the setup recipe for a fresh n8n (the README Setup, step 3, repeats them).

1. n8n -> Workflows -> Import from file -> choose
   `workflows/Project Part 2 - Document Assistant - Send Email.json`.
2. Open the **Webhook** node: credential must be `Doc Assistant API Secret`
   (the same header-auth credential the other webhooks use, header `x-api-key`). The JSON
   references it by id; re-select it if n8n shows it as missing.
3. Open the **Send Email** (Gmail) node: pick your Gmail OAuth2 credential. The JSON
   references the one used by the Daily Email Summary workflow ("Gmail GoldenShabbat");
   re-select if needed.
4. Check the webhook path is `send-email` (Production URL ends in `/webhook/send-email`).
5. **Publish / activate** the workflow. The imported file has `active: false`.
6. Test, from PowerShell (replace the secret and the address; use an inbox you own):

```powershell
$h = @{ 'x-api-key' = '<N8N_SECRET>'; 'Content-Type' = 'application/json' }
$b = '{"to":"you@example.com","subject":"Send Email test","html":"<p>Hello from n8n</p>"}'
Invoke-RestMethod -Method Post -Uri 'https://<your-n8n-host>/webhook/send-email' -Headers $h -Body $b
```

Expected: `{"status":"sent"}` and the email arrives. A bad `to` gives HTTP 400
`INVALID_REQUEST`; a Gmail failure gives HTTP 502 `EMAIL_SEND_FAILED`; a missing or wrong
`x-api-key` gives 403.

curl equivalent:

```bash
curl -X POST "https://<your-n8n-host>/webhook/send-email" \
  -H "x-api-key: <N8N_SECRET>" -H "Content-Type: application/json" \
  -d '{"to":"you@example.com","subject":"Send Email test","html":"<p>Hello from n8n</p>"}'
```

## Testing done (Neon dev branch only, never the production database)

All against a throwaway server on port 5066 with throwaway seed credentials and a separate
`JWT_SECRET`. `server/.env` was only read by node (for the `N8N_*` values), never written.

- 64 automated API checks, all passing: logins; 403 for Submitter and Viewer on every user
  management endpoint; create pending user; duplicate username (case-insensitive);
  duplicate email; invalid email; placeholder email refused; cannot create Admin; invite
  token valid / garbage / short password (token not spent) / resend invalidates the older
  token / expired / reused / concurrent spend (exactly one wins) / token stored only as a
  hash; reset invalidates older reset tokens; role change effective on the next request;
  cannot grant Admin, change own role, delete self, reset own password via the admin
  endpoint; editing a pending user's email re-sends the invite; change-password wrong
  current / too short / anonymous; delete cascades tokens; no password hash or token in any
  response.
- Persistence: created users survive a server restart.
- Seeding: empty table seeds 3 users; a deleted user stays deleted after restart; no-Admin
  recovery both when the env Admin username exists as another role (promoted, env password
  works) and when the row is gone (re-created); missing admin email gives a placeholder and
  the warning.
- Database unreachable: 5 attempts, then a clear error and exit code 1 after about 17s.
- Rate limit: 8 bad logins for one username then 429 with `Retry-After`; another username
  from the same IP still gets through.
- Browser: Users screen (EN and HE/RTL), add user, Pending/Active, placeholder banner and
  row flag, reset to a placeholder email shows the warning, real-send mode with the
  workflow not yet imported (at test time) shows "user kept, email failed" with Resend, `/set-password`
  (EN and HE/RTL, mismatch and short-password hints, success redirects to login with the
  banner, reused or missing token shows the generic message), Change password screen,
  Dashboard still loads through the proxy.

## Session invalidation (follow-up)

`users.password_changed_at` (nullable, added with `ADD COLUMN IF NOT EXISTS`) is set from the
server clock whenever a password is set via an invite or reset link, changed via
change-password, or reset by Admin recovery. `authRequired` rejects a token whose `iat` is earlier
than it (whole seconds), with the same 401 and cookie clear as an expired session. A NULL value
accepts every session, so existing users are unaffected until their password changes.
change-password issues a fresh cookie so the tab in use stays signed in. The server clock is used
for both the timestamp and `iat` on purpose, so a database clock skew cannot reject a fresh session.
An Admin sending a reset link does not cut sessions; completing the link does.
Tested on the Neon dev branch: 28 session checks plus the 65-check suite, all passing. At build time no real email had been sent; the request body to the n8n webhook was checked against a local mock (the workflow has since been imported and is live).

## Not verified / known limitations

- **Real email at build time.** When this was written the workflow had not been imported: the
  code path up to the webhook call was tested (HTTP 404 from the live n8n, as expected without
  the workflow) and the Gmail node parameters came from the Daily Email Summary workflow.
  *Since the live deploy* the workflow is imported and published and invite and reset emails
  are sent through it. Whether the Gmail node honors `replyTo` (used by review requests) is not
  recorded as checked here; the test command in `review-requests.md` covers it.
- **Client IP behind Netlify + Render is unverified.** `trust proxy` defaults to 2 hops in
  production (browser -> Netlify -> Render's proxy -> server). If that is wrong, every
  visitor shares one IP bucket. IP-level limits are generous for that reason and the tight
  limit is keyed on IP + username. Set `TRUST_PROXY_HOPS` after checking a real request.
- **Session cut-off granularity is one second.** A JWT's `iat` has no sub-second part, so a
  stolen session issued in the very same second as a password change is not rejected.
  Everything issued earlier is. See "Session invalidation" below.
- **Rate limiter is in memory.** It resets on restart and is per instance.
- **The 15-minute placeholder-email repeat** is verified by reading the code, not by waiting
  15 minutes. The boot-time warning was observed.
- **pg SSL warning:** with a `sslmode=require` URL, pg 8 prints a notice that `require` is
  an alias for `verify-full`. It is a warning only; adding `sslmode=verify-full` to the
  connection string silences it and keeps today's behaviour.
- **Docs:** `README.md`, `PROMPTS.md` and `auth-and-roles.md` described `users.json`, the
  temporary-password form and "the user store resets on redeploy" when this was written. They were
  updated in the post-deploy documentation pass (branch `docs/post-deploy`).
- The Neon free tier suspends after idle; the first request after a quiet period can take a
  few seconds extra (the pool timeout is 15s and boot retries cover a cold start).
