# Authentication & roles — build notes (Section 15)

Decisions and non-obvious workarounds from building login + RBAC. Written as the
feature was built; the README's "Authentication & roles" section is the
user-facing summary drawn from this.

---

## 1. Where the user store lives — local JSON, not Google Sheets

`server/users.json` (git-ignored), shape:

```json
{ "users": [ { "id": "u_ab12cd34", "username": "admin",
              "passwordHash": "$2b$10$…", "role": "Admin",
              "createdAt": "2026-09-10T10:19:36.301Z" } ] }
```

**Why not Sheets** (the existing "data lives in Sheets" pattern): the proxy does
not talk to Google today — *n8n* does. Giving the proxy Google API credentials
purely for a user table would roughly double its auth surface, add a network hop
to every login, and split "who owns the Google integration" across two processes.
The user list is tiny and changes rarely, so the proxy keeps its own small
identity store, separate from n8n's document store.

**Why not SQLite**: `better-sqlite3` is a native-compiled dependency (build
toolchain on install, especially awkward on Windows) and brings migrations — too
much machinery for "add/remove a handful of users."

**Concurrency**: writes are serialised through an in-process promise chain and
committed atomically (write `users.json.<pid>.<ts>.tmp`, then `rename` over the
real file). Good enough for a single proxy instance; **not** safe to run multiple
proxy processes against the same file (documented as a known limitation).

**Reads** are cached in memory and mutated in place on writes. A hand-edit of
`users.json` while the server is running is *not* picked up until restart — fine,
because every role/user change the app needs goes through the API, which updates
the cache.

## 2. Passwords

- `bcryptjs` (pure-JS) not `bcrypt` (native) — same reason as SQLite: no build
  step, portable. Cost factor 10.
- Plaintext passwords are never stored, never logged, and never sent back in any
  response. `publicUser()` is the *only* user shape that leaves `server/users.js`
  and it has no `passwordHash` field. The §7 test asserts the user-list JSON
  contains no `$2` / "hash" substring.
- Login uses the same error message and code (`BAD_CREDENTIALS`, 401) whether the
  username is unknown or the password is wrong, and always runs a bcrypt compare
  (against the found user, or resolves false) so timing doesn't trivially leak
  which usernames exist.

## 3. Initial Admin seed

On boot, if `users.json` has **zero** users, one Admin is created from
`SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` (hashed on creation). Once any user
exists the seed is skipped — the env vars become inert. If the store is empty
**and** the seed vars are missing, the server refuses to start (otherwise there
would be no way in).

Non-obvious: because the seed only fires on an empty store, if you ever want to
reset the Admin password from env you must first delete `users.json`.

## 4. Session = JWT in an httpOnly cookie

- `POST /auth/login` verifies credentials and sets `so_session=<jwt>` as
  `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800` (8h), plus `Secure` when
  `NODE_ENV=production`.
- **The token is never in the response body** and never in `localStorage` — the
  login response returns only `{ user: {...} }`. The browser attaches the cookie
  automatically; client JS cannot read it.
- JWT payload: `{ sub: userId, username, role, iat, exp }`, signed with
  `JWT_SECRET`, `expiresIn: 8h`.
- `POST /auth/logout` clears the cookie. `GET /auth/me` returns `{ user }` or 401.

### Why role is re-read from the store on every request

`authRequired` verifies the JWT signature/expiry, then **loads the user fresh
from the store** (`findById(payload.sub)`) and uses *that* role — the role in the
token is ignored for authorization. Consequences:

- An Admin changes someone's role → it takes effect on that user's **very next
  request**, no forced logout, no token refresh. (§7 test: demote a Submitter
  mid-session → their next `POST /api/review` is 403 and `/auth/me` reports the
  new role.)
- A deleted user's still-valid token stops working immediately (user not found →
  401, cookie cleared).

The client mirrors this by re-calling `GET /auth/me` on every route navigation,
so the demoted user's buttons disappear on their next click. The **server** is
the enforcement point; the client re-fetch is only to keep the UI honest.

### CORS had to change

The session cookie is sent cross-origin (Vite dev server `:5173` → proxy
`:5055`). `fetch` only sends it with `credentials: 'include'`, and CORS with
credentials **forbids `Access-Control-Allow-Origin: *`**. So `app.use(cors())`
became `cors({ origin: CLIENT_ORIGIN, credentials: true })` and a new
`CLIENT_ORIGIN` env var. In a same-origin deployment this is a no-op.

## 5. Roles

| Role | Documents (read) | Upload / review / flag / notes | User management |
|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ |
| **Submitter** | ✅ | ✅ | — |
| **Viewer** | ✅ (incl. search, filters, **CSV export**) | — | — |

- Role **values** (`Admin` / `Submitter` / `Viewer`) are internal, like the n8n
  status/urgency values — they are never translated. Their **display labels**
  are localised (`users.role_*` keys), the same way status labels are.
