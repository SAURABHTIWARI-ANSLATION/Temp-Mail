const startedAt = new Date()

const counters = {
  generatedMailboxes: 0,
  inboundAccepted: 0,
  inboundRejected: 0,
  inboxReads: 0,
  mailboxDeletes: 0,
  websocketConnections: 0,
  websocketMessagesSent: 0,
}

export function incrementMetric(name, amount = 1) {
  counters[name] = (counters[name] || 0) + amount
}

export function getMetrics(extra = {}) {
  return {
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    counters: { ...counters },
    ...extra,
  }
}
