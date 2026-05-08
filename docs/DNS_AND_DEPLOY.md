# DNS And Deployment Runbook

This file is the deploy-time path once you have real values.

## 1. Web App

Use Railway, Render, Fly.io, Docker on VPS, or any Node host with WebSocket upgrade support.

Required commands:

```bash
npm ci
npm run build
npm start
```

Health check:

```bash
curl https://your-web-domain.com/api/health
```

Metrics:

```bash
curl https://your-web-domain.com/api/metrics \
  -H "Authorization: Bearer $OPS_API_KEY"
```

## 2. SMTP Receiver

Deploy `smtp/haraka` to a host that can accept TCP port `25`.

For Fly.io:

```bash
cd smtp/haraka
cp fly.toml.example fly.toml
fly launch --no-deploy
fly secrets set TEMPMAIL_APP_URL=https://your-web-domain.com
fly secrets set INBOUND_API_KEY=your-shared-inbound-key
fly deploy
```

## 3. Cloudflare DNS

Example records:

| Type | Name | Value |
| --- | --- | --- |
| `CNAME` | `temp` | Your web host target |
| `MX` | `mail` or root domain | SMTP receiver host |
| `TXT` | root domain | `v=spf1 -all` |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com` |

Use the exact MX target provided by your SMTP host. Some hosts need an A record pointing to the SMTP app IP before MX can point to it.

## 4. Final Acceptance Test

1. Open the web app.
2. Copy generated address.
3. Send a real email from Gmail or another mailbox.
4. Confirm the inbox updates without refresh.
5. Confirm `/api/health` returns `200`.
6. Confirm `/api/metrics` works with `OPS_API_KEY`.
