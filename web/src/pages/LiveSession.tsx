import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Mic, MicOff, Globe, Sparkles, Square, Copy, ThumbsUp, RotateCcw, Volume2, AlertCircle } from 'lucide-react'
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

  const transcriptRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const autoGenerateRef = useRef(autoGenerate)

  // Keep ref in sync with state
  useEffect(() => {
    autoGenerateRef.current = autoGenerate
  }, [autoGenerate])

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
          },
          ...prev,
        ])
      } else {
        setSuggestions((prev) => [
          {
            id: crypto.randomUUID(),
            question,
            answer: 'Failed to generate answer. Check that the backend is running.',
            timestamp: new Date().toLocaleTimeString(),
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
        },
        ...prev,
      ])
    } finally {
      setGeneratingAnswer(false)
    }
  }, [id, language, generatingAnswer])

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Connect WebSocket through Vite proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/sessions/${id}/stream`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setIsRecording(true)

        // Create AudioContext at 16kHz for Whisper compatibility
        const audioContext = new AudioContext({ sampleRate: 16000 })
        audioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        // 4096 samples = ~256ms at 16kHz
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        let buffer: Float32Array[] = []
        let bufferSize = 0
        // Send ~2 seconds of audio at a time
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

            // Convert float32 [-1,1] to int16 [-32768,32767]
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

            if (chunk.isQuestion && autoGenerateRef.current) {
              generateAnswer(chunk.text)
            }
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onerror = () => {
        setError('Could not connect to the server. Make sure the backend is running (npm start).')
        stopRecording()
      }

      ws.onclose = () => {
        if (isRecording) {
          setIsRecording(false)
        }
      }
    } catch (err) {
      console.error('Failed to start recording:', err)
      setError('Failed to access microphone. Please allow microphone permissions.')
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
                  Requires backend running
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
            {suggestions.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                <Sparkles size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">AI suggestions will appear here</p>
                <p className="text-xs mt-1">
                  Click "AI Help" or enable auto-generate
                </p>
              </div>
            ) : (
              suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl p-4 border border-violet-100"
                >
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
                        <p className="text-gray-800 whitespace-pre-wrap">{suggestion.answer}</p>
                      </div>
                    </div>
                  </div>

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
                      disabled={generatingAnswer}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <RotateCcw size={12} />
                      Regenerate
                    </button>
                    <span className="text-xs text-gray-400 ml-auto">{suggestion.timestamp}</span>
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
