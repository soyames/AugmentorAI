import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Mic, MicOff, Globe, Sparkles, Square, Copy, ThumbsUp, RotateCcw, Volume2, AlertCircle, Send } from 'lucide-react'
import { useSessionStore } from '../store/sessionStore'
import Logo from '../components/Logo'

interface TranscriptChunk {
  id: string
  speaker: 'user' | 'interviewer'
  text: string
  timestamp: string
  isQuestion: boolean
}

interface AnswerSuggestion {
  id: string
  question: string
  answer: string
  timestamp: string
  provider?: string
  isFallback?: boolean
  confidence?: number
  sources?: string
}

export default function LiveSession() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentSession, fetchSession } = useSessionStore()

  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([])
  const [suggestions, setSuggestions] = useState<AnswerSuggestion[]>([])
  const [language, setLanguage] = useState('en')
  const [autoGenerate, setAutoGenerate] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatingAnswer, setGeneratingAnswer] = useState(false)
  // Manual question input fallback
  const [manualQuestion, setManualQuestion] = useState('')
  const questionInputRef = useRef<HTMLInputElement>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const autoGenerateRef = useRef(autoGenerate)

  const sendStreamConfig = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'config',
          autoReply: autoGenerateRef.current,
          language,
        }),
      )
    }
  }, [language])

  // Keep ref in sync with state
  useEffect(() => {
    autoGenerateRef.current = autoGenerate
    sendStreamConfig()
  }, [autoGenerate, sendStreamConfig])

  useEffect(() => {
    sendStreamConfig()
  }, [language, sendStreamConfig])

  useEffect(() => {
    if (id) {
      fetchSession(id)
    }
  }, [id, fetchSession])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [])

  const generateAnswer = useCallback(async (question: string) => {
    if (!id || generatingAnswer) return
    setGeneratingAnswer(true)
    try {
      const response = await fetch(`/api/sessions/${id}/generate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, language }),
      })

      if (response.ok) {
        const data = await response.json()
        setSuggestions((prev) => [
          {
            id: data.id,
            question: data.question || question,
            answer: data.answer_text,
            timestamp: new Date().toLocaleTimeString(),
            provider: data.provider || 'unknown',
            isFallback: data.is_fallback || false,
            confidence: data.confidence,
            sources: data.sources,
          },
          ...prev,
        ])
      } else {
        let errorDetail = 'Failed to generate answer. Check that the backend is running.'
        try {
          const errData = await response.json()
          if (errData.detail) errorDetail = errData.detail
        } catch {}
        setSuggestions((prev) => [
          {
            id: crypto.randomUUID(),
            question,
            answer: errorDetail,
            timestamp: new Date().toLocaleTimeString(),
            provider: 'none',
            isFallback: true,
          },
          ...prev,
        ])
      }
    } catch {
      setSuggestions((prev) => [
        {
          id: crypto.randomUUID(),
          question,
          answer: 'Cannot reach the server. Make sure the backend is running.',
          timestamp: new Date().toLocaleTimeString(),
          provider: 'none',
          isFallback: true,
        },
        ...prev,
      ])
    } finally {
      setGeneratingAnswer(false)
    }
  }, [id, language, generatingAnswer])

  const handleManualQuestion = () => {
    const q = manualQuestion.trim()
    if (!q) return
    const chunk: TranscriptChunk = {
      id: crypto.randomUUID(),
      speaker: 'interviewer',
      text: q,
      timestamp: new Date().toLocaleTimeString(),
      isQuestion: true,
    }
    setTranscript((prev) => [...prev, chunk])
    setManualQuestion('')
    generateAnswer(q)
    if (questionInputRef.current) {
      questionInputRef.current.focus()
    }
  }

  const handleManualKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleManualQuestion()
    }
  }

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Connect WebSocket through nginx proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/sessions/${id}/stream`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setIsRecording(true)
        sendStreamConfig()

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

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(int16.buffer)
            }

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
            const chunk: TranscriptChunk = {
              id: data.chunk.id,
              speaker: data.chunk.speaker,
              text: data.chunk.text,
              timestamp: data.chunk.timestamp,
              isQuestion: data.chunk.isQuestion,
            }
            setTranscript((prev) => [...prev, chunk])
          } else if (data.type === 'answer') {
            setSuggestions((prev) => [
              {
                id: data.answer.id ?? crypto.randomUUID(),
                question: data.answer.question || 'Live question',
                answer: data.answer.answer_text || 'No answer text returned.',
                timestamp: data.answer.timestamp || new Date().toLocaleTimeString(),
                provider: data.answer.provider || 'unknown',
                isFallback: data.answer.is_fallback || false,
                confidence: data.answer.confidence,
                sources: data.answer.sources,
              },
              ...prev,
            ])
          } else if (data.type === 'answer_error') {
            setSuggestions((prev) => [
              {
                id: crypto.randomUUID(),
                question: data.question || 'Live question',
                answer: data.error || 'Unable to generate a live answer.',
                timestamp: new Date().toLocaleTimeString(),
                provider: data.provider || 'none',
                isFallback: true,
              },
              ...prev,
            ])
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onerror = () => {
        setError('Could not connect to the server. Make sure the backend is running.')
        stopRecording()
      }

      ws.onclose = () => {
        if (isRecording) {
          setIsRecording(false)
        }
      }
    } catch (err) {
      console.error('Failed to start recording:', err)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError(
          'Microphone access denied. Please allow microphone in your browser settings ' +
          '(🔒 Site Settings → Microphone → Allow), ' +
          'or type your question manually below.'
        )
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone or type your question manually below.')
      } else if (err instanceof DOMException && err.name === 'NotReadableError') {
        setError('Microphone is busy (another app may be using it). Try closing other apps or type your question below.')
      } else {
        setError(`Failed to access microphone. You can type your question manually below. (${err})`)
      }
    }
  }

  const stopRecording = () => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsRecording(false)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const endSession = () => {
    stopRecording()
    navigate(`/sessions/${id}/transcript`)
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Logo size={32} showText={false} />
          <div>
            <h1 className="font-semibold text-gray-900">
              {currentSession?.title || 'Live Session'}
            </h1>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span
                className={`w-2 h-2 rounded-full ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
                }`}
              />
              {isRecording ? 'Recording' : 'Not recording'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-gray-500" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>

          {/* Auto Generate Toggle */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <span className="text-gray-600">Auto AI</span>
            <div
              onClick={() => setAutoGenerate(!autoGenerate)}
              className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${
                autoGenerate ? 'bg-violet-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                  autoGenerate ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
          </label>

          {/* End Session */}
          <button onClick={endSession} className="btn-secondary text-sm py-2">
            <Square size={16} />
            End Session
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3 text-sm text-red-700">
          <AlertCircle size={16} className="flex-shrink-0" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left Panel - Transcript */}
        <div className="w-96 bg-white rounded-xl border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Live Transcript</h2>
          </div>

          <div ref={transcriptRef} className="flex-1 overflow-auto p-4 space-y-3">
            {transcript.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <Volume2 size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">Start recording to see transcript</p>
                <p className="text-xs mt-1 text-gray-300">
                  Or type a question below
                </p>
              </div>
            ) : (
              transcript.map((chunk) => (
                <div
                  key={chunk.id}
                  className={`p-3 rounded-lg ${
                    chunk.speaker === 'interviewer' ? 'bg-gray-100' : 'bg-violet-50'
                  } ${chunk.isQuestion ? 'border-l-4 border-yellow-400' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {chunk.speaker === 'interviewer' ? 'Interviewer' : 'You'}
                    </span>
                    <span className="text-xs text-gray-400">{chunk.timestamp}</span>
                  </div>
                  <p className="text-sm text-gray-700">{chunk.text}</p>
                  {chunk.isQuestion && (
                    <button
                      onClick={() => generateAnswer(chunk.text)}
                      disabled={generatingAnswer}
                      className="mt-2 text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Sparkles size={12} />
                      {generatingAnswer ? 'Generating...' : 'Generate Answer'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Manual Question Input — always visible */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <input
                ref={questionInputRef}
                type="text"
                value={manualQuestion}
                onChange={(e) => setManualQuestion(e.target.value)}
                onKeyDown={handleManualKeyDown}
                placeholder="Type a question for AI..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-400 focus:border-transparent outline-none"
              />
              <button
                onClick={handleManualQuestion}
                disabled={!manualQuestion.trim() || generatingAnswer}
                className="p-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Recording Controls */}
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors ${
                isRecording
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-violet-600 hover:bg-violet-700 text-white'
              }`}
            >
              {isRecording ? (
                <>
                  <MicOff size={20} />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic size={20} />
                  Start Recording
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Panel - AI Suggestions */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">AI Suggestions</h2>
            <button
              onClick={() => {
                const lastQuestion = [...transcript].reverse().find((c) => c.isQuestion)
                if (lastQuestion) {
                  generateAnswer(lastQuestion.text)
                }
              }}
              disabled={generatingAnswer || !transcript.some((c) => c.isQuestion)}
              className="btn-accent text-sm py-2 disabled:opacity-50"
            >
              <Sparkles size={16} />
              {generatingAnswer ? 'Generating...' : 'AI Help'}
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            {suggestions.length === 0 && generatingAnswer ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Generating answer...</p>
                <p className="text-xs mt-1">This may take a moment</p>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <Sparkles size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">AI suggestions will appear here</p>
                <p className="text-xs mt-1">
                  Click "AI Help" or type a question below
                </p>
              </div>
            ) : (
              suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className={`rounded-xl p-4 border ${
                    suggestion.isFallback
                      ? 'bg-amber-50 border-amber-200'
                      : suggestion.provider === 'none'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-gradient-to-br from-violet-50 to-indigo-50 border-violet-100'
                  }`}
                >
                  {/* Provider badge */}
                  <div className="flex items-center gap-2 mb-2">
                    {suggestion.provider && suggestion.provider !== 'unknown' && suggestion.provider !== 'none' && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        suggestion.provider === 'Gemini'
                          ? 'bg-blue-100 text-blue-700'
                          : suggestion.provider === 'DeepSeek'
                            ? 'bg-green-100 text-green-700'
                            : suggestion.provider === 'Ollama' || suggestion.provider?.startsWith('Ollama')
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-600'
                      }`}>
                        {suggestion.provider === 'Gemini' && 'G'}
                        {suggestion.provider === 'DeepSeek' && 'D'}
                        {suggestion.provider?.startsWith('Ollama') && 'O'}
                        {suggestion.provider}
                      </span>
                    )}
                    {suggestion.isFallback && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        Fallback
                      </span>
                    )}
                    {suggestion.provider === 'none' && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Error
                      </span>
                    )}
                    {/* Confidence Badge */}
                    {suggestion.confidence !== undefined && suggestion.confidence > 0 && !suggestion.isFallback && suggestion.provider !== 'none' && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        suggestion.confidence >= 0.7
                          ? 'bg-green-100 text-green-700'
                          : suggestion.confidence >= 0.4
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}>
                        {suggestion.confidence >= 0.7 ? '●' : suggestion.confidence >= 0.4 ? '◐' : '○'}
                        {' '}{Math.round(suggestion.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  {suggestion.question && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">Question detected:</div>
                      <p className="text-sm text-gray-700 italic">"{suggestion.question}"</p>
                    </div>
                  )}

                  <div className="bg-white rounded-lg p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <Logo size={20} showText={false} />
                      </div>
                      <div className="flex-1">
                        <p className={`whitespace-pre-wrap ${
                          suggestion.isFallback
                            ? 'text-amber-800'
                            : suggestion.provider === 'none'
                              ? 'text-red-700'
                              : 'text-gray-800'
                        }`}>{suggestion.answer}</p>
                      </div>
                    </div>
                  </div>

                  {/* Sources display */}
                  {suggestion.sources && !suggestion.isFallback && suggestion.sources !== '[]' && (
                    <div className="mt-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="text-xs text-gray-500 mb-0.5">Sources:</div>
                      <div className="flex flex-wrap gap-1">
                        {(JSON.parse(suggestion.sources) as string[]).map((src: string, i: number) => (
                          <span key={i} className="text-xs text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                            {src}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => copyToClipboard(suggestion.answer)}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <Copy size={12} />
                      Copy
                    </button>
                    <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                      <ThumbsUp size={12} />
                      Good
                    </button>
                    <button
                      onClick={() => generateAnswer(suggestion.question)}
                      disabled={generatingAnswer || !suggestion.question}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <RotateCcw size={12} />
                      Regenerate
                    </button>
                    {suggestion.isFallback && (
                      <span className="text-xs text-amber-500 ml-auto">
                        Response from fallback provider
                      </span>
                    )}
                    {!suggestion.isFallback && suggestion.provider && suggestion.provider !== 'none' && (
                      <span className="text-xs text-gray-400 ml-auto">{suggestion.timestamp}</span>
                    )}
                    {suggestion.provider === 'none' && (
                      <span className="text-xs text-red-400 ml-auto">{suggestion.timestamp}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
