'use client'

import {
  Check,
  Clipboard,
  Clock3,
  Eye,
  Globe2,
  Inbox,
  Lock,
  Mail,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Zap,
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
      {!embed ? (
        <>
          <div className="promo-bar">
            <span>Launch your own disposable inbox service</span>
            <strong>White-label ready</strong>
          </div>
          <header className="site-header">
            <a className="brand" href="/">
              <span className="brand-mark">
                <Mail size={22} />
              </span>
              <span>TempMail</span>
            </a>
            <nav aria-label="Primary navigation">
              <a href="#inbox">Inbox</a>
              <a href="#privacy">Privacy</a>
              <a href="#embed">Embed</a>
            </nav>
            <a className="header-action" href="https://github.com/SAURABHTIWARI-ANSLATION/Temp-Mail">
              GitHub
            </a>
          </header>
        </>
      ) : null}

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Temporary email address</p>
          <h1>Your disposable inbox is ready</h1>
          <p>
            Use this address anywhere you need quick verification while keeping your real mailbox private.
          </p>
        </div>

        <section className="mailbox-card" aria-label="Temporary email address">
          <div className="mailbox-card-header">
            <span className="qr-box" aria-label="QR code placeholder">
              <QrCode size={38} />
            </span>
            <div className="address-display">
              <span>Your Temporary Email Address</span>
              <strong>{mailbox?.address || 'Creating mailbox...'}</strong>
            </div>
            <button className="copy-main" type="button" onClick={copyAddress} disabled={!mailbox}>
              {copied ? <Check size={20} /> : <Clipboard size={20} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="action-toolbar" aria-label="Mailbox actions">
            <button type="button" onClick={copyAddress} disabled={!mailbox}>
              {copied ? <Check size={18} /> : <Clipboard size={18} />}
              Copy
            </button>
            <button type="button" onClick={() => loadInbox(mailbox?.id)} disabled={!mailbox}>
              <RefreshCw size={18} />
              Refresh
            </button>
            <button type="button" onClick={generateMailbox}>
              <Plus size={18} />
              Change
            </button>
            <button type="button" onClick={deleteCurrentMailbox} disabled={!mailbox}>
              <Trash2 size={18} />
              Delete
            </button>
            {DEMO_INBOUND_ENABLED ? (
              <button type="button" onClick={sendDemoMessage} disabled={!mailbox}>
                <Send size={18} />
                Demo
              </button>
            ) : null}
          </div>

          <div className="mailbox-meta">
            <span>
              <Clock3 size={18} />
              {timeLeft}
            </span>
            <span>
              {status === 'live' ? <Wifi size={18} /> : <WifiOff size={18} />}
              {status}
            </span>
            <span>
              <ShieldCheck size={18} />
              Protected
            </span>
          </div>

          {error ? <p className="notice">{error}</p> : null}
        </section>
      </section>

      <section className="workspace" id="inbox">
        <section className="inbox-panel">
          <header className="panel-header">
            <div>
              <h2>Inbox</h2>
              <p>{messages.length === 1 ? '1 incoming email' : `${messages.length} incoming emails`}</p>
            </div>
            <button className="icon-button" type="button" onClick={() => loadInbox(mailbox?.id)} disabled={!mailbox} title="Refresh">
              <RefreshCw size={18} />
            </button>
          </header>

          <div className="inbox-table">
            <div className="table-head">
              <span>Sender</span>
              <span>Subject</span>
              <span>View</span>
            </div>
            {messages.length === 0 ? (
              <div className="empty-state">
                <Inbox size={34} />
                <strong>Your inbox is empty</strong>
                <p>Waiting for incoming emails</p>
              </div>
            ) : (
              messages.map((message) => (
                <button
                  className={message.id === selectedMessage?.id ? 'message-row active' : 'message-row'}
                  key={message.id}
                  type="button"
                  onClick={() => setSelectedId(message.id)}
                >
                  <span>{message.from}</span>
                  <strong>{message.subject}</strong>
                  <Eye size={18} />
                </button>
              ))
            )}
          </div>
        </section>

        <section className="reader-panel">
          {selectedMessage ? (
            <>
              <div className="reader-meta">
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
              <h2>No message selected</h2>
              <p>Incoming mail will open here in real time.</p>
            </div>
          )}
        </section>
      </section>

      {!embed ? (
        <section className="trust-section" id="privacy">
          <div>
            <Lock size={24} />
            <h2>Private by default</h2>
            <p>Temporary addresses expire automatically and protect your primary inbox from sign-up noise.</p>
          </div>
          <div>
            <Zap size={24} />
            <h2>Real-time inbox</h2>
            <p>Messages arrive over WebSocket without refreshing the page.</p>
          </div>
          <div id="embed">
            <Globe2 size={24} />
            <h2>Embed ready</h2>
            <p>Use <code>?embed=1</code> when you want this inbox inside another frontend.</p>
          </div>
        </section>
      ) : null}
    </main>
  )
}
