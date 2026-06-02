import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MessageSquare, Send, ArrowLeft, Sparkles, Loader2, Globe } from 'lucide-react'
import { useSessionStore } from '../store/sessionStore'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
  provider?: string
  confidence?: number
}

export default function ConversationMode() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSession, fetchSession } = useSessionStore()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [language, setLanguage] = useState('en')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (id) fetchSession(id)
  }, [id, fetchSession])

  useEffect(() => {
    if (currentSession?.language) {
      setLanguage(currentSession.language)
    }
  }, [currentSession])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending || !id) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)
    setError(null)

    try {
      const res = await fetch(`/api/sessions/${id}/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, language }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.detail || `Server error (${res.status})`)
      }

      const data = await res.json()
      const assistantMsg: ChatMessage = {
        id: data.id || crypto.randomUUID(),
        role: 'assistant',
        text: data.answer_text || data.answer || '',
        timestamp: new Date().toLocaleTimeString(),
        provider: data.provider,
        confidence: data.confidence,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to get response'
      setError(errMsg)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: `❌ ${errMsg}. Make sure the backend is running.`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ])
    } finally {
      setSending(false)
    }
  }, [input, sending, id, language])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 bg-white">
        <button
          onClick={() => navigate(`/sessions/${id}/live`)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <MessageSquare size={18} className="text-violet-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">
              Conversation Mode
            </h2>
            <p className="text-xs text-gray-500">
              {currentSession?.title || 'Ambient discussion'}
              {' · '}
              <Globe size={12} className="inline mr-0.5" />
              {language.toUpperCase()}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600"
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
            <option value="de">DE</option>
            <option value="es">ES</option>
            <option value="zh">ZH</option>
            <option value="ja">JA</option>
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
              <Sparkles size={32} className="text-violet-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Ambient Conversation
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Ask anything — no documents or context required. Perfect for
              general discussion, brainstorming, or quick questions.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs opacity-60">{msg.timestamp}</span>
                {msg.provider && msg.role === 'assistant' && (
                  <span className="text-xs opacity-50">
                    via {msg.provider}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <input
            ref={(el) => el?.focus()}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={sending}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Press Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
