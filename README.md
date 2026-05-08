# TempMail Standalone

Next.js based temporary mail UI with a custom Node server for WebSocket updates. The app runs standalone today and is kept iframe-ready for a future embedded frontend.

## Flow

1. User opens app.
2. App generates a temporary email address.
3. SMTP receiver, such as Haraka on Fly.io, receives real mail.
4. Receiver posts parsed mail to `POST /api/inbound`.
5. Message is stored with a TTL and pushed to the browser through `WS /live`.
6. React UI shows the inbox, copy button, countdown, and message reader.

## Commands

```bash
npm run dev
npm run build
npm start
```

## Local Test

Open `http://localhost:3000`, then use **Send demo mail**. You can also post manually:

```bash
curl -X POST http://localhost:3000/api/inbound \
  -H "Content-Type: application/json" \
  -d '{"to":"YOUR_GENERATED_ADDRESS","from":"test@example.com","subject":"Hello","text":"SMTP payload body"}'
```

## Embed Mode

Use the same app inside an iframe:

```html
<iframe
  src="https://your-domain.com?embed=1"
  title="TempMail"
  style="width: 100%; height: 640px; border: 0;"
></iframe>
```

The iframe posts events to the parent window:

- `mailbox` when a new address is generated
- `message` when a message arrives
- `copied` when the address is copied
- `deleted` when the mailbox is deleted

Each event has `{ source: "tempmail", type, ...payload }`.

## Production Notes

- Set `NEXT_PUBLIC_MAIL_DOMAIN` to your real mail domain.
- Set `MAILBOX_TTL_SECONDS` for expiry duration. Default is `600`.
- Replace the in-memory store in `lib/mail-store.js` with Upstash Redis before deploying multiple instances.
- Haraka/Fly.io can call `POST /api/inbound` after parsing SMTP mail.
- Keep the custom `server.js` when deploying to a Node host because it owns the WebSocket upgrade route.
