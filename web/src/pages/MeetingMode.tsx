import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Copy, Check, Minimize2, Maximize2,
  AlertCircle, Volume2, ArrowLeft, Keyboard, Monitor,
} from 'lucide-react'
import { useSessionStore } from '../store/sessionStore'

type AudioSource = 'mic' | 'system'

interface Suggestion {
  id: string
  text: string
  provider?: string
  timestamp: string
}

interface StreamingState {
  id: string
  text: string
  provider?: string
}

export default function MeetingMode() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSession, fetchSession } = useSessionStore()

  const [isRecording, setIsRecording] = useState(false)
  const [audioSource, setAudioSource] = useState<AudioSource>('system')
  const [compact, setCompact] = useState(false)
  const [lastHeard, setLastHeard] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [streaming, setStreaming] = useState<StreamingState | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState('en')
  const [showShortcuts, setShowShortcuts] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const suggestionsRef = useRef(suggestions)
  suggestionsRef.current = suggestions

  useEffect(() => {
    if (id) fetchSession(id)
  }, [id, fetchSession])

  // Keyboard shortcuts: Alt+C copy, Alt+M compact toggle, Alt+Esc back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copyLatest()
      }
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setCompact((c) => !c)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // copyLatest is stable via useCallback below

  const copyLatest = useCallback(() => {
    const latest = suggestionsRef.current[0]
    if (latest) {
      navigator.clipboard.writeText(latest.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [])

  const startRecording = async (source: AudioSource = audioSource) => {
    setError(null)
    let stream: MediaStream

    try {
      if (source === 'system') {
        // Capture meeting/tab/system audio via screen share
        // Chrome/Edge require video:true for the picker to appear even if you only want audio
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 16000 } as MediaTrackConstraints,
        })
        // Stop video immediately — we only use audio
        displayStream.getVideoTracks().forEach((t) => t.stop())
        const audioTracks = displayStream.getAudioTracks()
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach((t) => t.stop())
          setError(
            'No audio was shared. When the browser asks what to share, select your meeting window or tab ' +
            'and make sure to check "Share audio" / "Share tab audio".',
          )
          return
        }
        stream = displayStream
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError(source === 'system'
          ? 'Screen sharing was denied. Click "Meeting Audio" and allow when prompted.'
          : 'Microphone access denied. Allow microphone in browser settings.')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No microphone found. Connect a microphone and try again.')
      } else {
        setError(`Could not capture audio: ${err}`)
      }
      return
    }

    streamRef.current = stream

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/sessions/${id}/stream`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setIsRecording(true)
        ws.send(JSON.stringify({ type: 'config', autoReply: true, language }))

        const audioContext = new AudioContext({ sampleRate: 16000 })
        audioContextRef.current = audioContext
        const source = audioContext.createMediaStreamSource(stream)
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        let buffer: Float32Array[] = []
        let bufferSize = 0
        const CHUNK_SAMPLES = 16000 * 2

        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0)
          buffer.push(new Float32Array(input))
          bufferSize += input.length
          if (bufferSize >= CHUNK_SAMPLES) {
            const combined = new Float32Array(bufferSize)
            let offset = 0
            for (const chunk of buffer) {
              combined.set(chunk, offset)
              offset += chunk.length
            }
            const int16 = new Int16Array(combined.length)
            for (let i = 0; i < combined.length; i++) {
              int16[i] = Math.max(-32768, Math.min(32767, combined[i] * 32768))
            }
            if (ws.readyState === WebSocket.OPEN) ws.send(int16.buffer)
            buffer = []
            bufferSize = 0
          }
        }
        source.connect(processor)
        processor.connect(audioContext.destination)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'transcript') {
            setLastHeard(data.chunk.text)
          } else if (data.type === 'answer_chunk') {
            setStreaming((prev) => ({
              id: data.answerId,
              text: (prev !== null && prev.id === data.answerId ? prev.text : '') + data.token,
              provider: data.provider,
            }))
          } else if (data.type === 'answer') {
            setStreaming(null)
            setSuggestions((prev) => [
              {
                id: data.answer.id ?? crypto.randomUUID(),
                text: data.answer.answer_text,
                provider: data.answer.provider,
                timestamp: data.answer.timestamp || new Date().toLocaleTimeString(),
              },
              ...prev.slice(0, 9),
            ])
          } else if (data.type === 'answer_error') {
            setStreaming(null)
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onerror = () => {
        setError('Cannot connect to server. Is AugmentorAI running?')
        stopRecording()
      }
      ws.onclose = () => setIsRecording(false)
  }

  const stopRecording = () => {
    processorRef.current?.disconnect()
    processorRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    setIsRecording(false)
  }

  useEffect(() => () => stopRecording(), [])

  const latestText = streaming?.text || suggestions[0]?.text || ''
  const isStreaming = !!streaming

  // ── Compact / Stealth Mode ──────────────────────────────────────────────
  if (compact) {
    return (
      <div className="h-screen bg-gray-950 text-white flex flex-col select-none" style={{ fontSize: 14 }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isRecording ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
              }`}
            />
            <span className="text-gray-400 text-xs">
              {isRecording ? (isStreaming ? 'Thinking…' : 'Listening') : 'Paused'}
            </span>
          </div>
          <div className="flex gap-1">
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="p-1.5 rounded text-xs text-red-400 hover:text-red-300"
                title="Stop"
              >
                <MicOff size={13} />
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setAudioSource('mic'); startRecording('mic') }}
                  className="p-1.5 rounded text-xs text-gray-400 hover:text-gray-200"
                  title="Start mic"
                >
                  <Mic size={13} />
                </button>
                <button
                  onClick={() => { setAudioSource('system'); startRecording('system') }}
                  className="p-1.5 rounded text-xs text-green-400 hover:text-green-300"
                  title="Meeting Audio"
                >
                  <Monitor size={13} />
                </button>
              </>
            )}
            <button
              onClick={() => setCompact(false)}
              className="p-1.5 text-gray-500 hover:text-gray-300"
              title="Expand (Alt+M)"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>

        {lastHeard && (
          <div className="px-3 py-1.5 text-gray-600 text-xs italic border-b border-gray-800 truncate">
            "{lastHeard}"
          </div>
        )}

        {/* Suggestion text — main content */}
        <div className="flex-1 overflow-hidden px-3 py-2">
          {latestText ? (
            <div className="text-white text-sm whitespace-pre-wrap leading-relaxed">
              {latestText}
              {isStreaming && (
                <span className="inline-block w-1 h-3.5 bg-green-400 animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          ) : (
            <div className="text-gray-700 text-xs text-center mt-6">
              {isRecording ? 'Listening for speech…' : 'Press mic to start'}
            </div>
          )}
        </div>

        {latestText && !isStreaming && (
          <button
            onClick={copyLatest}
            className={`mx-3 mb-3 py-1.5 rounded text-xs font-medium transition-colors ${
              copied
                ? 'bg-green-800 text-green-200'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
          >
            {copied ? '✓ Copied' : 'Copy  Alt+C'}
          </button>
        )}

        {error && (
          <div className="px-3 pb-2 text-red-400 text-xs">{error}</div>
        )}
      </div>
    )
  }

  // ── Full Mode ───────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { stopRecording(); navigate(`/sessions/${id}/live`) }}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded"
            title="Back to session"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isRecording ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
                }`}
              />
              <span className="font-medium text-sm text-gray-200">
                {currentSession?.title || 'Meeting Mode'}
              </span>
            </div>
            <p className="text-xs text-gray-600">
              {isRecording
                ? isStreaming ? 'Generating talking points…' : 'Listening…'
                : 'Microphone off'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-gray-300"
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
            <option value="es">ES</option>
            <option value="de">DE</option>
            <option value="pt">PT</option>
            <option value="zh">ZH</option>
            <option value="ja">JA</option>
          </select>

          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <MicOff size={14} />
              Stop
            </button>
          ) : (
            <div className="flex rounded overflow-hidden border border-gray-700">
              <button
                onClick={() => { setAudioSource('mic'); startRecording('mic') }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors"
                title="Capture microphone"
              >
                <Mic size={13} />
                Mic
              </button>
              <button
                onClick={() => { setAudioSource('system'); startRecording('system') }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-green-700 hover:bg-green-600 text-white border-l border-gray-700 transition-colors"
                title="Capture meeting/tab/system audio"
              >
                <Monitor size={13} />
                Meeting Audio
              </button>
            </div>
          )}

          <button
            onClick={() => setShowShortcuts((s) => !s)}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded"
            title="Keyboard shortcuts"
          >
            <Keyboard size={16} />
          </button>

          <button
            onClick={() => setCompact(true)}
            className="p-1.5 text-gray-500 hover:text-gray-300 rounded"
            title="Compact mode (Alt+M)"
          >
            <Minimize2 size={16} />
          </button>
        </div>
      </div>

      {showShortcuts && (
        <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex gap-6 text-xs text-gray-500">
          <span><kbd className="bg-gray-700 px-1 rounded">Alt+C</kbd> Copy latest</span>
          <span><kbd className="bg-gray-700 px-1 rounded">Alt+M</kbd> Compact mode</span>
          <button onClick={() => setShowShortcuts(false)} className="ml-auto text-gray-700 hover:text-gray-400">✕</button>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-red-950 border-b border-red-900 text-red-400 text-xs flex items-center gap-2 flex-shrink-0">
          <AlertCircle size={13} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-200">✕</button>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-3 p-4 overflow-hidden">
        {/* Last heard */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-gray-600 text-xs mb-1">
            <Volume2 size={11} />
            <span>Last heard</span>
          </div>
          <p className="text-sm text-gray-300">
            {lastHeard ? (
              <span>"{lastHeard}"</span>
            ) : (
              <span className="text-gray-700 italic">
                {isRecording ? 'Listening for speech…' : 'Start listening to capture audio'}
              </span>
            )}
          </p>
        </div>

        {/* Talking points — main panel */}
        <div className="flex-1 bg-gray-900 rounded-lg border border-gray-800 flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Talking Points
            </span>
            {latestText && !isStreaming && (
              <button
                onClick={copyLatest}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  copied
                    ? 'bg-green-800 text-green-200'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                }`}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied!' : 'Copy  Alt+C'}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {isStreaming && streaming ? (
              <div className="text-green-300 text-sm whitespace-pre-wrap leading-relaxed">
                {streaming.text}
                <span className="inline-block w-1 h-4 bg-green-400 animate-pulse ml-0.5 align-text-bottom" />
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-4">
                {/* Latest suggestion — prominent */}
                <div className="text-white text-sm whitespace-pre-wrap leading-relaxed">
                  {suggestions[0].text}
                </div>
                {/* Previous suggestion — dimmed */}
                {suggestions[1] && (
                  <div className="pt-3 border-t border-gray-800">
                    <div className="text-xs text-gray-700 mb-1">Previous</div>
                    <div className="text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">
                      {suggestions[1].text}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-700 text-center">
                <Volume2 size={28} className="mb-3 opacity-40" />
                <p className="text-sm">
                  {isRecording
                    ? 'Listening for speech…\nTalking points will appear here'
                    : 'Press Listen to start\nCaptures mic audio in real-time'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tip */}
        <p className="text-gray-800 text-xs text-center flex-shrink-0">
          Use <strong className="text-gray-700">Alt+M</strong> for compact overlay •{' '}
          <strong className="text-gray-700">Alt+C</strong> to copy
        </p>
      </div>
    </div>
  )
}
