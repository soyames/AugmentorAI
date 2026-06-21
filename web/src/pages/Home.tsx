import { Link } from 'react-router-dom'
import { PlayCircle, Mic, Lock, Zap, Sparkles } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-violet-500/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-500/20 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Hero Section */}
      <div className="text-center z-10 max-w-3xl mb-12 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-medium mb-6 shadow-sm border border-violet-200 dark:border-violet-800">
          <Zap size={14} className="animate-pulse" />
          <span>Local AI Interview Copilot</span>
        </div>
        
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-6 leading-tight">
          Nail your next interview with <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">AugmentorAI</span>
        </h1>
        
        <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 mb-10 max-w-2xl mx-auto leading-relaxed">
          Real-time transcription and AI-powered talking points directly on your screen. Secure, lightning fast, and 100% private.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link 
            to="/sessions/new" 
            className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            <PlayCircle size={20} className="group-hover:scale-110 transition-transform" />
            <span>Start Practice Session</span>
          </Link>
        </div>
      </div>

      {/* Simplified Features */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl w-full z-10 mt-8">
        {[
          {
            icon: Lock,
            title: "Privacy First",
            desc: "Use local Ollama models. Your conversations never leave your device.",
            color: "text-emerald-500",
            bg: "bg-emerald-500/10"
          },
          {
            icon: Mic,
            title: "Instant Transcription",
            desc: "State-of-the-art speech recognition that works right in your browser.",
            color: "text-blue-500",
            bg: "bg-blue-500/10"
          },
          {
            icon: Sparkles,
            title: "Tailored Context",
            desc: "Upload your CV and the job description for personalized AI responses.",
            color: "text-violet-500",
            bg: "bg-violet-500/10"
          }
        ].map((feat, i) => (
          <div key={i} className="bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/20 dark:border-gray-700/30 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 group">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${feat.bg} group-hover:scale-110 transition-transform duration-300`}>
              <feat.icon size={24} className={feat.color} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{feat.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
