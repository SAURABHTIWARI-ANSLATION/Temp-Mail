# Production Completion Checklist

Use this list before opening the service publicly.

1. Deploy the web app on a Node host that supports WebSocket upgrades.
2. Add all web app secrets from `docs/SECRETS.md`.
3. Deploy the Haraka SMTP receiver from `smtp/haraka`.
4. Add SMTP receiver secrets from `docs/SECRETS.md`.
5. Point DNS web record to the app.
6. Point MX record to the SMTP receiver.
7. Call `/api/health` and confirm status `200`.
8. Call `/api/metrics` with `OPS_API_KEY` and confirm status `200`.
9. Generate a mailbox in the UI.
10. Send a real email to the generated address.
11. Confirm the message appears in the browser without refresh.
12. Run `npm run smoke` against the live app with `SMOKE_BASE_URL=https://your-web-domain.com` while demo inbound is enabled in a staging environment.

For multiple web instances, use sticky sessions or run one WebSocket node until a shared event bus is added.
