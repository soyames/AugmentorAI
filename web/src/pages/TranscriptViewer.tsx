import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Download, ArrowLeft, FileText, Sparkles, Clock, MessageSquare } from 'lucide-react'

interface TranscriptEntry {
  id: string
  speaker: 'user' | 'interviewer'
  text: string
  timestamp: string
  isQuestion: boolean
  answer?: string
}

export default function TranscriptViewer() {
  const { id } = useParams<{ id: string }>()
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionTitle, setSessionTitle] = useState('Session')
  const [durationSeconds, setDurationSeconds] = useState(0)

  useEffect(() => {
    if (!id) return

    const loadData = async () => {
      try {
        // Fetch session info
        const sessionRes = await fetch(`/api/sessions/${id}`)
        if (sessionRes.ok) {
          const session = await sessionRes.json()
          setSessionTitle(session.title)
          const created = new Date(session.created_at)
          const updated = new Date(session.updated_at)
          setDurationSeconds(Math.round((updated.getTime() - created.getTime()) / 1000))
        }

        // Fetch transcript chunks
        const transcriptRes = await fetch(`/api/sessions/${id}/transcript`)
        if (transcriptRes.ok) {
          const chunks = await transcriptRes.json()
          const entries: TranscriptEntry[] = chunks.map((chunk: {
            id: string
            speaker: string
            text: string
            is_question: boolean
            timestamp_start?: number
            created_at: string
          }) => ({
            id: chunk.id,
            speaker: chunk.speaker as 'user' | 'interviewer',
            text: chunk.text,
            timestamp: new Date(chunk.created_at).toLocaleTimeString(),
            isQuestion: chunk.is_question,
          }))
          setTranscript(entries)
        }
      } catch (err) {
        console.error('Failed to load transcript:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id])

  const exportTranscript = (format: 'txt' | 'json') => {
    let content: string
    let filename: string
    let mimeType: string

    if (format === 'json') {
      content = JSON.stringify(transcript, null, 2)
      filename = `transcript-${id}.json`
      mimeType = 'application/json'
    } else {
      content = transcript
        .map((entry) => `[${entry.timestamp}] ${entry.speaker.toUpperCase()}: ${entry.text}`)
        .join('\n\n')
      filename = `transcript-${id}.txt`
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

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-gray-500">Loading transcript...</div>
      </div>
    )
  }

  const stats = {
    total: transcript.length,
    questions: transcript.filter((t) => t.isQuestion).length,
    answers: transcript.filter((t) => t.answer).length,
    duration: formatDuration(durationSeconds),
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link
            to="/sessions"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{sessionTitle}</h1>
            <p className="text-gray-500 text-sm">Session Transcript</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportTranscript('txt')}
            className="btn-secondary"
            disabled={transcript.length === 0}
          >
            <Download size={18} />
            Export TXT
          </button>
          <button
            onClick={() => exportTranscript('json')}
            className="btn-secondary"
            disabled={transcript.length === 0}
          >
            <Download size={18} />
            Export JSON
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="card py-4 text-center">
          <MessageSquare size={20} className="mx-auto text-gray-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Entries</div>
        </div>
        <div className="card py-4 text-center">
          <FileText size={20} className="mx-auto text-yellow-500 mb-2" />
          <div className="text-2xl font-bold text-yellow-600">{stats.questions}</div>
          <div className="text-sm text-gray-500">Questions</div>
        </div>
        <div className="card py-4 text-center">
          <Sparkles size={20} className="mx-auto text-violet-500 mb-2" />
          <div className="text-2xl font-bold text-violet-600">{stats.answers}</div>
          <div className="text-sm text-gray-500">AI Answers</div>
        </div>
        <div className="card py-4 text-center">
          <Clock size={20} className="mx-auto text-gray-400 mb-2" />
          <div className="text-2xl font-bold text-gray-900">{stats.duration}</div>
          <div className="text-sm text-gray-500">Duration</div>
        </div>
      </div>

      {/* Transcript */}
      {transcript.length === 0 ? (
        <div className="card text-center py-16">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No transcript yet</h3>
          <p className="text-gray-500 mb-6">
            Start a live session to generate a transcript
          </p>
          <Link to={`/sessions/${id}/live`} className="btn-primary">
            Start Session
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {transcript.map((entry) => (
            <div
              key={entry.id}
              className={`card ${entry.isQuestion ? 'border-l-4 border-l-yellow-400' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium ${
                      entry.speaker === 'interviewer' ? 'text-gray-700' : 'text-violet-600'
                    }`}
                  >
                    {entry.speaker === 'interviewer' ? 'Interviewer' : 'You'}
                  </span>
                  {entry.isQuestion && (
                    <span className="badge badge-warning">Question</span>
                  )}
                </div>
                <span className="text-sm text-gray-400">{entry.timestamp}</span>
              </div>
              <p className="text-gray-700">{entry.text}</p>

              {entry.answer && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-violet-600 mb-2">
                    <Sparkles size={14} />
                    AI Suggested Answer
                  </div>
                  <p className="text-gray-600 text-sm bg-violet-50 rounded-lg p-3">
                    {entry.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
