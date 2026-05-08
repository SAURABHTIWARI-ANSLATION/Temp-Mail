import { createServer } from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import { config, requireProductionSecrets } from './lib/config.js'
import { bearerToken, getClientIp, readJson, sendJson } from './lib/http-utils.js'
import { logger } from './lib/logger.js'
import { getMetrics, incrementMetric } from './lib/metrics.js'
import { isJsonRequest, safeEqual } from './lib/security.js'
import {
  createMailbox,
  deleteMailbox,
  getMailbox,
  listMessages,
  receiveMessage,
  storeEvents,
  storeHealth,
  storeMode,
  verifyMailboxToken,
} from './lib/mail-store.js'
import { rateLimit } from './lib/rate-limit.js'
import { isValidAddress, normalizeAddress, validateInboundPayload } from './lib/validation.js'

const app = next({
  dev: !config.isProduction,
  hostname: config.hostname,
  port: config.port,
})
const handle = app.getRequestHandler()
const startupWarnings = requireProductionSecrets()

function isAllowedOrigin(req) {
  if (config.allowedOrigins.includes('*')) return true

  const origin = req.headers.origin
  if (!origin) return true

  return config.allowedOrigins.includes(origin)
}

function securityHeaders() {
  const frameAncestors = config.allowedOrigins.includes('*')
    ? '*'
    : config.allowedOrigins.join(' ')

  const headers = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': `frame-ancestors ${frameAncestors}; base-uri 'self'; object-src 'none'; form-action 'self'`,
    'cross-origin-resource-policy': 'same-origin',
  }

  if (config.isProduction) {
    headers['strict-transport-security'] = 'max-age=31536000; includeSubDomains; preload'
  }

  return headers
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload))
    incrementMetric('websocketMessagesSent')
  }
}

function rejectRateLimit(res, result) {
  sendJson(
    res,
    429,
    { error: 'Too many requests' },
    { 'retry-after': String(result.retryAfter || 60) },
  )
}

function authorizeInbound(req, payload) {
  if (!config.inboundApiKey) {
    return !config.isProduction
  }

  const token = bearerToken(req)
  if (safeEqual(token, config.inboundApiKey)) return true

  return config.demoInboundEnabled && payload?.demo === true
}

function authorizeOps(req) {
  if (!config.opsApiKey) {
    return !config.isProduction
  }

  return safeEqual(bearerToken(req), config.opsApiKey)
}

function mailboxToken(req) {
  return req.headers['x-mailbox-token'] || ''
}

function websocketToken(request) {
  const protocols = String(request.headers['sec-websocket-protocol'] || '')
    .split(',')
    .map((item) => item.trim())
  const tokenProtocol = protocols.find((protocol) => protocol.startsWith('mailbox-token.'))
  return tokenProtocol?.replace('mailbox-token.', '') || ''
}

function methodNotAllowed(res, methods) {
  sendJson(
    res,
    405,
    { error: 'Method not allowed' },
    { ...securityHeaders(), allow: methods.join(', ') },
  )
}

await app.prepare()

