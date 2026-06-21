import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Mic, MicOff, Globe, Sparkles, Square, Copy, ThumbsUp, RotateCcw, Volume2, AlertCircle, Send, Lightbulb, MessageSquare, Monitor, Code, Cpu } from 'lucide-react'
import { useSessionStore } from '../store/sessionStore'
import Logo from '../components/Logo'

interface StreamingAnswer {
  id: string
  text: string
  provider?: string
  transcriptChunkId?: string
  questionType?: string
  complexity?: string
}

interface TranscriptChunk {
  id: string
  speaker: 'user' | 'interviewer'
  text: string
  timestamp: string
  isQuestion: boolean
  questionType?: string
}

interface AnswerSuggestion {
  id: string
  question: string
  answer: string
  timestamp: string
  provider?: string
  isFallback?: boolean
  confidence?: number
  confidenceScore?: number | null
  confidenceDetails?: Record<string, unknown> | null
  sources?: string
  transcriptChunkId?: string
  questionType?: string
  complexity?: string
  _confidenceUpdated?: number // timestamp for animation trigger
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
  const [streamingAnswers, setStreamingAnswers] = useState<Map<string, StreamingAnswer>>(new Map())
  const [followUps, setFollowUps] = useState<Record<string, { loading: boolean; questions: string[] }>>({})
  // Manual question input fallback
  const [manualQuestion, setManualQuestion] = useState('')
  const [searchParams] = useSearchParams()
  const isCodingMode = searchParams.get('mode') === 'coding'
  const questionInputRef = useRef<HTMLInputElement>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const autoGenerateRef = useRef(autoGenerate)

  const sendStreamConfig = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const config: Record<string, any> = {
        type: 'config',
        autoReply: autoGenerateRef.current,
        language,
      }
      // Include client-side API keys from localStorage (only if present)
      try {
        const openaiKey = localStorage.getItem('augmentorai_openai_api_key')
        const anthropicKey = localStorage.getItem('augmentorai_anthropic_api_key')
        if (openaiKey) config.openai_api_key = openaiKey
        if (anthropicKey) config.anthropic_api_key = anthropicKey
        // Also send model preferences if set
        const openaiModel = localStorage.getItem('augmentorai_openai_model')
        const anthropicModel = localStorage.getItem('augmentorai_anthropic_model')
        if (openaiModel) config.openai_model = openaiModel
        if (anthropicModel) config.anthropic_model = anthropicModel
        // Include preferred provider from localStorage
        const preferredProvider = localStorage.getItem('augmentorai_preferred_provider')
        if (preferredProvider) config.preferred_provider = preferredProvider
      } catch (e) {
        // localStorage not available (shouldn't happen in normal browser)
      }
      wsRef.current.send(JSON.stringify(config))
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

