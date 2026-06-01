import { useEffect, useRef, useState } from 'react'
import { FileText, Upload, Trash2 } from 'lucide-react'

interface Resume {
  id: string
  filename: string
  embedding_status: string
  created_at: string
}

export default function Resumes() {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchResumes = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/documents/resumes')
      if (!response.ok) {
        throw new Error('Failed to load resumes')
      }
      const data = await response.json()
      setResumes(data)
    } catch (err) {
      console.error(err)
      setError('Could not load resumes from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResumes()
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) {
      return
    }

    setUploading(true)
    setError(null)
    try {
      for (const file of files) {
        const form = new FormData()
        form.append('file', file)
        const response = await fetch('/api/documents/resumes', {
          method: 'POST',
          body: form,
        })
        if (!response.ok) {
          throw new Error('Upload failed')
        }
      }
      await fetchResumes()
    } catch (err) {
      console.error(err)
      setError('Failed to upload one or more resumes.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this resume?')) {
      try {
        const response = await fetch(`/api/documents/resumes/${id}`, { method: 'DELETE' })
        if (!response.ok) {
          throw new Error('Delete failed')
        }
        setResumes((prev) => prev.filter((r) => r.id !== id))
      } catch (err) {
        console.error(err)
        setError('Failed to delete resume.')
      }
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <FileText className="text-gray-400" size={24} />
          <h1 className="text-2xl font-semibold text-gray-900">CVs / Resumes</h1>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-primary disabled:opacity-50"
          disabled={uploading}
        >
          <Upload size={18} />
          {uploading ? 'Uploading...' : 'Upload Resume'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Title</th>
              <th className="table-header">Created At</th>
              <th className="table-header w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-gray-500">
                  Loading resumes...
                </td>
              </tr>
            ) : resumes.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-gray-500">
                  No resumes uploaded yet. Upload your first resume to get started.
                </td>
              </tr>
            ) : (
              resumes.map((resume) => (
                <tr key={resume.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{resume.filename}</span>
                      <span className="badge badge-info">
                        {resume.embedding_status}
                      </span>
                    </div>
                  </td>
                  <td className="table-cell text-gray-500">
                    {new Date(resume.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="table-cell">
                    <button
                      onClick={() => handleDelete(resume.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} className="text-red-500" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="text-center text-red-500 text-sm mt-4">{error}</p>
      )}

      {/* Helper text */}
      <p className="text-center text-gray-500 text-sm mt-6">
        A list of your Resumes.
      </p>
    </div>
  )
}
