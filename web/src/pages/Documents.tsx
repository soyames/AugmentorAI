import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Plus, FileText, MoreVertical } from 'lucide-react'

interface Document {
  id: string
  filename: string
  doc_type: string
  created_at: string
}

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/documents')
      if (!response.ok) {
        throw new Error('Failed to load documents')
      }
      const data = await response.json()
      setDocuments(data)
    } catch (err) {
      console.error(err)
      setError('Could not load documents from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDocuments()
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
        form.append('doc_type', 'notes')
        const response = await fetch('/api/documents', {
          method: 'POST',
          body: form,
        })
        if (!response.ok) {
          throw new Error('Upload failed')
        }
      }

      await fetchDocuments()
    } catch (err) {
      console.error(err)
      setError('Failed to upload one or more documents.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this document?')) {
      try {
        const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
        if (!response.ok) {
          throw new Error('Delete failed')
        }
        setDocuments((prev) => prev.filter((d) => d.id !== id))
      } catch (err) {
        console.error(err)
        setError('Failed to delete document.')
      }
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <FolderOpen className="text-gray-400" size={24} />
          <h1 className="text-2xl font-semibold text-gray-900">Documents</h1>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-primary disabled:opacity-50"
          disabled={uploading}
        >
          <Plus size={18} />
          {uploading ? 'Uploading...' : 'Add Document +'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          multiple
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
                  Loading documents...
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-gray-500">
                  No documents uploaded yet.
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-gray-400" />
                      <span className="font-medium">{doc.filename}</span>
                      <span className="badge badge-info uppercase">
                        {doc.doc_type}
                      </span>
                    </div>
                  </td>
                  <td className="table-cell text-gray-500">
                    {new Date(doc.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="table-cell">
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <MoreVertical size={18} className="text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            Page 1 • Showing {documents.length} of {documents.length}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary py-1.5 px-3 text-sm" disabled>
              Previous
            </button>
            <button className="btn-secondary py-1.5 px-3 text-sm" disabled>
              Next
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-center text-red-500 text-sm mt-4">{error}</p>
      )}

      {/* Helper text */}
      <div className="text-center mt-6 space-y-2">
        <p className="text-gray-500 text-sm">A list of your Documents.</p>
        <p className="text-gray-500 text-sm">
          You can upload documents to give AI more context to provide more accurate and helpful answers.
        </p>
        <p className="text-gray-400 text-sm">
          For example: Documents about the company, past projects, notes etc.
        </p>
      </div>
    </div>
  )
}