  const generateMockQuestion = async () => {
    if (generatingAnswer) return
    setGeneratingAnswer(true)
    setError(null)
    try {
      const response = await fetch(`/api/sessions/${id}/mock-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      })
      if (response.ok) {
        const data = await response.json()
        const q = data.question
        if (q) {
          const chunk: TranscriptChunk = {
            id: crypto.randomUUID(),
            speaker: 'interviewer',
            text: q,
            timestamp: new Date().toLocaleTimeString(),
            isQuestion: true,
          }
          setTranscript((prev) => [...prev, chunk])
          generateAnswer(q)
        }
      } else {
        let errorDetail = 'Failed to generate mock question.'
        try {
          const errData = await response.json()
          if (errData.detail) errorDetail = errData.detail
        } catch {}
        setError(errorDetail)
      }
    } catch {
      setError('Cannot reach the server to generate mock question.')
    } finally {
      setGeneratingAnswer(false)
    }
  }


  const handleManualKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleManualQuestion()
    }
  }

  const startRecording = async (source: 'mic' | 'system' = 'mic') => {
    setError(null)
    let stream: MediaStream
    try {
      if (source === 'system') {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints,
        })
        displayStream.getVideoTracks().forEach((t) => t.stop())
        if (displayStream.getAudioTracks().length === 0) {
          displayStream.getTracks().forEach((t) => t.stop())
          setError('No audio shared. Select a tab/window and check "Share audio" when prompted.')
          return
        }
        stream = displayStream
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError(source === 'system'
          ? 'Screen sharing denied. Click "Meeting Audio" and allow when prompted.'
          : 'Microphone access denied. Allow microphone in browser settings, or type your question manually below.')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No microphone found. Connect a microphone or type your question manually below.')
      } else {
        setError(`Audio error: ${err}`)
      }
      return
    }
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
          // Boost mic audio 3x for better Whisper transcription
          const isMic = streamRef.current?.getAudioTracks()?.[0]?.label?.toLowerCase().includes('microphone') ?? true
          const gain = isMic ? 3.0 : 1.0
          const amplified = new Float32Array(input.length)
          for (let i = 0; i < input.length; i++) {
            amplified[i] = input[i] * gain
          }
          buffer.push(amplified)
          bufferSize += amplified.length

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
              questionType: data.chunk.questionType,
            }
            setTranscript((prev) => [...prev, chunk])
          } else if (data.type === 'answer_chunk') {
            // Token-by-token streaming — append to a streaming buffer
            setStreamingAnswers((prev) => {
              const existing = prev.get(data.answerId)
              const newText = (existing?.text || '') + data.token
              const updated = new Map(prev)
              updated.set(data.answerId, {
                id: data.answerId,
                text: newText,
                provider: data.provider,
                transcriptChunkId: data.transcriptChunkId,
                questionType: data.questionType || existing?.questionType,
                complexity: data.complexity || existing?.complexity,
              })
              return updated
            })
          } else if (data.type === 'answer') {
            // Remove from streaming buffer and add to finalized suggestions
            setStreamingAnswers((prev) => {
              const updated = new Map(prev)
              updated.delete(data.answer.id)
              return updated
            })
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
                transcriptChunkId: data.answer.transcriptChunkId,
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
          } else if (data.type === 'confidence_update') {
            // Real-time confidence badge update — update matching suggestion without re-rendering answer text
            setSuggestions((prev) => {
              const idx = prev.findIndex(
                (s) => s.id === data.answerId || (data.transcriptChunkId && s.transcriptChunkId === data.transcriptChunkId)
              )
              if (idx === -1) return prev
              const updated = [...prev]
              updated[idx] = {
                ...updated[idx],
                confidence: data.confidence,
                confidenceScore: data.confidence_score,
                confidenceDetails: data.details,
                provider: data.provider || updated[idx].provider,
                isFallback: data.is_fallback ?? updated[idx].isFallback,
                _confidenceUpdated: Date.now(), // triggers re-render with animation
              }
              return updated
            })
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
  }

  const stopRecording = () => {
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
      gainNodeRef.current = null
    }
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

  const getFollowUps = async (suggestionId: string, question: string, answer: string) => {
    if (followUps[suggestionId]?.loading) return
    setFollowUps((prev) => ({ ...prev, [suggestionId]: { loading: true, questions: [] } }))
    try {
      const res = await fetch(`/api/sessions/${id}/follow-up-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, count: 3 }),
      })
      if (res.ok) {
        const data = await res.json()
        setFollowUps((prev) => ({ ...prev, [suggestionId]: { loading: false, questions: data.questions || [] } }))
      } else {
        setFollowUps((prev) => ({ ...prev, [suggestionId]: { loading: false, questions: [] } }))
      }
    } catch {
      setFollowUps((prev) => ({ ...prev, [suggestionId]: { loading: false, questions: [] } }))
    }
  }

  const endSession = () => {
    stopRecording()
    navigate(`/sessions/${id}/transcript`)
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-xl border-b border-white/50 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Logo size={32} showText={false} />
          <div>
            <h1 className="font-semibold text-gray-900">
              {currentSession?.title || 'Live Session'}
              {isCodingMode && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <Code size={12} />
                  Coding
                </span>
              )}
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

          {/* Conversation Mode */}
          <button
            onClick={() => navigate(`/sessions/${id}/conversation`)}
            className="btn-secondary text-sm py-2 bg-white/50 hover:bg-white/80 transition-all border-white/50"
          >
            <MessageSquare size={16} />
            Conversation
          </button>

          {/* Mock Interviewer */}
          <button
            onClick={generateMockQuestion}
            disabled={generatingAnswer}
            className="btn-primary text-sm py-2 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            <Sparkles size={16} />
            Mock Question
          </button>

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
        <div className="w-96 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col transition-all">
          <div className="p-4 border-b border-white/40">
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
                  } ${chunk.isQuestion ? 'border-l-4 border-yellow-400' : ''} ${(chunk as any).questionType === 'coding' ? 'border-emerald-400' : chunk.isQuestion ? 'border-yellow-400' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {chunk.speaker === 'interviewer' ? 'Interviewer' : 'You'}
                    </span>
                    <div className="flex items-center gap-2">
                      {(chunk as any).questionType && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          (chunk as any).questionType === 'coding' ? 'bg-emerald-100 text-emerald-700' :
                          (chunk as any).questionType === 'system_design' ? 'bg-blue-100 text-blue-700' :
                          (chunk as any).questionType === 'behavioral' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {(chunk as any).questionType === 'coding' ? <><Cpu size={10} className="inline mr-0.5" />Code</> :
                           (chunk as any).questionType === 'system_design' ? 'Design' :
                           (chunk as any).questionType === 'behavioral' ? 'Behavioral' :
                           (chunk as any).questionType}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{chunk.timestamp}</span>
                    </div>
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
          <div className="p-4 border-t border-gray-100 space-y-2">
            {isRecording ? (
              <button
                onClick={stopRecording}
                className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                <MicOff size={20} />
                Stop Recording
              </button>
            ) : (
              <>
                <button
                  onClick={() => startRecording('mic')}
                  className="w-full py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                >
                  <Mic size={18} />
                  Start (Microphone)
                </button>
                <button
                  onClick={() => startRecording('system')}
                  className="w-full py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                  title="Capture audio from Zoom, Teams, YouTube, etc."
                >
                  <Monitor size={18} />
                  Meeting Audio
                </button>
              </>
            )}
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
            {/* Streaming answer in progress */}
            {Array.from(streamingAnswers.entries()).map(([id, sa]) => (
              <div key={id} className={`rounded-xl p-4 border ${isCodingMode || sa.questionType === 'coding' ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50' : 'border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50'}`}>
                <div className="flex items-center gap-2 text-sm mb-2">
                  <span className={`w-2 h-2 rounded-full animate-pulse ${isCodingMode || sa.questionType === 'coding' ? 'bg-emerald-500' : 'bg-violet-500'}`} />
                  <span className={isCodingMode || sa.questionType === 'coding' ? 'text-emerald-600' : 'text-violet-600'}>
                    {sa.questionType === 'coding' ? 'Solving...' : 'Answering...'}
                  </span>
                  {sa.complexity && (
                    <span className="text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      {sa.complexity}
                    </span>
                  )}
                  {sa.provider && <span className="text-xs text-gray-400 capitalize">({sa.provider})</span>}
                </div>
                {isCodingMode || sa.questionType === 'coding' ? (
                  <pre className="text-sm text-gray-700 font-mono whitespace-pre-wrap bg-gray-900/5 rounded-lg p-3 overflow-x-auto">{sa.text}<span className="inline-block w-0.5 h-4 bg-emerald-500 animate-pulse ml-0.5 align-middle" /></pre>
                ) : (
                  <p className="text-gray-700 text-sm whitespace-pre-wrap">{sa.text}<span className="inline-block w-0.5 h-4 bg-violet-500 animate-pulse ml-0.5" /></p>
                )}
              </div>
            ))}
            {suggestions.length === 0 && generatingAnswer && streamingAnswers.size === 0 ? (
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
                      } ${suggestion._confidenceUpdated && Date.now() - suggestion._confidenceUpdated < 2000 ? 'ring-2 ring-offset-1 animate-pulse' : ''}`}>
                        {suggestion.confidence >= 0.7 ? '�?' : suggestion.confidence >= 0.4 ? '�?' : '○'}
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
                    <button
                      onClick={() => getFollowUps(suggestion.id, suggestion.question, suggestion.answer)}
                      disabled={!suggestion.question || suggestion.isFallback}
                      className="text-xs text-violet-500 hover:text-violet-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <Lightbulb size={12} />
                      Follow-ups
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
                  {followUps[suggestion.id]?.loading && (
                    <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-2 text-xs text-amber-600">
                        <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        Generating follow-up questions...
                      </div>
                    </div>
                  )}
                  {followUps[suggestion.id]?.questions?.length > 0 && (
                    <div className="mt-3 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-1 text-xs font-medium text-amber-700 mb-1.5">
                        <Lightbulb size={12} />
                        Suggested Follow-ups
                      </div>
                      <div className="space-y-1">
                        {followUps[suggestion.id].questions.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              const chunk = { id: crypto.randomUUID(), speaker: 'interviewer' as const, text: q, timestamp: new Date().toLocaleTimeString(), isQuestion: true }
                              setTranscript((prev) => [...prev, chunk])
                              generateAnswer(q)
                            }}
                            className="block w-full text-left text-xs text-amber-800 hover:text-amber-900 hover:bg-amber-100 rounded px-2 py-1 transition-colors"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}



