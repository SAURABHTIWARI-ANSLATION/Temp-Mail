import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import { Redis } from '@upstash/redis'
import { config } from './config.js'
import { normalizeAddress, trimText } from './validation.js'

const mailboxes = new Map()
const redis = config.hasRedis ? Redis.fromEnv() : null

export const storeEvents = new EventEmitter()
export const storeMode = redis ? 'redis' : 'memory'

function nowIso() {
  return new Date().toISOString()
}

function randomName() {
  return crypto.randomBytes(5).toString('hex')
}

function mailboxKey(id) {
  return `mailbox:${normalizeAddress(id)}`
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

function normalizeMailbox(mailbox) {
  if (!mailbox) return null
  return {
    ...mailbox,
    messages: Array.isArray(mailbox.messages) ? mailbox.messages : [],
  }
}

async function setMailbox(mailbox) {
  const normalized = normalizeMailbox(mailbox)

  if (redis) {
    await redis.set(mailboxKey(normalized.id), normalized, {
      ex: config.mailboxTtlSeconds,
    })
    return
  }

  mailboxes.set(normalized.id, normalized)
}

async function readMailbox(idOrAddress) {
  const key = normalizeAddress(idOrAddress)
  if (!key) return null

  if (redis) {
    return normalizeMailbox(await redis.get(mailboxKey(key)))
  }

  cleanupExpiredMemory()
  return normalizeMailbox(mailboxes.get(key))
}

export async function getMailbox(idOrAddress) {
  const mailbox = await readMailbox(idOrAddress)
  if (!mailbox) return null

  return {
    ...publicMailbox(mailbox),
    messages: [...mailbox.messages].sort(
      (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt),
    ),
  }
}

export async function createMailbox() {
  cleanupExpiredMemory()

  let localPart = randomName()
  let address = `${localPart}@${config.mailDomain}`.toLowerCase()

  while (await readMailbox(address)) {
    localPart = randomName()
    address = `${localPart}@${config.mailDomain}`.toLowerCase()
  }

  const mailbox = {
    id: address,
    address,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + config.mailboxTtlSeconds * 1000).toISOString(),
    messages: [],
  }

  await setMailbox(mailbox)
  return publicMailbox(mailbox)
}

export async function listMessages(idOrAddress) {
  const mailbox = await getMailbox(idOrAddress)
  return mailbox?.messages || []
}

export async function deleteMailbox(idOrAddress) {
  const key = normalizeAddress(idOrAddress)
  if (!key) return false

  let deleted = false

  if (redis) {
    deleted = Boolean(await redis.del(mailboxKey(key)))
  } else {
    deleted = mailboxes.delete(key)
  }

  if (deleted) {
    storeEvents.emit('deleted', { id: key })
  }

  return deleted
}

export async function receiveMessage(payload) {
  cleanupExpiredMemory()

  const to = normalizeAddress(payload.to)
  const mailbox = await readMailbox(to)
  if (!mailbox) {
    return null
  }

  const message = {
    id: crypto.randomUUID(),
    to,
    from: trimText(payload.from || 'unknown@example.com', 320),
    subject: trimText(payload.subject || '(no subject)', 200),
    text: trimText(payload.text || '', 20_000),
    html: trimText(payload.html || '', 50_000),
    receivedAt: nowIso(),
  }

  mailbox.messages = [message, ...mailbox.messages].slice(
    0,
    config.maxMessagesPerMailbox,
  )

  await setMailbox(mailbox)
  storeEvents.emit('message', { mailbox: publicMailbox(mailbox), message })

  return message
}

export function cleanupExpiredMemory() {
  if (redis) return

  const now = Date.now()
  for (const [id, mailbox] of mailboxes) {
    if (new Date(mailbox.expiresAt).getTime() <= now) {
      mailboxes.delete(id)
      storeEvents.emit('deleted', { id })
    }
  }
}

export async function storeHealth() {
  if (!redis) {
    return { mode: storeMode, ok: true }
  }

  try {
    await redis.ping()
    return { mode: storeMode, ok: true }
  } catch (error) {
    return { mode: storeMode, ok: false, error: error.message }
  }
}
