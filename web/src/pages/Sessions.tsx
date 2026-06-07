import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, Menu, ExternalLink, Trash2, Building2, Code, Plus } from 'lucide-react'
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
    switch (mode) {
      case 'interview': return Building2
      case 'coding': return Code
      default: return MessageSquare
    }
  }

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'interview': return 'Interview'
      case 'coding': return 'Coding'
      default: return 'Meeting'
    }
  }

  const statusBadge = (status: string | undefined | null) => {
    const cls = status === 'active' ? 'badge-success' : status === 'ended' ? 'badge-info' : 'badge-warning'
    const label = status || 'Ended'
    return <span className={`badge ${cls}`}>{label}</span>
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <MessageSquare className="text-gray-400 shrink-0" size={24} />
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Call Sessions</h1>
        </div>
        <Link to="/sessions/new" className="btn-primary w-full sm:w-auto justify-center">
          <Plus size={18} />
          Start Session
        </Link>
      </div>

      {loading ? (
        <div className="card py-12 text-center text-gray-500">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="card py-12 text-center text-gray-500 space-y-3">
          <MessageSquare size={48} className="mx-auto text-gray-300" />
          <p>No sessions yet. Create your first session to get started.</p>
          <Link to="/sessions/new" className="btn-primary inline-flex mx-auto mt-2">
            <Plus size={18} />
            Create Session
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden sm:block card p-0 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Title</th>
                  <th className="table-header">Mode</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">AI Usage</th>
                  <th className="table-header">Created</th>
                  <th className="table-header w-32"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((session: Session) => {
                  const ModeIcon = getModeIcon(session.mode)
                  return (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="table-cell">
                        <div className="font-medium text-gray-900">{session.title}</div>
                        {session.description && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{session.description}</div>
                        )}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <ModeIcon size={16} className="text-gray-400" />
                          {getModeLabel(session.mode)}
                        </div>
                      </td>
                      <td className="table-cell">{statusBadge(session.status)}</td>
                      <td className="table-cell text-gray-600">{session.ai_usage || 0}</td>
                      <td className="table-cell text-gray-500 text-sm">{formatDate(session.created_at)}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1">
                          <Link to={`/sessions/${session.id}/transcript`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="View transcript">
                            <Menu size={18} className="text-gray-600" />
                          </Link>
                          <Link to={`/sessions/${session.id}/live`} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Open session">
                            <ExternalLink size={18} className="text-gray-600" />
                          </Link>
                          <button onClick={() => handleDelete(session.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Delete session">
                            <Trash2 size={18} className="text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {sessions.map((session: Session) => {
              const ModeIcon = getModeIcon(session.mode)
              return (
                <div key={session.id} className="card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 truncate">{session.title}</h3>
                      {session.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{session.description}</p>
                      )}
                    </div>
                    {statusBadge(session.status)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <ModeIcon size={14} className="text-gray-400" />
                      {getModeLabel(session.mode)}
                    </div>
                    <span>·</span>
                    <span>{session.ai_usage || 0} AI calls</span>
                    <span>·</span>
                    <span>{formatDate(session.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                    <Link to={`/sessions/${session.id}/live`} className="btn-primary py-1.5 px-3 text-xs flex-1 justify-center">
                      <ExternalLink size={14} />
                      Open
                    </Link>
                    <Link to={`/sessions/${session.id}/transcript`} className="btn-secondary py-1.5 px-3 text-xs flex-1 justify-center">
                      <Menu size={14} />
                      Transcript
                    </Link>
                    <button onClick={() => handleDelete(session.id)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-500 shrink-0" title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
