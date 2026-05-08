import sanitizeHtml from 'sanitize-html'

export function normalizeAddress(address) {
  return String(address || '').trim().toLowerCase()
}

export function isValidAddress(address, domain) {
  const normalized = normalizeAddress(address)
  if (!normalized.endsWith(`@${domain.toLowerCase()}`)) return false
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$|^[a-z0-9._%+-]+@tempmail\.local$/.test(
    normalized,
  )
}

export function trimText(value, maxLength) {
  const text = String(value || '').replace(/\u0000/g, '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

export function sanitizeEmailHtml(html) {
  return sanitizeHtml(trimText(html, 50_000), {
    allowedTags: [
      'a',
      'b',
      'blockquote',
      'br',
      'code',
      'div',
      'em',
      'i',
      'li',
      'ol',
      'p',
      'pre',
      'span',
      'strong',
      'table',
      'tbody',
      'td',
      'th',
      'thead',
      'tr',
      'u',
      'ul',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      }),
    },
  })
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return []

  return attachments.map((attachment) => ({
    filename: trimText(attachment?.filename || 'attachment', 180),
    contentType: trimText(attachment?.contentType || 'application/octet-stream', 120),
    size: Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : 0,
  }))
}

export function validateInboundPayload(payload, domain) {
  const to = normalizeAddress(payload?.to)
  if (!isValidAddress(to, domain)) {
    return { ok: false, error: 'Invalid recipient address' }
  }

  return {
    ok: true,
    value: {
      to,
      from: trimText(payload.from || 'unknown@example.com', 320),
      subject: trimText(payload.subject || '(no subject)', 200),
      text: trimText(payload.text || '', 20_000),
      html: sanitizeEmailHtml(payload.html || ''),
      headers: typeof payload.headers === 'object' && payload.headers ? payload.headers : {},
      attachments: normalizeAttachments(payload.attachments),
    },
  }
}
