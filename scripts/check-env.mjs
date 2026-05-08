const requiredWeb = [
  'NEXT_PUBLIC_MAIL_DOMAIN',
  'INBOUND_API_KEY',
  'OPS_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'ALLOWED_ORIGINS',
]

const requiredSmtp = ['TEMPMAIL_APP_URL', 'INBOUND_API_KEY']

const mode = process.argv[2] || 'web'
const required = mode === 'smtp' ? requiredSmtp : requiredWeb
const missing = required.filter((name) => !process.env[name])

if (missing.length > 0) {
  console.error(`Missing ${mode} env values:`)
  for (const name of missing) {
    console.error(`- ${name}`)
  }
  process.exit(1)
}

console.log(`${mode} env check passed`)
