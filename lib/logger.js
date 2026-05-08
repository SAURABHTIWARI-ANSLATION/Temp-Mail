function log(level, event, fields = {}) {
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...fields,
  }

  const line = JSON.stringify(payload)
  if (level === 'error') {
    console.error(line)
    return
  }

  if (level === 'warn') {
    console.warn(line)
    return
  }

  console.log(line)
}

export const logger = {
  info: (event, fields) => log('info', event, fields),
  warn: (event, fields) => log('warn', event, fields),
  error: (event, fields) => log('error', event, fields),
}
