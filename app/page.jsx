'use client'

import {
  Check,
  Clipboard,
  Clock3,
  Inbox,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'tempmail.mailbox'
const EMBED_PARENT_ORIGIN = process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGIN || '*'
const DEMO_INBOUND_ENABLED =
  process.env.NEXT_PUBLIC_DEMO_INBOUND_ENABLED === 'true' ||
  process.env.NODE_ENV !== 'production'

function formatTimeLeft(expiresAt) {
  if (!expiresAt) return '00:00'

  const seconds = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000))
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  const rest = String(seconds % 60).padStart(2, '0')

  return `${minutes}:${rest}`
}

function isEmbedMode() {
  if (typeof window === 'undefined') return false
  return window.location.search.includes('embed=1') || window.self !== window.top
}

function postToParent(type, payload = {}) {
  if (typeof window === 'undefined' || window.parent === window) return
  window.parent.postMessage(
    { source: 'tempmail', type, ...payload },
    EMBED_PARENT_ORIGIN,
  )
}

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Request failed')
  }
  return data
}

export default function Home() {
  const [mailbox, setMailbox] = useState(null)
  const [messages, setMessages] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState('00:00')
  const [embed, setEmbed] = useState(false)
  const socketRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const manualCloseRef = useRef(false)

  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === selectedId) || messages[0],
    [messages, selectedId],
  )

  const loadInbox = useCallback(async (id) => {
    if (!id) return

    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      })
      const data = await parseJsonResponse(response)

      setMailbox(data.mailbox)
      setMessages(data.messages)
      setSelectedId((current) => current || data.messages[0]?.id || null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.mailbox))
    } catch (requestError) {
      localStorage.removeItem(STORAGE_KEY)
      setMailbox(null)
      setMessages([])
      setSelectedId(null)
      setStatus('expired')
      setError(requestError.message)
    }
  }, [])

  const connectLive = useCallback((id) => {
    if (!id) return

    window.clearTimeout(reconnectTimerRef.current)
    manualCloseRef.current = true
    socketRef.current?.close()
    manualCloseRef.current = false
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(
      `${protocol}://${window.location.host}/live?id=${encodeURIComponent(id)}`,
    )

    socketRef.current = socket
    setStatus('connecting')

    socket.addEventListener('open', () => {
      reconnectAttemptRef.current = 0
      setStatus('live')
    })
    socket.addEventListener('close', () => {
      if (manualCloseRef.current) return

      setStatus('offline')
      reconnectAttemptRef.current += 1
      const delay = Math.min(8000, 750 * reconnectAttemptRef.current)
      reconnectTimerRef.current = window.setTimeout(() => connectLive(id), delay)
    })
    socket.addEventListener('error', () => setStatus('offline'))
    socket.addEventListener('message', (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        setError('Live update parse nahi ho paya.')
        return
      }

      if (data.type === 'snapshot') {
        if (data.mailbox) setMailbox(data.mailbox)
        setMessages(data.messages || [])
        return
      }

      if (data.type === 'message') {
        setMailbox(data.mailbox)
        setMessages((current) => [data.message, ...current])
        setSelectedId(data.message.id)
        postToParent('message', { message: data.message, mailbox: data.mailbox })
        return
      }

      if (data.type === 'deleted') {
        manualCloseRef.current = true
        localStorage.removeItem(STORAGE_KEY)
        setMailbox(null)
        setMessages([])
        setSelectedId(null)
        setStatus('expired')
      }
    })
  }, [])

  const generateMailbox = useCallback(async () => {
    setError('')
    setStatus('creating')

    try {
      const response = await fetch('/api/generate')
      const data = await parseJsonResponse(response)

      setMailbox(data.mailbox)
      setMessages([])
      setSelectedId(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.mailbox))
      connectLive(data.mailbox.id)
      postToParent('mailbox', { mailbox: data.mailbox })
    } catch (requestError) {
      setStatus('offline')
      setError(requestError.message)
    }
  }, [connectLive])

  const deleteCurrentMailbox = useCallback(async () => {
    if (!mailbox) return

    try {
      await fetch(`/api/emails/${encodeURIComponent(mailbox.id)}`, {
        method: 'DELETE',
      })
    } finally {
      manualCloseRef.current = true
      localStorage.removeItem(STORAGE_KEY)
      window.clearTimeout(reconnectTimerRef.current)
      socketRef.current?.close()
      setMailbox(null)
      setMessages([])
      setSelectedId(null)
      setStatus('idle')
      postToParent('deleted', { id: mailbox.id })
    }
  }, [mailbox])

  const copyAddress = useCallback(async () => {
    if (!mailbox) return

    try {
      await navigator.clipboard.writeText(mailbox.address)
      setCopied(true)
      postToParent('copied', { address: mailbox.address })
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setError('Clipboard permission blocked hai. Address manually select kar sakte ho.')
    }
  }, [mailbox])

  const sendDemoMessage = useCallback(async () => {
    if (!mailbox) return

    setError('')
    try {
      const response = await fetch('/api/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demo: true,
          to: mailbox.address,
          from: 'demo@tempmail.dev',
          subject: `Test mail ${new Date().toLocaleTimeString()}`,
          text: 'This is a local demo message. In production Haraka will POST the parsed SMTP payload here.',
        }),
      })
      await parseJsonResponse(response)
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [mailbox])

  useEffect(() => {
    setEmbed(isEmbedMode())

    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) {
      generateMailbox()
      return
    }

    try {
      const parsed = JSON.parse(saved)
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY)
        generateMailbox()
        return
      }

      setMailbox(parsed)
      loadInbox(parsed.id)
      connectLive(parsed.id)
    } catch {
      localStorage.removeItem(STORAGE_KEY)
      generateMailbox()
    }

    return () => {
      manualCloseRef.current = true
      window.clearTimeout(reconnectTimerRef.current)
      socketRef.current?.close()
    }
  }, [connectLive, generateMailbox, loadInbox])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextTimeLeft = formatTimeLeft(mailbox?.expiresAt)
      setTimeLeft(nextTimeLeft)
      if (mailbox && nextTimeLeft === '00:00') {
        setStatus('expired')
      }
    }, 1000)

    return () => window.clearInterval(timer)
  }, [mailbox?.expiresAt])

  return (
    <main className={embed ? 'app-shell embed' : 'app-shell'}>
      <section className="workspace">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">
              <Mail size={20} />
            </span>
            <div>
              <p className="eyebrow">Standalone</p>
              <h1>TempMail</h1>
            </div>
          </div>

          <div className="address-panel">
            <div>
              <p className="eyebrow">Temporary address</p>
              <strong>{mailbox?.address || 'Creating mailbox...'}</strong>
            </div>
            <div className="address-actions">
              <button type="button" onClick={copyAddress} disabled={!mailbox} title="Copy address">
                {copied ? <Check size={18} /> : <Clipboard size={18} />}
              </button>
              <button type="button" onClick={generateMailbox} title="New address">
                <Plus size={18} />
              </button>
              <button type="button" onClick={deleteCurrentMailbox} disabled={!mailbox} title="Delete">
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div className="status-grid">
            <div>
              <Clock3 size={18} />
              <span>{timeLeft}</span>
            </div>
            <div>
              {status === 'live' ? <Wifi size={18} /> : <WifiOff size={18} />}
              <span>{status}</span>
            </div>
          </div>

          {DEMO_INBOUND_ENABLED ? (
            <button className="demo-button" type="button" onClick={sendDemoMessage} disabled={!mailbox}>
              <Send size={18} />
              Send demo mail
            </button>
          ) : null}
        </aside>

        <section className="inbox-panel">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Inbox</p>
              <h2>{messages.length} messages</h2>
            </div>
            <button type="button" onClick={() => loadInbox(mailbox?.id)} disabled={!mailbox} title="Refresh">
              <RefreshCw size={18} />
            </button>
          </header>

          {error ? <p className="notice">{error}</p> : null}

          <div className="inbox-list">
            {messages.length === 0 ? (
              <div className="empty-state">
                <Inbox size={34} />
                <p>Inbox waiting for SMTP mail.</p>
              </div>
            ) : (
              messages.map((message) => (
                <button
                  className={message.id === selectedMessage?.id ? 'message-row active' : 'message-row'}
                  key={message.id}
                  type="button"
                  onClick={() => setSelectedId(message.id)}
                >
                  <span>{message.subject}</span>
                  <small>{message.from}</small>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="reader-panel">
          {selectedMessage ? (
            <>
              <div className="reader-meta">
                <p className="eyebrow">Message</p>
                <h2>{selectedMessage.subject}</h2>
                <span>
                  {selectedMessage.from} · {new Date(selectedMessage.receivedAt).toLocaleString()}
                </span>
              </div>
              <article>{selectedMessage.text || 'No plain text body.'}</article>
            </>
          ) : (
            <div className="empty-reader">
              <Mail size={44} />
              <h2>Select a message</h2>
              <p>New mail will open here when it arrives in real time.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
