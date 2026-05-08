const DEFAULT_ALLOWED_ORIGINS = '*'

function readNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function readList(name, fallback = []) {
  const value = process.env[name]
  if (!value) return fallback
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  hostname: process.env.HOSTNAME || '0.0.0.0',
  port: readNumber('PORT', 3000),
  mailDomain: process.env.NEXT_PUBLIC_MAIL_DOMAIN || 'tempmail.local',
  mailboxTtlSeconds: readNumber('MAILBOX_TTL_SECONDS', 600),
  maxMessagesPerMailbox: readNumber('MAX_MESSAGES_PER_MAILBOX', 50),
  maxAttachmentsPerMessage: readNumber('MAX_ATTACHMENTS_PER_MESSAGE', 0),
  maxInboundBodyBytes: readNumber('MAX_INBOUND_BODY_BYTES', 64 * 1024),
  generateRateLimit: readNumber('GENERATE_RATE_LIMIT_PER_MINUTE', 30),
  inboundRateLimit: readNumber('INBOUND_RATE_LIMIT_PER_MINUTE', 120),
  inboundApiKey: process.env.INBOUND_API_KEY || '',
  demoInboundEnabled:
    process.env.DEMO_INBOUND_ENABLED === 'true' ||
    process.env.NODE_ENV !== 'production',
  embedParentOrigin: process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGIN || '*',
  allowedOrigins: readList('ALLOWED_ORIGINS', [DEFAULT_ALLOWED_ORIGINS]),
  hasRedis:
    Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
    Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
}

export function requireProductionSecrets() {
  if (!config.isProduction) return []

  const missing = []
  if (!config.inboundApiKey) missing.push('INBOUND_API_KEY')
  if (!config.hasRedis) {
    missing.push('UPSTASH_REDIS_REST_URL')
    missing.push('UPSTASH_REDIS_REST_TOKEN')
  }

  return missing
}
