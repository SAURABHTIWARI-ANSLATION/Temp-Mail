# TempMail Complete Setup Documentation

This is the master setup guide for the full TempMail project. It covers every section needed to run locally, deploy publicly, receive real email, secure the service, monitor it, and embed the frontend.

## 1. Project Overview

TempMail has two deployable services:

| Service | Path | Purpose |
| --- | --- | --- |
| Web app | repo root | Next.js UI, API, Redis-backed mailbox store, WebSocket live inbox |
| SMTP receiver | `smtp/haraka` | Haraka SMTP server that receives real email and forwards parsed messages to the web app |

Main flow:

1. User opens web app.
2. Web app generates a mailbox address and private mailbox token.
3. User gives that address to any website.
4. SMTP receiver accepts mail for the domain.
5. SMTP receiver posts parsed email to `POST /api/inbound`.
6. Web app stores the message in Redis with TTL.
7. Browser gets the message over WebSocket.

## 2. Required Accounts And Services

You need these before live production:

| Item | Required | Why |
| --- | --- | --- |
| GitHub | Yes | Code repository |
| Domain | Yes | Email receiving domain |
| Cloudflare or DNS provider | Yes | A/CNAME/MX/TXT records |
| Node web host | Yes | Runs Next.js + WebSocket server |
| SMTP host with port 25 | Yes | Runs Haraka receiver |
| Upstash Redis | Yes for production | Persistent TTL mailbox store |

Recommended hosting:

- Web app: Railway, Render, Fly.io, Docker VPS
- SMTP receiver: Fly.io or VPS with TCP port `25`
- Avoid Vercel serverless for this exact app because WebSocket upgrade handling needs the custom Node server.

## 3. Repository Structure

| Path | Purpose |
| --- | --- |
| `app/` | Next.js frontend |
| `server.js` | Custom Node server, API routes, WebSocket upgrade |
| `lib/config.js` | Runtime config and production secret checks |
| `lib/mail-store.js` | Mailbox storage, Redis/in-memory adapter |
| `lib/validation.js` | Address validation and email sanitization |
| `lib/security.js` | Timing-safe comparisons and JSON request checks |
| `lib/metrics.js` | Runtime counters for ops |
| `scripts/check-env.mjs` | Required env checker |
| `scripts/smoke-test.mjs` | End-to-end smoke test |
| `smtp/haraka/` | SMTP receiver service |
| `docs/` | Setup, secrets, security, DNS, checklist docs |

## 4. Local Development Setup

Install dependencies:

```bash
npm install
```

Run the web app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Local mode uses in-memory storage and allows demo inbound mail with `{ "demo": true }`.

Run local smoke test:

```bash
npm run smoke
```

Run checks:

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
```

## 5. Environment Variables

Use `.env.example` as the template. Do not commit real secrets.

### Web App Required Production Env

| Name | Required | Example | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | `production` | Production mode |
| `PORT` | Usually | `3000` | Host may set automatically |
| `HOSTNAME` | Usually | `0.0.0.0` | Required for containers |
| `NEXT_PUBLIC_MAIL_DOMAIN` | Yes | `mail.yourdomain.com` | Domain used in generated email addresses |
| `INBOUND_API_KEY` | Yes | random secret | Shared with SMTP receiver |
| `OPS_API_KEY` | Yes | random secret | Protects `/api/metrics` |
| `ALLOWED_ORIGINS` | Yes | `https://yourdomain.com` | Exact HTTPS origins, no wildcard in production |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash URL | Redis storage |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash token | Redis auth |

### Web App Optional Env

| Name | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_EMBED_PARENT_ORIGIN` | `*` | Parent origin for iframe `postMessage` |
| `MAILBOX_TTL_SECONDS` | `600` | Mailbox lifetime |
| `MAX_MESSAGES_PER_MAILBOX` | `50` | Per-mailbox message cap |
| `MAX_ATTACHMENTS_PER_MESSAGE` | `0` | Attachments blocked by default |
| `MAX_INBOUND_BODY_BYTES` | `65536` | Inbound body size cap |
| `GENERATE_RATE_LIMIT_PER_MINUTE` | `30` | Mailbox generation limit |
| `INBOUND_RATE_LIMIT_PER_MINUTE` | `120` | Inbound webhook limit |
| `DEMO_INBOUND_ENABLED` | `false` in production | Keep false publicly |

### SMTP Receiver Env

| Name | Required | Example | Notes |
| --- | --- | --- | --- |
| `TEMPMAIL_APP_URL` | Yes | `https://temp.yourdomain.com` | Web app base URL |
| `INBOUND_API_KEY` | Yes | same as web app | Must match web app value |

