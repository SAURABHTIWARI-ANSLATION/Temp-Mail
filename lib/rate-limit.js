const buckets = new Map()

export function rateLimit(key, limit, windowMs = 60_000) {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: Math.max(0, limit - 1) }
  }

  bucket.count += 1

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}, 60_000).unref()
