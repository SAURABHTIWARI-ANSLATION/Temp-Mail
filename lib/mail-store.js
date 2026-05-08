import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'

const TTL_MS = Number(process.env.MAILBOX_TTL_SECONDS || 600) * 1000
const DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || 'tempmail.local'
const mailboxes = new Map()

export const storeEvents = new EventEmitter()

function nowIso() {
  return new Date().toISOString()
}

function randomName() {
  return crypto.randomBytes(5).toString('hex')
}

function normalizeAddress(address) {
  return String(address || '').trim().toLowerCase()
}

function publicMailbox(mailbox) {
  if (!mailbox) return null

  return {
    id: mailbox.id,
    address: mailbox.address,
    createdAt: mailbox.createdAt,
    expiresAt: mailbox.expiresAt,
    messageCount: mailbox.messages.length,
  }
}

export function getMailbox(idOrAddress) {
  cleanupExpired()

  const key = normalizeAddress(idOrAddress)
  const mailbox = mailboxes.get(key)
  if (!mailbox) return null

  return {
    ...publicMailbox(mailbox),
    messages: [...mailbox.messages].sort(
      (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt),
    ),
  }
}

export function createMailbox() {
  cleanupExpired()

  let localPart = randomName()
  let address = `${localPart}@${DOMAIN}`

  while (mailboxes.has(address)) {
    localPart = randomName()
    address = `${localPart}@${DOMAIN}`
  }

  const mailbox = {
    id: address,
    address,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    messages: [],
  }

  mailboxes.set(address, mailbox)
  return publicMailbox(mailbox)
}

export function listMessages(idOrAddress) {
  const mailbox = getMailbox(idOrAddress)
  return mailbox?.messages || []
}

export function deleteMailbox(idOrAddress) {
  const key = normalizeAddress(idOrAddress)
  const deleted = mailboxes.delete(key)
  if (deleted) {
    storeEvents.emit('deleted', { id: key })
  }
  return deleted
}

export function receiveMessage(payload) {
  cleanupExpired()

  const to = normalizeAddress(payload.to)
  const mailbox = mailboxes.get(to)
  if (!mailbox) {
    return null
  }

  const message = {
    id: crypto.randomUUID(),
    to,
    from: payload.from || 'unknown@example.com',
    subject: payload.subject || '(no subject)',
    text: payload.text || '',
    html: payload.html || '',
    receivedAt: nowIso(),
  }

  mailbox.messages.unshift(message)
  storeEvents.emit('message', { mailbox: publicMailbox(mailbox), message })

  return message
}

export function cleanupExpired() {
  const now = Date.now()

  for (const [id, mailbox] of mailboxes) {
    if (new Date(mailbox.expiresAt).getTime() <= now) {
      mailboxes.delete(id)
      storeEvents.emit('deleted', { id })
    }
  }
}