Generate secrets:

```bash
openssl rand -base64 48
```

Use different values for `INBOUND_API_KEY` and `OPS_API_KEY`.

## 6. Web App Deployment

### Option A: Docker

Build:

```bash
docker build -t tempmail-web .
```

Run:

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_MAIL_DOMAIN=mail.yourdomain.com \
  -e INBOUND_API_KEY=replace-me \
  -e OPS_API_KEY=replace-me-too \
  -e ALLOWED_ORIGINS=https://yourdomain.com \
  -e UPSTASH_REDIS_REST_URL=replace-me \
  -e UPSTASH_REDIS_REST_TOKEN=replace-me \
  tempmail-web
```

### Option B: Railway

Files already included:

- `Dockerfile`
- `railway.json`

Set all web app env variables in Railway Variables. Railway should use the Dockerfile builder.

### Option C: Fly.io

Files already included:

- `Dockerfile`
- `fly.toml.example`

Steps:

```bash
cp fly.toml.example fly.toml
fly launch --no-deploy
fly secrets set NEXT_PUBLIC_MAIL_DOMAIN=mail.yourdomain.com
fly secrets set INBOUND_API_KEY=replace-me
fly secrets set OPS_API_KEY=replace-me-too
fly secrets set ALLOWED_ORIGINS=https://yourdomain.com
fly secrets set UPSTASH_REDIS_REST_URL=replace-me
fly secrets set UPSTASH_REDIS_REST_TOKEN=replace-me
fly deploy
```

## 7. SMTP Receiver Deployment

SMTP receiver lives in:

```text
smtp/haraka
```

Install/check locally:

```bash
cd smtp/haraka
npm install
npm run check
```

For local config file testing:

```bash
cp config/tempmail_inbound.json.example config/tempmail_inbound.json
```

For Fly.io:

```bash
cd smtp/haraka
cp fly.toml.example fly.toml
fly launch --no-deploy
fly secrets set TEMPMAIL_APP_URL=https://temp.yourdomain.com
fly secrets set INBOUND_API_KEY=replace-with-same-web-inbound-key
fly deploy
```

The SMTP host must accept TCP port `25`.

## 8. DNS Setup

Use Cloudflare or your DNS provider.

Example records:

| Type | Name | Value |
| --- | --- | --- |
| `CNAME` | `temp` | Web app host target |
| `A` or `CNAME` | `smtp` | SMTP receiver target |
| `MX` | `mail` or root | SMTP receiver hostname |
| `TXT` | root | `v=spf1 -all` |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |

Important:

- `NEXT_PUBLIC_MAIL_DOMAIN` must match the domain receiving mail.
- MX record must point to the SMTP receiver.
- Some providers require an A record for the SMTP receiver before MX can point to it.

## 9. Security Setup

Security defaults already included:

- Per-mailbox secret token
- Inbox/delete/WebSocket require mailbox token
- WebSocket token is sent via `Sec-WebSocket-Protocol`, not URL query string
- Mailbox tokens are hashed server-side
- Timing-safe secret comparison
- Inbound webhook bearer auth
- Metrics bearer auth
- JSON-only inbound webhook
- Request size cap
- Rate limiting
- Strict production misconfiguration checks
- Sanitized email HTML
- Attachments blocked by default
- HSTS in production
- CSP frame ancestor protection

Production must not use:

- `ALLOWED_ORIGINS=*`
- `NEXT_PUBLIC_MAIL_DOMAIN=tempmail.local`
- `DEMO_INBOUND_ENABLED=true`
- Missing Redis secrets

Read:

```text
docs/SECURITY.md
```

## 10. API Endpoints

| Endpoint | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/generate` | `GET` | rate limit | Create mailbox |
| `/api/emails/:id` | `GET` | `x-mailbox-token` | Read inbox |
| `/api/emails/:id` | `DELETE` | `x-mailbox-token` | Delete mailbox |
| `/api/inbound` | `POST` | `Authorization: Bearer INBOUND_API_KEY` | SMTP receiver posts email |
| `/api/health` | `GET` | none | Health/readiness |
| `/api/metrics` | `GET` | `Authorization: Bearer OPS_API_KEY` | Runtime counters |
| `/live?id=<mailbox>` | WebSocket | mailbox token protocol | Live inbox |

