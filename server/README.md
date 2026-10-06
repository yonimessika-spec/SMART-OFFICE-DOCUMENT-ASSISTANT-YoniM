# server/

Express proxy between the browser and n8n. It checks the caller's session and role,
attaches the shared `x-api-key` secret server-side, and forwards document requests to
the n8n webhooks. It also owns the user store (Neon Postgres) and sends invite, reset
and review-request emails through the n8n **Send Email** webhook.

This file is only a quick reference. Setup, every environment variable, authentication,
review requests and deployment are documented in the main [README](../README.md)
(sections Setup, Authentication & roles, Review requests, Live Deployment). Design
notes: [`persistent-users.md`](../persistent-users.md) and
[`review-requests.md`](../review-requests.md).

## Run

```bash
cd server
npm install
cp .env.example .env    # then fill it in; see the main README, Setup > Server
npm run dev             # node --watch, port from PORT (.env.example: 5055)
```

The server needs a Postgres database: set `DATABASE_URL` to a Neon connection string
(create a free one, see the main README). Tables are created and updated automatically
at boot.

The server exits at once with a readable message if a required env var is missing
(`N8N_*`, `N8N_SECRET`, `JWT_SECRET`, `CLIENT_ORIGIN`, `DATABASE_URL`). If the database
is set but unreachable it retries for about 20 seconds, then logs an error and exits;
there is no file or in-memory fallback.

## Routes

| Route | Who | Notes |
|---|---|---|
| `GET /api/documents` | any signed-in user | forwards to `{N8N_BASE_URL}{N8N_DOCUMENTS_PATH}` |
| `POST /api/process` | Admin, Submitter | forwards to `N8N_PROCESS_PATH` (JSON body up to 20 MB) |
| `POST /api/review` | Admin, Submitter | forwards to `N8N_REVIEW_PATH` |
| `POST /api/review-requests` | Admin, Submitter | emails a review request, one message per recipient |
| `GET /api/review-requests?document_id=` | any signed-in user | requests for one document, no email addresses |
| `POST /api/review-requests/:id/resend` | Admin, Submitter | resends the failed recipients only |
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` | public / signed-in | session cookie |
| `POST /auth/change-password` | any signed-in user | your own password |
| `GET /auth/set-password/validate` · `POST /auth/set-password` | public | emailed link token |
| `GET /auth/users/directory` | Admin, Submitter | names and roles for the review-request picker |
| `GET/POST /auth/users` · `PATCH/DELETE /auth/users/:id` | Admin | user management |
| `POST /auth/users/:id/resend-invite` · `…/reset-password` | Admin | emails a new link |
| `GET /health` | public | liveness check; no login, does not touch the database (use it for an external keep-alive ping) |

## Error shape

Document routes (`/api/documents`, `/api/process`, `/api/review`) return
`{ "error": "<plain sentence>" }`:

| Situation | HTTP |
|---|---|
| n8n took longer than `REQUEST_TIMEOUT_MS` | 504 |
| n8n unreachable / non-JSON response | 502 |
| n8n returned an error status | that status, body passed through |

Auth, user and review-request routes return `{ "error_code": "<CODE>", "error": "<sentence>" }`
(for example `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `RATE_LIMITED` 429). The client
translates the code; the sentence is English only.

## CORS and cookies

CORS is locked to `CLIENT_ORIGIN` with credentials on (it cannot be `*`), in every
environment. The session is an httpOnly JWT cookie: `SameSite=Lax` in development,
`SameSite=None; Secure` when `NODE_ENV=production`. In production the client does not
call this server cross-origin: Netlify rewrites `/api/*` and `/auth/*` to Render
(`client/netlify.toml`), so the browser sees one origin.

Rate limits are in memory per instance, and client IPs are read with `trust proxy` set to
`TRUST_PROXY_HOPS` (default 2 in production, 0 otherwise).
