export function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

export async function readJson(req, maxBytes) {
  const chunks = []
  let total = 0

  for await (const chunk of req) {
    total += chunk.length
    if (total > maxBytes) {
      const error = new Error('Request body too large')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }

  if (chunks.length === 0) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Invalid JSON payload')
    error.statusCode = 400
    throw error
  }
}

export function bearerToken(req) {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  return scheme?.toLowerCase() === 'bearer' ? token : ''
}
