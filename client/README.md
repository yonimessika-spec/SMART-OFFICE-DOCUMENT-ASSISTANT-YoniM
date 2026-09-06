# client/

React + Vite front end for the Smart Office Document Assistant (Part 2).

## Run

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173.

With the default `.env` in this repo, `getDocuments` hits the real proxy, so
also start `server/` (see `server/README.md`) or set
`VITE_USE_MOCK_DOCUMENTS=true`.

## Screens

| Route             | Screen         | Spec |
|-------------------|----------------|------|
| `/`               | Dashboard      | F4, F5 |
| `/upload`         | Upload         | F1, F2, F3 |
| `/document/:id`   | DocumentDetail | F6 |

## API layer

Every HTTP call goes through `src/api/index.js`. Each of the three endpoints is
switched **independently** by its own flag in `client/.env`:

| Flag                        | Function          | `=false` → real call |
|-----------------------------|-------------------|----------------------|
| `VITE_USE_MOCK_DOCUMENTS`    | `getDocuments`     | `GET {VITE_SERVER_BASE_URL}/api/documents` — **implemented** |
| `VITE_USE_MOCK_PROCESS`      | `processDocument`  | throwing stub (later milestone) |
| `VITE_USE_MOCK_REVIEW`       | `reviewDocument`   | throwing stub (later milestone) |

Only the exact string `false` selects the real call; anything else (or unset)
uses `src/api/mock.js`, which returns the example JSON from CONTRACT.md §2, §4,
§6 with no network.

Screens import only from `src/api/index.js`, never from `mock.js` / `client.js`
directly. The header badge shows which calls are still mocked.

### `received_at`

n8n returns `received_at` as an opaque display string (e.g. `05/08/2026 14:48`).
It is rendered verbatim and never parsed with `new Date()`. "Newest first" is
achieved by reversing the array n8n returns (sheet insertion order), not by
sorting on the date.

## Config in `client/.env`

| Key | Purpose |
|-----|---------|
| `VITE_USE_MOCK_DOCUMENTS` / `_PROCESS` / `_REVIEW` | per-endpoint mock switch |
| `VITE_SERVER_BASE_URL` | base URL of the Express proxy (`server/`) |
| `VITE_MAX_FILE_MB` | client-side upload size ceiling (SPEC.md F1) |

## Secrets

None in this folder. `N8N_SECRET` lives only in `server/.env` (SPEC.md §5, F8).