WebSocket client protocol:

```js
new WebSocket("wss://yourdomain.com/live?id=mailbox@example.com", [
  "tempmail.v1",
  `mailbox-token.${token}`,
])
```

## 11. Frontend Embed Setup

Use iframe mode:

```html
<iframe
  src="https://temp.yourdomain.com?embed=1"
  title="TempMail"
  style="width: 100%; height: 640px; border: 0;"
></iframe>
```

Set:

```text
NEXT_PUBLIC_EMBED_PARENT_ORIGIN=https://your-main-site.com
ALLOWED_ORIGINS=https://your-main-site.com,https://temp.yourdomain.com
```

Iframe events posted to parent:

| Event | Meaning |
| --- | --- |
| `mailbox` | New mailbox generated |
| `message` | Message arrived |
| `copied` | Address copied |
| `deleted` | Mailbox deleted |

Event shape:

```js
{ source: "tempmail", type, ...payload }
```

## 12. Testing

Local verification:

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
npm run smoke
```

SMTP receiver verification:

```bash
cd smtp/haraka
npm run check
npm audit --audit-level=moderate
```

Production env verification:

```bash
npm run check:env
npm run check:env:smtp
```

Live smoke test:

```bash
SMOKE_BASE_URL=https://temp.yourdomain.com npm run smoke
```

Use live smoke only in staging or when demo inbound is explicitly enabled for that test.

## 13. Monitoring And Operations

Health:

```bash
curl https://temp.yourdomain.com/api/health
```

Metrics:

```bash
curl https://temp.yourdomain.com/api/metrics \
  -H "Authorization: Bearer $OPS_API_KEY"
```

Metrics include:

- generated mailbox count
- inbound accepted/rejected count
- inbox reads
- mailbox deletes
- WebSocket connections
- WebSocket messages sent
- uptime
- active WebSocket count
- tracked mailbox count

Logs are JSON structured through `lib/logger.js`.

## 14. Scaling Notes

Single instance is simplest and fully supported.

For multiple web instances:

- Use Redis for storage.
- Use sticky sessions for WebSocket connections, or add a shared pub/sub event bus.
- Keep SMTP receiver posting to the same web app cluster URL.
- Run one WebSocket node if you do not have sticky sessions or pub/sub.

## 15. Production Acceptance Checklist

Before public launch:

1. Web app deployed with production env.
2. SMTP receiver deployed with matching `INBOUND_API_KEY`.
3. Redis connected.
4. `/api/health` returns `200`.
5. `/api/metrics` returns `401` without token.
6. `/api/metrics` returns `200` with `OPS_API_KEY`.
7. DNS web record resolves.
8. MX record resolves.
9. Real email reaches generated mailbox.
10. Browser receives message without refresh.
11. `ALLOWED_ORIGINS` has no wildcard.
12. Demo inbound is disabled in production.
13. Attachments policy is intentionally configured.
14. Security doc reviewed.

## 16. Troubleshooting

### `/api/health` returns 503

Check missing values in health response warnings. Common causes:

- missing `INBOUND_API_KEY`
- missing `OPS_API_KEY`
- missing Upstash Redis env
- `ALLOWED_ORIGINS=*`
- `NEXT_PUBLIC_MAIL_DOMAIN=tempmail.local`

### Emails do not arrive

Check:

- MX record points to SMTP receiver.
- SMTP receiver is reachable on port `25`.
- `TEMPMAIL_APP_URL` is correct.
- SMTP receiver `INBOUND_API_KEY` matches web app `INBOUND_API_KEY`.
- Web app logs do not show `Unauthorized inbound webhook`.

### Inbox does not update live

Check:

- Host supports WebSocket upgrade.
- Browser can connect to `/live`.
- Mailbox token exists in local storage.
- Reverse proxy is not blocking `Sec-WebSocket-Protocol`.

### Metrics endpoint returns 401

Use:

```bash
curl https://temp.yourdomain.com/api/metrics \
  -H "Authorization: Bearer $OPS_API_KEY"
```

### Production frame/embed does not work

Check:

- `ALLOWED_ORIGINS` includes the parent site.
- `NEXT_PUBLIC_EMBED_PARENT_ORIGIN` is set to the parent site.
- Parent iframe URL includes `?embed=1`.

## 17. Related Docs

- `docs/SECRETS.md`
- `docs/DNS_AND_DEPLOY.md`
- `docs/SECURITY.md`
- `docs/PRODUCTION_CHECKLIST.md`
