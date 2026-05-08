import { createServer } from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import {
  createMailbox,
  deleteMailbox,
  getMailbox,
  listMessages,
  receiveMessage,
  storeEvents,
} from './lib/mail-store.js'

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = Number(process.env.PORT || 3000)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

await app.prepare()

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function handleApi(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (req.method === 'GET' && url.pathname === '/api/generate') {
    sendJson(res, 200, { mailbox: createMailbox() })
    return true
  }

  if (url.pathname.startsWith('/api/emails/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/emails/', ''))

    if (req.method === 'GET') {
      const mailbox = getMailbox(id)
      if (!mailbox) {
        sendJson(res, 404, { error: 'Mailbox not found or expired' })
        return true
      }

      sendJson(res, 200, {
        mailbox: {
          id: mailbox.id,
          address: mailbox.address,
          createdAt: mailbox.createdAt,
          expiresAt: mailbox.expiresAt,
          messageCount: mailbox.messageCount,
        },
        messages: listMessages(id),
      })
      return true
    }

    if (req.method === 'DELETE') {
      deleteMailbox(id)
      sendJson(res, 200, { ok: true })
      return true
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/inbound') {
    try {
      const message = receiveMessage(await readJson(req))
      if (!message) {
        sendJson(res, 404, { error: 'Mailbox not found or expired' })
        return true
      }

      sendJson(res, 200, { ok: true, message })
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON payload' })
    }
    return true
  }

  return false
}

const server = createServer(async (req, res) => {
  if (await handleApi(req, res)) return
  handle(req, res)
})
const wss = new WebSocketServer({ noServer: true })
const clients = new Map()

wss.on('connection', (socket, request) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`)
  const id = url.searchParams.get('id')

  if (!id) {
    socket.close(1008, 'Mailbox id required')
    return
  }

  const bucket = clients.get(id) || new Set()
  bucket.add(socket)
  clients.set(id, bucket)

  const mailbox = getMailbox(id)
  send(socket, {
    type: 'snapshot',
    mailbox,
    messages: mailbox?.messages || [],
  })

  socket.on('close', () => {
    bucket.delete(socket)
    if (bucket.size === 0) {
      clients.delete(id)
    }
  })
})

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`)
  if (url.pathname !== '/live') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request)
  })
})

storeEvents.on('message', ({ mailbox, message }) => {
  const bucket = clients.get(mailbox.id)
  if (!bucket) return

  for (const socket of bucket) {
    send(socket, { type: 'message', mailbox, message })
  }
})

storeEvents.on('deleted', ({ id }) => {
  const bucket = clients.get(id)
  if (!bucket) return

  for (const socket of bucket) {
    send(socket, { type: 'deleted', id })
  }
})

server.listen(port, hostname, () => {
  console.log(`TempMail ready on http://localhost:${port}`)
})