- CSV export is available to **every** role including Viewer — it is a read
  operation over data the Viewer can already see.

### Server-side enforcement (not just hidden buttons)

Every proxy route is gated:

| Route | Gate |
|---|---|
| `GET /api/documents` | `authRequired` (any role) |
| `POST /api/process` | `authRequired` + `requireRole('Admin','Submitter')` |
| `POST /api/review` | `authRequired` + `requireRole('Admin','Submitter')` |
| `GET/POST /auth/users`, `PATCH/DELETE /auth/users/:id` | `authRequired` + `requireRole('Admin')` |

A logged-in user who calls a disallowed endpoint directly (bypassing the UI) gets
`403 { error_code: "FORBIDDEN" }` — a clear refusal, not a silent success.
Client-side, disallowed controls are also hidden (Viewer: no Upload nav, no
Review card, no Reopen button; Submitter: no Users nav) and the routes redirect
(`/upload`, `/users` → `/` for roles that can't use them).

## 6. Self-management guards (explicit, not left to chance)

Through the user-management API, an Admin **cannot**:

| Attempt | Result | Why |
|---|---|---|
| change **their own** role | `403` "You cannot change your own role." | **self-demotion is blocked** — consistent with the delete-self and last-Admin guards; an Admin who wants to step down has another Admin do it, or edits `users.json` |
| delete **their own** account | `403` | avoid locking yourself out mid-session |
| delete the **last** remaining Admin | `403` | never leave the system with no Admin |
| set any user's role **to `Admin`** | `400` | Admin is granted only by the seed or a direct `users.json` edit — the UI only moves users between Submitter and Viewer |
| change **another Admin's** role | `403` | same reason — Admin membership isn't a UI operation |

The **self-demotion decision**: blocked outright (not "allowed with a warning").
It matches the other self-guards, keeps the "Admin is managed outside the UI"
rule uniform, and removes an easy way to accidentally strand the system. The
user-management screen reflects this — your own row shows a `(you)` marker with no
role dropdown and no Remove button.

## 7. New env vars (add to `server/.env` — see `server/.env.example`)

| Var | Purpose |
|---|---|
| `JWT_SECRET` | signs session tokens; ≥32 random chars; changing it logs everyone out |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | first-boot Admin (ignored once any user exists) |
| `CLIENT_ORIGIN` | exact browser origin for credentialed CORS (`http://localhost:5173` in dev) |
| `NODE_ENV` | `production` marks the cookie `Secure` (HTTPS only); default `development` |

New server dependencies: `bcryptjs`, `jsonwebtoken`, `cookie-parser`.

## 8. Files

**Server**
- `server/users.js` — the JSON store, bcrypt, validation, seed, self-guards
- `server/auth.js` — cookie options, `signSession`, `authRequired`, `requireRole`
- `server/index.js` — auth routes + gates on the proxy routes; `forwardToN8n()`
  helper extracted from the three near-identical handlers

**Client**
- `src/api/auth.js` — login / logout / me / user CRUD (all `credentials:'include'`)
- `src/api/session.js` — 1-function bridge: fetch layer → "session died" → context
- `src/auth/AuthContext.jsx` — `{ user, loading, login, logout }`; `/auth/me` on
  mount and on every navigation
- `src/auth/permissions.js` — `can(role, action)` + `ASSIGNABLE_ROLES`
- `src/screens/Login.jsx`, `src/screens/Users.jsx`
- `App.jsx` — `loading` → spinner; no user → `<Login/>`; user → app + role-gated
  nav/routes; header shows `username · role` + Sign out
- `main.jsx` — `<AuthProvider>` inside the Router, above `App`; `DocumentsProvider`
  moved into `App`'s authenticated subtree so it never fires an anon request

## 9. Testing done (§7)

`server/_rbac_test.mjs` (throwaway, deleted after the run) — **43/43 checks**:
login ok/bad, token-not-in-body, HttpOnly, 8h; every proxy route 401 for anon;
Viewer 403 on writes + admin routes, Submitter 403 on admin routes, Admin OK;
expired / garbage / wrong-signature token → 401 + cookie cleared; add/remove
user, 409 dup, 400 short-password, 400 role=Admin; all self-guards; **role change
mid-session takes effect on the next request**; logout invalidates.

Browser (EN + HE/RTL): login screen (correct + wrong creds), all three roles'
nav/route/control gating, Viewer read-only detail + archive, dynamic demotion
reflected on next navigation with no re-login, and the Hebrew user-management
screen end-to-end (add → change role → remove, each with its Hebrew toast).

## 10. Known gaps (by design / scope)

- No password reset / "forgot password" flow — an Admin sets a new user's temp
  password; users can't change their own yet.
- No self-registration — accounts exist only by Admin action or the seed.
- Single proxy instance assumed (JSON store isn't multi-writer safe).
- 8-hour fixed session, no "remember me", no refresh-token rotation.
- No rate-limiting / lockout on repeated failed logins.
