import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, Menu, ExternalLink, Trash2, Building2 } from 'lucide-react'
import { useSessionStore, Session } from '../store/sessionStore'

export default function Sessions() {
  const { sessions, fetchSessions, deleteSession } = useSessionStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions().finally(() => setLoading(false))
  }, [fetchSessions])

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this session?')) {
      await deleteSession(id)
    }
  }

  const getModeIcon = (mode: string) => {
    return mode === 'interview' ? Building2 : MessageSquare
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <MessageSquare className="text-gray-400" size={24} />
          <h1 className="text-2xl font-semibold text-gray-900">Call Sessions</h1>
        </div>
        <div className="flex gap-3">
          <Link to="/sessions/new" className="btn-primary">
            Start Session
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Title</th>
              <th className="table-header">Description</th>
              <th className="table-header">Mode</th>
              <th className="table-header">Status</th>
              <th className="table-header">AI Usage</th>
              <th className="table-header">Created At</th>
              <th className="table-header w-32"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-500">
                  Loading sessions...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-500">
                  No sessions yet. Create your first session to get started.
                </td>
              </tr>
            ) : (
              sessions.map((session: Session) => {
                const ModeIcon = getModeIcon(session.mode)
                return (
                  <tr key={session.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{session.title}</td>
                    <td className="table-cell text-gray-600">
                      {session.description || '-'}
                    </td>
                    <td className="table-cell">
                      <ModeIcon size={18} className="text-gray-400" />
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${
                        session.status === 'active'
                          ? 'badge-success'
                          : session.status === 'ended'
                          ? 'badge-info'
                          : 'badge-warning'
                      }`}>
                        {session.status || 'Ended'}
                      </span>
                    </td>
                    <td className="table-cell">{session.ai_usage || 0}</td>
                    <td className="table-cell text-gray-500">
                      {new Date(session.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/sessions/${session.id}/transcript`}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="View transcript"
                        >
                          <Menu size={18} className="text-gray-600" />
                        </Link>
                        <Link
                          to={`/sessions/${session.id}/live`}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Open session"
                        >
                          <ExternalLink size={18} className="text-gray-600" />
                        </Link>
                        <button
                          onClick={() => handleDelete(session.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete session"
                        >
                          <Trash2 size={18} className="text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            Page 1 • Showing {sessions.length} of {sessions.length}
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

      {/* Helper text */}
      <p className="text-center text-gray-500 text-sm mt-6">
        A list of your Interview Sessions.
      </p>
    </div>
  )
}
