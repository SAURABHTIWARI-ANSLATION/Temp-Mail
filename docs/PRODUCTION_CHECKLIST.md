# Production Completion Checklist

Use this list before opening the service publicly.

1. Deploy the web app on a Node host that supports WebSocket upgrades.
2. Add all web app secrets from `docs/SECRETS.md`.
3. Deploy the Haraka SMTP receiver from `smtp/haraka`.
4. Add SMTP receiver secrets from `docs/SECRETS.md`.
5. Point DNS web record to the app.
6. Point MX record to the SMTP receiver.
7. Call `/api/health` and confirm status `200`.
8. Generate a mailbox in the UI.
9. Send a real email to the generated address.
10. Confirm the message appears in the browser without refresh.

For multiple web instances, use sticky sessions or run one WebSocket node until a shared event bus is added.
