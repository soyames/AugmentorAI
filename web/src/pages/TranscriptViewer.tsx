import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Download, ArrowLeft, FileText, Sparkles, Clock, MessageSquare,
  ChevronDown, ChevronRight, BookOpen, CheckCircle, Zap, Layers
} from 'lucide-react'

interface TranscriptEntry {
  id: string
  speaker: 'user' | 'interviewer'
  text: string
  timestamp: string
  isQuestion: boolean
}

interface AnswerEntry {
  id: string
  question: string
  answer_text: string
  confidence: number
  confidence_score: number | null
  confidence_details: string | null
  language: string
  provider: string
  is_fallback: boolean
  sources: string | null
  transcript_chunk_id: string | null
  created_at: string
}

interface QAPair {
  question: TranscriptEntry
  answer?: AnswerEntry
}

type ViewMode = 'timeline' | 'qa'

export default function TranscriptViewer() {
  const { id } = useParams<{ id: string }>()
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [answers, setAnswers] = useState<AnswerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionTitle, setSessionTitle] = useState('Session')
  const [sessionMode, setSessionMode] = useState('interview')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return

    const loadData = async () => {
      try {
        const [sessionRes, transcriptRes, answersRes] = await Promise.all([
          fetch(`/api/sessions/${id}`),
          fetch(`/api/sessions/${id}/transcript`),
          fetch(`/api/sessions/${id}/answers`),
        ])

        if (sessionRes.ok) {
          const session = await sessionRes.json()
          setSessionTitle(session.title)
          setSessionMode(session.mode)
          const created = new Date(session.created_at)
          const updated = new Date(session.updated_at)
          setDurationSeconds(Math.round((updated.getTime() - created.getTime()) / 1000))
        }

        if (transcriptRes.ok) {
          const chunks = await transcriptRes.json()
          const entries: TranscriptEntry[] = chunks.map((chunk: {
            id: string; speaker: string; text: string
            is_question: boolean; created_at: string
          }) => ({
            id: chunk.id,
            speaker: chunk.speaker as 'user' | 'interviewer',
            text: chunk.text,
            timestamp: new Date(chunk.created_at).toLocaleTimeString(),
            isQuestion: chunk.is_question,
          }))
          setTranscript(entries)
        }

        if (answersRes.ok) {
          setAnswers(await answersRes.json())
        }
      } catch (err) {
        console.error('Failed to load session data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id])

  // Build Q&A pairs by matching answer.transcript_chunk_id or question text
  const buildQAPairs = (): QAPair[] => {
    const answerMap = new Map<string, AnswerEntry>()
    const answerByQuestion = new Map<string, AnswerEntry>()

    for (const a of answers) {
      if (a.transcript_chunk_id) {
        answerMap.set(a.transcript_chunk_id, a)
      }
      if (a.question) {
        answerByQuestion.set(a.question.toLowerCase().trim(), a)
      }
    }

    const pairs: QAPair[] = []
    for (const entry of transcript) {
      if (!entry.isQuestion) continue
      const matched =
        answerMap.get(entry.id) ||
        answerByQuestion.get(entry.text.toLowerCase().trim())
      pairs.push({ question: entry, answer: matched })
    }
    return pairs
  }

  const qaPairs = buildQAPairs()

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const exportTranscript = (format: 'txt' | 'json') => {
    let content: string
    let filename: string
    let mimeType: string

    if (format === 'json') {
      content = JSON.stringify({ transcript, answers, qaPairs }, null, 2)
      filename = `session-${id}.json`
      mimeType = 'application/json'
    } else {
      const lines: string[] = []
      const answerLookup = new Map(answers.map(a => [a.transcript_chunk_id, a]))
      for (const entry of transcript) {
        lines.push(`[${entry.timestamp}] ${entry.speaker.toUpperCase()}: ${entry.text}`)
        if (entry.isQuestion) {
          const ans = answerLookup.get(entry.id)
          if (ans) {
            lines.push(`  → AI: ${ans.answer_text}`)
          }
        }
      }
      content = lines.join('\n\n')
      filename = `session-${id}.txt`
      mimeType = 'text/plain'
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleAnswer = (id: string) => {
    setExpandedAnswers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading session data...</div>
      </div>
    )
  }

  const stats = {
    total: transcript.length,
    questions: qaPairs.length,
    answers: qaPairs.filter((p) => p.answer).length,
    answeredPct: qaPairs.length > 0
      ? Math.round((qaPairs.filter((p) => p.answer).length / qaPairs.length) * 100)
      : 0,
    duration: formatDuration(durationSeconds),
  }

  const confidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 0.5) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const parseSources = (sourcesJson: string | null): string[] => {
    if (!sourcesJson) return []
    try {
      const parsed = JSON.parse(sourcesJson)
      return Array.isArray(parsed) ? parsed : [sourcesJson]
    } catch {
      return [sourcesJson]
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/sessions" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{sessionTitle}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Session Replay</span>
              <span className="text-gray-300">·</span>
              <span className="capitalize">{sessionMode}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportTranscript('txt')} className="btn-secondary" disabled={transcript.length === 0}>
            <Download size={18} />
            Export TXT
          </button>
          <button onClick={() => exportTranscript('json')} className="btn-secondary" disabled={transcript.length === 0}>
            <Download size={18} />
            Export JSON
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="card py-3 text-center">
          <MessageSquare size={18} className="mx-auto text-gray-400 mb-1" />
          <div className="text-xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-xs text-gray-500">Entries</div>
        </div>
        <div className="card py-3 text-center">
          <FileText size={18} className="mx-auto text-yellow-500 mb-1" />
          <div className="text-xl font-bold text-yellow-600">{stats.questions}</div>
          <div className="text-xs text-gray-500">Questions</div>
        </div>
        <div className="card py-3 text-center">
          <Sparkles size={18} className="mx-auto text-violet-500 mb-1" />
          <div className="text-xl font-bold text-violet-600">{stats.answers}</div>
          <div className="text-xs text-gray-500">Answered</div>
        </div>
        <div className="card py-3 text-center">
          <CheckCircle size={18} className="mx-auto text-green-500 mb-1" />
          <div className="text-xl font-bold text-green-600">{stats.answeredPct}%</div>
          <div className="text-xs text-gray-500">Coverage</div>
        </div>
        <div className="card py-3 text-center">
          <Clock size={18} className="mx-auto text-gray-400 mb-1" />
          <div className="text-xl font-bold text-gray-900">{stats.duration}</div>
          <div className="text-xs text-gray-500">Duration</div>
        </div>
      </div>

      {/* View mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setViewMode('timeline')}
          className={`btn-sm ${viewMode === 'timeline' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Layers size={16} />
          Timeline
        </button>
        <button
          onClick={() => setViewMode('qa')}
          className={`btn-sm ${viewMode === 'qa' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Zap size={16} />
          Q&A Review
        </button>
      </div>

      {/* Empty state */}
      {transcript.length === 0 && (
        <div className="card text-center py-16">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No transcript yet</h3>
          <p className="text-gray-500 mb-6">Start a live session to generate a transcript</p>
          <Link to={`/sessions/${id}/live`} className="btn-primary">Start Session</Link>
        </div>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && transcript.length > 0 && (
        <div className="space-y-3">
          {transcript.map((entry) => {
            const linkedAnswer = answers.find(a => a.transcript_chunk_id === entry.id)
            return (
              <div
                key={entry.id}
                className={`card ${entry.isQuestion ? 'border-l-4 border-l-yellow-400' : ''}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${entry.speaker === 'interviewer' ? 'text-gray-700' : 'text-violet-600'}`}>
                      {entry.speaker === 'interviewer' ? 'Interviewer' : 'You'}
                    </span>
                    {entry.isQuestion && <span className="badge badge-warning">Question</span>}
                    {linkedAnswer && <span className="text-xs text-violet-500">✓ answered</span>}
                  </div>
                  <span className="text-sm text-gray-400">{entry.timestamp}</span>
                </div>
                <p className="text-gray-700">{entry.text}</p>

                {linkedAnswer && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-violet-600 mb-1">
                      <Sparkles size={14} />
                      AI Suggested Answer
                    </div>
                    <p className="text-gray-600 text-sm bg-violet-50 rounded-lg p-3">
                      {linkedAnswer.answer_text}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-medium text-gray-400 capitalize">{linkedAnswer.provider}</span>
                      {linkedAnswer.confidence_score != null && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${confidenceColor(linkedAnswer.confidence_score)}`}>
                          {(linkedAnswer.confidence_score * 100).toFixed(0)}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Q&A Review View */}
      {viewMode === 'qa' && transcript.length > 0 && (
        <div className="space-y-4">
          {qaPairs.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">No questions found in this session.</p>
            </div>
          ) : (
            qaPairs.map((pair, idx) => (
              <div key={pair.question.id} className="card border-l-4 border-l-violet-400">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-500">Q{idx + 1}</span>
                    <span className="text-sm text-gray-400">{pair.question.timestamp}</span>
                  </div>
                  {pair.answer && pair.answer.confidence_score != null && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${confidenceColor(pair.answer.confidence_score)}`}>
                      {(pair.answer.confidence_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>

                <p className="text-gray-900 font-medium mb-3">{pair.question.text}</p>

                {pair.answer ? (
                  <>
                    <div className="bg-violet-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-sm text-violet-600 mb-2">
                        <Sparkles size={14} />
                        AI Answer
                      </div>
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">{pair.answer.answer_text}</p>

                      {/* Provider & meta */}
                      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-400">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                          pair.answer.provider === 'gemini' ? 'bg-blue-50 text-blue-600' :
                          pair.answer.provider === 'deepseek' ? 'bg-green-50 text-green-600' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {pair.answer.provider}
                        </span>
                        {pair.answer.is_fallback && (
                          <span className="text-yellow-500">fallback</span>
                        )}
                        {pair.answer.language && pair.answer.language !== 'en' && (
                          <span>{pair.answer.language.toUpperCase()}</span>
                        )}
                      </div>

                      {/* Sources */}
                      {pair.answer.sources && (
                        <button
                          onClick={() => toggleAnswer(pair.answer!.id)}
                          className="flex items-center gap-1 text-xs text-violet-500 hover:text-violet-700 mt-2"
                        >
                          {expandedAnswers.has(pair.answer.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <BookOpen size={14} />
                          Sources ({parseSources(pair.answer.sources).length})
                        </button>
                      )}
                      {pair.answer.sources && expandedAnswers.has(pair.answer.id) && (
                        <div className="mt-2 space-y-1">
                          {parseSources(pair.answer.sources).map((src, i) => (
                            <div key={i} className="text-xs text-gray-500 bg-white rounded p-2 border border-gray-100">
                              {src}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Confidence details */}
                      {pair.answer.confidence_details && (
                        <button
                          onClick={() => toggleAnswer(`details-${pair.answer!.id}`)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mt-1"
                        >
                          {expandedAnswers.has(`details-${pair.answer!.id}`) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          Confidence Details
                        </button>
                      )}
                      {pair.answer.confidence_details && expandedAnswers.has(`details-${pair.answer!.id}`) && (
                        <div className="mt-2 bg-white rounded p-3 border border-gray-100">
                          <pre className="text-xs text-gray-500 whitespace-pre-wrap font-mono">
                            {(() => {
                              try {
                                return JSON.stringify(JSON.parse(pair.answer!.confidence_details!), null, 2)
                              } catch {
                                return pair.answer!.confidence_details
                              }
                            })()}
                          </pre>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 italic bg-gray-50 rounded-lg p-3">
                    No AI answer generated for this question.
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
