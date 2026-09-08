# server/

Thin Express proxy between the browser and the n8n webhooks (SPEC.md §2).

It holds `N8N_SECRET` and the webhook URLs, attaches the `x-api-key` header
server-side, and forwards responses to the client. No business logic — it only
forwards and attaches the header (SPEC.md §5).

## Run

```bash
cd server
npm install
cp .env.example .env    # then fill in N8N_BASE_URL, the three N8N_*_PATH values, N8N_SECRET
npm run dev             # node --watch, port from PORT (.env.example: 5055)
```

The server exits immediately with a readable message if any required env var
is missing.

## Routes

| Route             | Forwards to                                | Status |
|-------------------|--------------------------------------------|--------|
| `GET /api/documents` | `{N8N_BASE_URL}{N8N_DOCUMENTS_PATH}`     | implemented |
| `POST /api/process` | `{N8N_BASE_URL}{N8N_PROCESS_PATH}`        | implemented (JSON body ≤ 20 MB) |
| `POST /api/review` | `{N8N_BASE_URL}{N8N_REVIEW_PATH}`          | implemented |
| `GET /health`     | —                                          | liveness check |

## Error shape

Every failure returns `{ "error": "<plain sentence>" }`:

| Situation                          | HTTP |
|------------------------------------|------|
| n8n took longer than `REQUEST_TIMEOUT_MS` | 504 |
| n8n unreachable / non-JSON response | 502 |
| n8n returned an error status        | that status, body passed through |

## CORS

`app.use(cors())` is **local-dev only** — it lets the Vite dev server
(`localhost:5173`) read responses. Remove or restrict it for any real
deployment.
