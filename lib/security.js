import crypto from 'node:crypto'

export function safeEqual(left, right) {
  const leftValue = String(left || '')
  const rightValue = String(right || '')

  if (!leftValue || !rightValue) return false

  const leftBuffer = Buffer.from(leftValue)
  const rightBuffer = Buffer.from(rightValue)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function isJsonRequest(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  return contentType.startsWith('application/json')
}
