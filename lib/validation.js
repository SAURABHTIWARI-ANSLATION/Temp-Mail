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
      html: trimText(payload.html || '', 50_000),
    },
  }
}
