import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Activity, TrendingUp, HelpCircle, MessageSquare,
  CheckCircle, Brain, Zap, Loader2, AlertTriangle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'

interface SessionStats {
  total_sessions: number
  active_sessions: number
  total_questions: number
  total_answers: number
  avg_confidence: number
  total_ai_calls: number
  avg_duration_hours: number
  provider_breakdown: Record<string, number>
  sessions_per_day: { day: string; count: number }[]
  avg_confidence_per_day: { day: string; avg_confidence: number }[]
}

const COLORS = ['#7c3aed', '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#ec4899']

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0`} style={{ backgroundColor: color + '20' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function EmptyState({ onGoLive }: { onGoLive: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
      <BarChart3 size={48} className="mb-4 opacity-40" />
      <h3 className="text-lg font-medium text-gray-500 mb-2">No analytics data yet</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-md text-center">
        Start an interview session to see your analytics dashboard with KPIs, charts, and trends.
      </p>
      <button onClick={onGoLive} className="btn-primary">
        <MessageSquare size={16} />
        Start a Session
      </button>
    </div>
  )
}

export default function Analytics() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analytics/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SessionStats = await res.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 size={32} className="animate-spin" />
          <p className="text-sm">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-red-500">
          <AlertTriangle size={32} />
          <p className="text-sm">{error}</p>
          <button onClick={fetchStats} className="btn-secondary text-sm">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!stats || stats.total_sessions === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState onGoLive={() => navigate('/sessions/new')} />
      </div>
    )
  }

  // Prepare pie chart data
  const providerData = Object.entries(stats.provider_breakdown || {}).map(([name, value]) => ({
    name,
    value: Math.max(1, value as number),
  }))

  // Confidence badge color
  const confidenceColor = stats.avg_confidence >= 0.7 ? 'text-green-600' : stats.avg_confidence >= 0.4 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Interview session KPIs and performance trends
          </p>
        </div>
        <button onClick={fetchStats} className="btn-secondary text-sm py-2">
          <Activity size={16} />
          Refresh
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Sessions"
          value={stats.total_sessions}
          subtitle={`${stats.active_sessions} active now`}
          icon={MessageSquare as any}
          color="#7c3aed"
        />
        <StatCard
          title="Questions Answered"
          value={stats.total_answers}
          subtitle={`${stats.total_questions} questions asked`}
          icon={CheckCircle as any}
          color="#10b981"
        />
        <StatCard
          title="Avg Confidence"
          value={`${(stats.avg_confidence * 100).toFixed(0)}%`}
          subtitle="Across all answers"
          icon={Brain as any}
          color="#3b82f6"
        />
        <StatCard
          title="AI Calls"
          value={stats.total_ai_calls}
          subtitle={stats.avg_duration_hours > 0 ? `~${stats.avg_duration_hours.toFixed(1)}h avg session` : 'No session data'}
          icon={Zap as any}
          color="#f59e0b"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Sessions Over Time (Bar Chart) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-violet-500" />
            Sessions per Day
          </h3>
          {stats.sessions_per_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.sessions_per_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d) => {
                    const parts = (d as string).split('-')
                    return `${parts[1]}/${parts[2]}`
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              No session data in the last 30 days
            </div>
          )}
        </div>

        {/* Confidence Trend (Line Chart) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" />
            Avg Confidence per Day
          </h3>
          {stats.avg_confidence_per_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={stats.avg_confidence_per_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(d) => {
                    const parts = (d as string).split('-')
                    return `${parts[1]}/${parts[2]}`
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  domain={[0, 1]}
                  tickFormatter={(v) => `${((v as number) * 100).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_confidence"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3b82f6' }}
                  name="Confidence"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              No confidence data yet
            </div>
          )}
        </div>

        {/* Provider Distribution (Pie Chart) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Brain size={16} className="text-emerald-500" />
            AI Provider Usage
          </h3>
          <div className="flex items-center justify-center h-[260px]">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={providerData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  labelLine={true}
                >
                  {providerData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Additional Summary Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <HelpCircle size={16} className="text-amber-500" />
            Session Summary
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Total interview questions</span>
              <span className="text-sm font-semibold">{stats.total_questions}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">AI answers generated</span>
              <span className="text-sm font-semibold">{stats.total_answers}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Avg session duration</span>
              <span className="text-sm font-semibold">
                {stats.avg_duration_hours > 0 ? `${stats.avg_duration_hours.toFixed(1)}h` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Active sessions</span>
              <span className="text-sm font-semibold">{stats.active_sessions}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Overall confidence</span>
              <span className={`text-sm font-semibold ${confidenceColor}`}>
                {(stats.avg_confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
