const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'

async function readJson(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(data)}`)
  }
  return data
}

const health = await fetch(`${baseUrl}/api/health`)
console.log('health', health.status)

const { mailbox } = await readJson(await fetch(`${baseUrl}/api/generate`))
if (!mailbox?.id || !mailbox?.token) {
  throw new Error('Generated mailbox did not include id and token')
}

const denied = await fetch(`${baseUrl}/api/emails/${encodeURIComponent(mailbox.id)}`)
if (denied.status !== 403) {
  throw new Error(`Expected inbox without token to return 403, got ${denied.status}`)
}

const nonJsonInbound = await fetch(`${baseUrl}/api/inbound`, {
  method: 'POST',
  body: 'not-json',
})
if (nonJsonInbound.status !== 415) {
  throw new Error(`Expected non-JSON inbound to return 415, got ${nonJsonInbound.status}`)
}

await readJson(
  await fetch(`${baseUrl}/api/emails/${encodeURIComponent(mailbox.id)}`, {
    headers: { 'x-mailbox-token': mailbox.token },
  }),
)

const protocol = baseUrl.startsWith('https') ? 'wss' : 'ws'
const host = new URL(baseUrl).host
const { default: WebSocket } = await import('ws')

await new Promise((resolve, reject) => {
  const deniedSocket = new WebSocket(
    `${protocol}://${host}/live?id=${encodeURIComponent(mailbox.id)}`,
    ['tempmail.v1'],
  )
  const timer = setTimeout(() => reject(new Error('WebSocket without token did not close')), 2000)
  deniedSocket.on('close', (code) => {
    clearTimeout(timer)
    if (code !== 1008) {
      reject(new Error(`Expected websocket close 1008, got ${code}`))
      return
    }
    resolve()
  })
  deniedSocket.on('error', () => {})
})

const socket = new WebSocket(
  `${protocol}://${host}/live?id=${encodeURIComponent(mailbox.id)}`,
  ['tempmail.v1', `mailbox-token.${mailbox.token}`],
)

await new Promise((resolve, reject) => {
  socket.on('open', resolve)
  socket.on('error', reject)
})

const messagePromise = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timed out waiting for websocket message')), 4000)
  socket.on('message', (raw) => {
    const event = JSON.parse(raw.toString())
    if (event.type === 'message') {
      clearTimeout(timer)
      resolve(event.message)
    }
  })
})

await readJson(
  await fetch(`${baseUrl}/api/inbound`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      demo: true,
      to: mailbox.address,
      from: 'smoke@example.com',
      subject: 'Smoke test',
      text: 'Smoke test body',
      html: '<p>Smoke<script>bad()</script></p>',
    }),
  }),
)

const message = await messagePromise
socket.close()

if (message.html.includes('script')) {
  throw new Error('HTML sanitizer failed')
}

await readJson(
  await fetch(`${baseUrl}/api/emails/${encodeURIComponent(mailbox.id)}`, {
    method: 'DELETE',
    headers: { 'x-mailbox-token': mailbox.token },
  }),
)

console.log('smoke test passed')
