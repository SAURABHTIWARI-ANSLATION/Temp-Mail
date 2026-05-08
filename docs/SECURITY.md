# Security Notes

This project is configured with defensive defaults for a public temporary-mail service.

## Access Control

- Generated mailboxes include a secret token.
- Inbox read, mailbox delete, and WebSocket live updates require that token.
- WebSocket tokens are sent using `Sec-WebSocket-Protocol`, not URL query strings.
- Mailbox tokens are stored hashed server-side.
- Token comparisons use timing-safe comparison.

## API Protection

- `/api/inbound` requires `Authorization: Bearer <INBOUND_API_KEY>` in production.
- `/api/metrics` requires `Authorization: Bearer <OPS_API_KEY>` in production.
- Request body size is capped with `MAX_INBOUND_BODY_BYTES`.
- Inbound requests must use `Content-Type: application/json`.
- Unknown HTTP methods on API endpoints return `405`.
- Rate limits protect mailbox generation and inbound webhook endpoints.

## Browser And Headers

- Production responses include HSTS.
- Responses include `nosniff`, `referrer-policy`, `permissions-policy`, and frame ancestor CSP.
- `ALLOWED_ORIGINS=*` is treated as a production misconfiguration.
- `DEMO_INBOUND_ENABLED=true` is treated as a production misconfiguration.

## Email Safety

- HTML email is sanitized before storage.
- Attachments are blocked by default with `MAX_ATTACHMENTS_PER_MESSAGE=0`.
- Stored text, subject, from, and HTML fields are length-limited.

## Deployment Rules

Before public launch:

1. Set strong, different values for `INBOUND_API_KEY` and `OPS_API_KEY`.
2. Set `ALLOWED_ORIGINS` to exact HTTPS origins only.
3. Set `NEXT_PUBLIC_MAIL_DOMAIN` to your real domain.
4. Keep `DEMO_INBOUND_ENABLED=false` in production.
5. Use Redis in production.
6. Confirm `/api/health` returns `200`.
7. Confirm `/api/metrics` returns `401` without `OPS_API_KEY`.
