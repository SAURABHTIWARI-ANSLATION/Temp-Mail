# TempMail Secrets And Where To Add Them

Add these later in your production host environment. Do not commit real values.

## Main Web App

Add these to Railway, Render, Fly.io app secrets, VPS `.env`, or Docker runtime env:

| Secret | Required | Where Used | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_MAIL_DOMAIN` | Yes | Web app + API | Your receiving mail domain, for example `mail.yourdomain.com`. |
| `INBOUND_API_KEY` | Yes | Web app API + SMTP receiver | Long random value. SMTP receiver sends it as `Authorization: Bearer <value>`. |
| `UPSTASH_REDIS_REST_URL` | Yes | Web app store | Upstash Redis REST URL. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Web app store | Upstash Redis REST token. |
| `ALLOWED_ORIGINS` | Yes | Web app security | Comma-separated origins allowed to embed/call app, for example `https://yourdomain.com,https://app.yourdomain.com`. |
| `NEXT_PUBLIC_EMBED_PARENT_ORIGIN` | Optional | Browser iframe events | Parent origin for `postMessage`, for example `https://yourdomain.com`. |
| `MAILBOX_TTL_SECONDS` | Optional | Web app store | Default `600`. |
| `MAX_MESSAGES_PER_MAILBOX` | Optional | Web app store | Default `50`. |
| `MAX_ATTACHMENTS_PER_MESSAGE` | Optional | Email policy | Default `0`, attachments are blocked from storage. |
| `GENERATE_RATE_LIMIT_PER_MINUTE` | Optional | Abuse protection | Default `30`. |
| `INBOUND_RATE_LIMIT_PER_MINUTE` | Optional | Abuse protection | Default `120`. |

## Haraka SMTP Receiver

Add these to the SMTP service host, usually Fly.io secrets:

| Secret | Required | Where Used | Notes |
| --- | --- | --- | --- |
| `TEMPMAIL_APP_URL` | Yes | Haraka plugin | Web app base URL, for example `https://temp-mail.yourdomain.com`. |
| `INBOUND_API_KEY` | Yes | Haraka plugin | Must exactly match web app `INBOUND_API_KEY`. |

## DNS Values

These are not app secrets, but they must be configured in Cloudflare or your DNS provider:

| Record | Value |
| --- | --- |
| `A` or `CNAME` for web app | Your Railway/Render/Fly/VPS app target. |
| `MX` for mail domain | Your Fly.io SMTP receiver hostname or IP. |
| `SPF` | Start simple, for example `v=spf1 -all` if you never send outbound mail. |
| `DMARC` | Start monitoring, for example `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`. |

## Local Development

Use `.env.example` as a template. For local demo mode, `INBOUND_API_KEY` is optional and `/api/inbound` accepts `{ "demo": true }`.

## Generate A Strong Key

```bash
openssl rand -base64 48
```
