const { simpleParser } = require('mailparser')

function readConfig(plugin) {
  const file = plugin.config.get('tempmail_inbound.json', 'json', () => {
    plugin.cfg = readConfig(plugin)
  })

  return {
    appUrl: process.env.TEMPMAIL_APP_URL || file?.appUrl,
    apiKey: process.env.INBOUND_API_KEY || file?.apiKey,
  }
}

exports.register = function register() {
  this.cfg = readConfig(this)
  this.register_hook('data_post', 'forwardInbound')
}

exports.forwardInbound = async function forwardInbound(next, connection) {
  const plugin = this
  const transaction = connection.transaction

  if (!plugin.cfg.appUrl || !plugin.cfg.apiKey) {
    connection.logerror(plugin, 'TEMPMAIL_APP_URL and INBOUND_API_KEY are required')
    return next(DENYSOFT, 'Temporary mail receiver is not configured')
  }

  try {
    const parsed = await simpleParser(transaction.message_stream)
    const to =
      parsed.to?.value?.[0]?.address ||
      transaction.rcpt_to?.[0]?.address?.()

    const response = await fetch(`${plugin.cfg.appUrl.replace(/\/$/, '')}/api/inbound`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${plugin.cfg.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        to,
        from: parsed.from?.value?.[0]?.address,
        subject: parsed.subject,
        text: parsed.text,
        html: parsed.html,
        headers: Object.fromEntries(parsed.headers || []),
        attachments: (parsed.attachments || []).map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          size: attachment.size,
        })),
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      connection.logerror(plugin, `inbound forward failed: ${response.status} ${body}`)
      return next(DENYSOFT, 'Temporary inbox is unavailable')
    }

    connection.loginfo(plugin, `forwarded message to ${to}`)
    return next(OK)
  } catch (error) {
    connection.logerror(plugin, error.stack || error.message)
    return next(DENYSOFT, 'Temporary mail parse failed')
  }
}