async function handleApi(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {}, securityHeaders())
    return true
  }

  if (!isAllowedOrigin(req)) {
    sendJson(res, 403, { error: 'Origin not allowed' }, securityHeaders())
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    const health = await storeHealth()
    const ok = startupWarnings.length === 0 && health.ok
    sendJson(
      res,
      ok ? 200 : 503,
      {
        ok,
        store: health,
        mode: storeMode,
        warnings: startupWarnings,
      },
      securityHeaders(),
    )
    return true
  }

  if (url.pathname === '/api/health') {
    methodNotAllowed(res, ['GET'])
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/metrics') {
    if (!authorizeOps(req)) {
      sendJson(res, 401, { error: 'Unauthorized metrics request' }, securityHeaders())
      return true
    }

    sendJson(
      res,
      200,
      getMetrics({
        storeMode,
        activeWebSockets: wss.clients.size,
        trackedMailboxes: clients.size,
      }),
      securityHeaders(),
    )
    return true
  }

  if (url.pathname === '/api/metrics') {
    methodNotAllowed(res, ['GET'])
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/generate') {
    const limited = rateLimit(
      `generate:${getClientIp(req)}`,
      config.generateRateLimit,
    )
    if (!limited.allowed) {
      rejectRateLimit(res, limited)
      return true
    }

    const mailbox = await createMailbox()
    incrementMetric('generatedMailboxes')
    sendJson(res, 200, { mailbox }, securityHeaders())
    return true
  }

  if (url.pathname === '/api/generate') {
    methodNotAllowed(res, ['GET'])
    return true
  }

  if (url.pathname.startsWith('/api/emails/')) {
    const id = normalizeAddress(
      decodeURIComponent(url.pathname.replace('/api/emails/', '')),
    )

    if (!isValidAddress(id, config.mailDomain)) {
      sendJson(res, 400, { error: 'Invalid mailbox id' }, securityHeaders())
      return true
    }

    if (!(await verifyMailboxToken(id, mailboxToken(req)))) {
      sendJson(res, 403, { error: 'Mailbox token required' }, securityHeaders())
      return true
    }

    if (req.method === 'GET') {
      incrementMetric('inboxReads')
      const mailbox = await getMailbox(id)
      if (!mailbox) {
        sendJson(
          res,
          404,
          { error: 'Mailbox not found or expired' },
          securityHeaders(),
        )
        return true
      }

      sendJson(
        res,
        200,
        {
          mailbox: {
            id: mailbox.id,
            address: mailbox.address,
            createdAt: mailbox.createdAt,
            expiresAt: mailbox.expiresAt,
            messageCount: mailbox.messageCount,
          },
          messages: await listMessages(id),
        },
        securityHeaders(),
      )
      return true
    }

    if (req.method === 'DELETE') {
      await deleteMailbox(id)
      incrementMetric('mailboxDeletes')
      sendJson(res, 200, { ok: true }, securityHeaders())
      return true
    }

    methodNotAllowed(res, ['GET', 'DELETE'])
    return true
  }

  if (req.method === 'POST' && url.pathname === '/api/inbound') {
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { error: 'Content-Type must be application/json' }, securityHeaders())
      return true
    }

    const limited = rateLimit(`inbound:${getClientIp(req)}`, config.inboundRateLimit)
    if (!limited.allowed) {
      rejectRateLimit(res, limited)
      return true
    }

    try {
      const payload = await readJson(req, config.maxInboundBodyBytes)
      if (!authorizeInbound(req, payload)) {
        incrementMetric('inboundRejected')
        sendJson(res, 401, { error: 'Unauthorized inbound webhook' }, securityHeaders())
        return true
      }

      const validated = validateInboundPayload(payload, config.mailDomain)
      if (!validated.ok) {
        incrementMetric('inboundRejected')
        sendJson(res, 400, { error: validated.error }, securityHeaders())
        return true
      }

      const message = await receiveMessage(validated.value)
      if (!message) {
        incrementMetric('inboundRejected')
        sendJson(
          res,
          404,
          { error: 'Mailbox not found or expired' },
          securityHeaders(),
        )
        return true
      }

      incrementMetric('inboundAccepted')
      sendJson(res, 200, { ok: true, message }, securityHeaders())
    } catch (error) {
      sendJson(
        res,
        error.statusCode || 500,
        { error: error.statusCode ? error.message : 'Inbound processing failed' },
        securityHeaders(),
      )
    }
    return true
  }

  if (url.pathname === '/api/inbound') {
    methodNotAllowed(res, ['POST'])
    return true
  }

  return false
}

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return
    for (const [name, value] of Object.entries(securityHeaders())) {
      res.setHeader(name, value)
    }
    handle(req, res)
  } catch (error) {
    logger.error('request_error', { error: error.message })
    sendJson(res, 500, { error: 'Internal server error' }, securityHeaders())
  }
})

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols(protocols) {
    return protocols.has('tempmail.v1') ? 'tempmail.v1' : false
  },
})
const clients = new Map()

wss.on('connection', async (socket, request) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`)
  const id = normalizeAddress(url.searchParams.get('id'))
  const token = websocketToken(request)

  if (!isAllowedOrigin(request)) {
    socket.close(1008, 'Origin not allowed')
    return
  }

  if (!isValidAddress(id, config.mailDomain)) {
    socket.close(1008, 'Valid mailbox id required')
    return
  }

  if (!(await verifyMailboxToken(id, token))) {
    socket.close(1008, 'Mailbox token required')
    return
  }

  const bucket = clients.get(id) || new Set()
  socket.isAlive = true
  bucket.add(socket)
  clients.set(id, bucket)
  incrementMetric('websocketConnections')

  const mailbox = await getMailbox(id)
  send(socket, {
    type: 'snapshot',
    mailbox,
    messages: mailbox?.messages || [],
  })

  socket.on('pong', () => {
    socket.isAlive = true
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

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate()
      continue
    }

    socket.isAlive = false
    socket.ping()
  }
}, 30_000)

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

function shutdown() {
  clearInterval(heartbeat)
  wss.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.listen(config.port, config.hostname, () => {
  if (startupWarnings.length > 0) {
    logger.warn('startup_missing_secrets', { missing: startupWarnings })
  }
  logger.info('server_ready', {
    url: `http://localhost:${config.port}`,
    storeMode,
    production: config.isProduction,
  })
})
