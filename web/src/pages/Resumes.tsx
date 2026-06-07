import { useEffect, useRef, useState } from 'react'
import { FileText, Upload, Trash2, RefreshCw, CheckCircle, Clock, XCircle, AlertCircle, RotateCcw } from 'lucide-react'

interface Resume {
  id: string
  filename: string
  embedding_status: string
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    completed:      { label: 'Ready',       className: 'bg-green-100 text-green-700',  icon: <CheckCircle size={11} /> },
    text_extracted: { label: 'Extracted',   className: 'bg-blue-100 text-blue-700',   icon: <CheckCircle size={11} /> },
    processing:     { label: 'Processing…', className: 'bg-yellow-100 text-yellow-700 animate-pulse', icon: <Clock size={11} /> },
    pending:        { label: 'Pending',     className: 'bg-yellow-100 text-yellow-700', icon: <Clock size={11} /> },
    failed:         { label: 'Failed',      className: 'bg-red-100 text-red-700',     icon: <XCircle size={11} /> },
    no_text:        { label: 'Empty file',  className: 'bg-gray-100 text-gray-600',   icon: <AlertCircle size={11} /> },
  }
  const cfg = configs[status] ?? { label: status, className: 'bg-gray-100 text-gray-600', icon: null }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

export default function Resumes() {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchResumes = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/documents/resumes')
      if (!response.ok) throw new Error('Failed to load resumes')
      const data: Resume[] = await response.json()
      setResumes(data)
      return data
    } catch (err) {
      console.error(err)
      if (!silent) setError('Could not load resumes from the server.')
      return null
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    fetchResumes()
  }, [])

  // Poll while any resume is processing
  useEffect(() => {
    const hasProcessing = resumes.some(
      (r) => r.embedding_status === 'pending' || r.embedding_status === 'processing',
    )
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        const data = await fetchResumes(true)
        if (data && !data.some((r) => r.embedding_status === 'pending' || r.embedding_status === 'processing')) {
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
        }
      }, 3000)
    } else if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }
  }, [resumes])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setUploading(true)
    setError(null)
    const failed: string[] = []
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const response = await fetch('/api/documents/resumes', { method: 'POST', body: form })
        if (!response.ok) failed.push(file.name)
      }
      if (failed.length) setError(`Failed to upload: ${failed.join(', ')}`)
      await fetchResumes()
    } catch (err) {
      console.error(err)
      setError('Upload error. Is the server running?')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleReprocess = async (id: string) => {
    try {
      const response = await fetch(`/api/documents/resumes/${id}/reprocess`, { method: 'POST' })
      if (!response.ok) throw new Error('Reprocess failed')
      await fetchResumes()
    } catch (err) {
      console.error(err)
      setError('Failed to start reprocessing.')
    }
  }

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Delete "${filename}"?`)) return
    try {
      const response = await fetch(`/api/documents/resumes/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Delete failed')
      setResumes((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      console.error(err)
      setError('Failed to delete resume.')
    }
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <FileText className="text-gray-400" size={24} />
          <h1 className="text-2xl font-semibold text-gray-900">CVs / Resumes</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchResumes()} className="btn-secondary" title="Refresh">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary disabled:opacity-50"
            disabled={uploading}
          >
            <Upload size={18} />
            {uploading ? 'Uploading…' : 'Upload Resume'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">File</th>
              <th className="table-header">Status</th>
              <th className="table-header">Added</th>
              <th className="table-header w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={4} className="py-12 text-center text-gray-500">Loading…</td></tr>
            ) : resumes.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-gray-500">
                  No resumes uploaded yet. Upload your CV/resume to get started.
                </td>
              </tr>
            ) : (
              resumes.map((resume) => (
                <tr key={resume.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-sm truncate max-w-xs">{resume.filename}</span>
                    </div>
                  </td>
                  <td className="table-cell">
                    <StatusBadge status={resume.embedding_status} />
                  </td>
                  <td className="table-cell text-gray-500 text-sm">
                    {new Date(resume.created_at).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      {(resume.embedding_status === 'failed' || resume.embedding_status === 'no_text') && (
                        <button
                          onClick={() => handleReprocess(resume.id)}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-colors text-gray-400 hover:text-blue-500"
                          title="Retry text extraction"
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(resume.id, resume.filename)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-500"
                        title="Delete resume"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {resumes.length} resume{resumes.length !== 1 ? 's' : ''}
            {resumes.some(r => r.embedding_status === 'processing' || r.embedding_status === 'pending') && (
              <span className="ml-2 text-yellow-600 text-xs animate-pulse">• Processing…</span>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mt-6 space-y-1">
        <p className="text-gray-500 text-sm">Supported formats: <strong>PDF, DOCX, TXT</strong></p>
        <p className="text-gray-400 text-sm">
          Your resume gives the AI context about your skills and experience so answers are tailored to you.
          <br/>Status shows <em>Ready</em> once the file is processed.
        </p>
      </div>
    </div>
  )
}
