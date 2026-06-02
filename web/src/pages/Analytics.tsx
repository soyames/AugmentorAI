import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, Activity, TrendingUp, HelpCircle, MessageSquare,
  CheckCircle, Brain, Zap, Loader2, AlertTriangle, Timer,
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
  confidence_per_provider: Record<string, number>
  provider_latency: Record<string, number | null>
  sessions_per_day: { day: string; count: number }[]
  avg_confidence_per_day: { day: string; avg_confidence: number }[]
}

const PROVIDER_COLORS: Record<string, string> = {
  Gemini: '#4285F4',
  DeepSeek: '#4F46E5',
  'Hermes AI': '#7C3AED',
  Ollama: '#F59E0B',
  'Ollama (local)': '#F59E0B',
  unknown: '#9CA3AF',
}

const PIE_COLORS = ['#7c3aed', '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#ec4899']

function StatCard({
  title, value, subtitle, icon: Icon, color,
}: {
  title: string; value: string | number; subtitle?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '20' }}>
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="text-xs">
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
          {entry.name.toLowerCase().includes('confidence') || entry.name.toLowerCase().includes('latency') ? '' : ''}
          {entry.name.toLowerCase().includes('confidence') ? '%' : ''}
          {entry.name.toLowerCase().includes('latency') ? 'ms' : ''}
        </p>
      ))}
    </div>
  )
}

export default function Analytics() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { fetchStats() }, [])

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
          <button onClick={fetchStats} className="btn-secondary text-sm">Retry</button>
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

  // Provider data for charts
  const providerUsage = Object.entries(stats.provider_breakdown || {})
    .filter(([k]) => !k.endsWith('_fallback'))
    .map(([name, value]) => ({
      name,
      value: Math.max(1, value as number),
      fill: PROVIDER_COLORS[name] || '#9CA3AF',
    }))

  const providerConfidence = Object.entries(stats.confidence_per_provider || {}).map(([name, val]) => ({
    name,
    confidence: +(val as number * 100).toFixed(1),
    fill: PROVIDER_COLORS[name] || '#9CA3AF',
  }))

  const providerLatencyData = Object.entries(stats.provider_latency || {})
    .filter(([, v]) => v != null)
    .map(([name, val]) => ({
      name,
      latency: val as number,
      fill: PROVIDER_COLORS[name] || '#9CA3AF',
    }))

  const confidenceColor = stats.avg_confidence >= 0.7 ? 'text-green-600' : stats.avg_confidence >= 0.4 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Interview session KPIs and provider performance trends
          </p>
        </div>
        <button onClick={fetchStats} className="btn-secondary text-sm py-2">
          <Activity size={16} />
          Refresh
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Sessions" value={stats.total_sessions}
          subtitle={`${stats.active_sessions} active now`} icon={MessageSquare as any} color="#7c3aed" />
        <StatCard title="Questions Answered" value={stats.total_answers}
          subtitle={`${stats.total_questions} questions asked`} icon={CheckCircle as any} color="#10b981" />
        <StatCard title="Avg Confidence" value={`${(stats.avg_confidence * 100).toFixed(0)}%`}
          subtitle="Across all answers" icon={Brain as any} color="#3b82f6" />
        <StatCard title="AI Calls" value={stats.total_ai_calls}
          subtitle={stats.avg_duration_hours > 0 ? `~${stats.avg_duration_hours.toFixed(1)}h avg session` : 'No session data'}
          icon={Zap as any} color="#f59e0b" />
      </div>

      {/* Charts Row 1 — Time series */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions Over Time */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-violet-500" />
            Sessions per Day
          </h3>
          {stats.sessions_per_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stats.sessions_per_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }}
                  tickFormatter={(d) => { const p = (d as string).split('-'); return `${p[1]}/${p[2]}` }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No session data in the last 30 days</div>
          )}
        </div>

        {/* Confidence Trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" />
            Avg Confidence per Day
          </h3>
          {stats.avg_confidence_per_day.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={stats.avg_confidence_per_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }}
                  tickFormatter={(d) => { const p = (d as string).split('-'); return `${p[1]}/${p[2]}` }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 1]}
                  tickFormatter={(v) => `${((v as number) * 100).toFixed(0)}%`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="avg_confidence" stroke="#3b82f6" strokeWidth={2}
                  dot={{ r: 3, fill: '#3b82f6' }} name="Confidence" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No confidence data yet</div>
          )}
        </div>
      </div>

      {/* Charts Row 2 — Provider metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provider Usage Pie */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Brain size={16} className="text-emerald-500" />
            Provider Usage
          </h3>
          <div className="flex items-center justify-center h-[260px]">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={providerUsage} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  paddingAngle={3} dataKey="value" labelLine={true}>
                  {providerUsage.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2">
            {providerUsage.map((p) => (
              <span key={p.name} className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.fill }} />
                {p.name}: {p.value}
              </span>
            ))}
          </div>
        </div>

        {/* Provider Confidence Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-500" />
            Confidence by Provider
          </h3>
          {providerConfidence.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={providerConfidence} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="confidence" radius={[0, 4, 4, 0]} name="Confidence %">
                  {providerConfidence.map((entry, idx) => (
                    <Cell key={idx} fill={PROVIDER_COLORS[entry.name] || PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">No provider data yet</div>
          )}
        </div>

        {/* Provider Latency Bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Timer size={16} className="text-amber-500" />
            Avg Latency by Provider
          </h3>
          {providerLatencyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={providerLatencyData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}ms`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="latency" radius={[0, 4, 4, 0]} name="Latency ms">
                  {providerLatencyData.map((entry, idx) => (
                    <Cell key={idx} fill={PROVIDER_COLORS[entry.name] || PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">
              No latency data yet — will populate as new answers are generated
            </div>
          )}
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <HelpCircle size={16} className="text-amber-500" />
          Session Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Total questions', value: stats.total_questions },
            { label: 'AI answers', value: stats.total_answers },
            { label: 'Avg duration', value: stats.avg_duration_hours > 0 ? `${stats.avg_duration_hours.toFixed(1)}h` : 'N/A' },
            { label: 'Active sessions', value: stats.active_sessions },
            { label: 'Overall confidence', value: `${(stats.avg_confidence * 100).toFixed(0)}%`, color: confidenceColor },
          ].map((item) => (
            <div key={item.label} className="text-center py-3 border-r border-gray-100 last:border-r-0">
              <p className="text-sm text-gray-600">{item.label}</p>
              <p className={`text-lg font-bold mt-1 ${item.color || 'text-gray-900'}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
