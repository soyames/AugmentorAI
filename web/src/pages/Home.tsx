import { Link } from 'react-router-dom'
import { FileText, PlayCircle, CreditCard, Rocket, Mic, Code, Globe, MessageSquare, Users } from 'lucide-react'
import Logo from '../components/Logo'

const steps = [
  {
    label: 'Optional:',
    title: 'Resume',
    icon: FileText,
    description: 'Upload your resume so AugmentorAI can generate custom answers to interview questions.',
    action: 'Upload Resume',
    actionLink: '/resumes',
  },
  {
    label: 'Step 1:',
    title: 'New Session',
    icon: PlayCircle,
    description: 'See how easy AugmentorAI is to use. Create unlimited sessions with local AI processing.',
    action: 'Create Session',
    actionLink: '/sessions/new',
  },
  {
    label: 'Step 2:',
    title: 'Add Documents',
    icon: CreditCard,
    description: 'Add job descriptions, company notes, and other context for better answers.',
    action: 'Add Documents',
    actionLink: '/documents',
  },
  {
    label: 'Step 3:',
    title: 'Practice Interview',
    icon: Rocket,
    description: 'Use AugmentorAI for practice interviews to prepare for your dream job.',
    action: 'Start',
    actionLink: '/sessions/new',
    highlight: true,
  },
]

const features = [
  {
    icon: Users,
    badge: 'MEETING MODE',
    badgeColor: 'bg-violet-600',
    title: 'Stealth Meeting Assistant',
    description: 'Join any meeting and get real-time expert talking points in a compact overlay. Works with Zoom, Teams, Meet, Webex — nobody knows you\'re using it.',
  },
  {
    icon: Mic,
    badge: 'SPEECH RECOGNITION',
    badgeColor: 'bg-green-500',
    title: 'Blazing Fast Transcription',
    description: 'State-of-the-art on-device transcription provides highly accurate results in real-time without sending audio to the cloud.',
  },
  {
    icon: MessageSquare,
    badge: 'AI ANSWERS',
    badgeColor: 'bg-violet-500',
    title: '100% Local AI',
    description: 'Uses Ollama local models by default — your conversations never leave your machine. Cloud AI (Gemini, DeepSeek) available for better quality.',
  },
  {
    icon: Code,
    badge: 'PROGRAMMING',
    badgeColor: 'bg-blue-500',
    title: 'Full Coding Support',
    description: 'Handles coding questions, architecture discussions, and technical deep-dives. Great for technical interviews and design meetings.',
  },
  {
    icon: Globe,
    badge: 'MULTILINGUAL',
    badgeColor: 'bg-orange-500',
    title: 'Multi-language Support',
    description: 'Switch between languages during your session. Supports 50+ languages for both transcription and responses.',
  },
]

const platforms = [
  { name: 'Zoom', color: 'bg-blue-500' },
  { name: 'Google Meet', color: 'bg-green-500' },
  { name: 'Microsoft Teams', color: 'bg-purple-500' },
  { name: 'Webex', color: 'bg-blue-600' },
  { name: 'HackerRank', color: 'bg-emerald-500' },
  { name: 'CoderPad', color: 'bg-red-500' },
]

export default function Home() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Home</h1>
        <div className="flex gap-3">
          <Link to="/sessions/new?mode=meeting" className="btn-secondary flex items-center gap-2">
            <Users size={16} />
            Join Meeting
          </Link>
          <Link to="/sessions/new" className="btn-primary">
            Start Session
          </Link>
        </div>
      </div>

      {/* Welcome */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Hi there!
        </h2>
        <p className="text-gray-600">Welcome to AugmentorAI - Your Interview Practice Copilot</p>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-4 gap-4 mb-12">
        {steps.map((step, index) => (
          <div key={index} className="card relative">
            <div className="text-sm text-gray-500 mb-1">{step.label}</div>
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold text-gray-900">{step.title}</span>
              <step.icon size={18} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 mb-4">{step.description}</p>
            {index < steps.length - 1 && (
              <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 text-gray-300 z-10">
                →
              </div>
            )}
            <Link
              to={step.actionLink}
              className={step.highlight ? 'btn-primary w-full' : 'btn-secondary w-full'}
            >
              {step.action}
            </Link>
          </div>
        ))}
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-8 mb-12 text-white relative overflow-hidden">
        <div className="relative z-10 max-w-lg">
          <h3 className="text-2xl font-bold mb-2">Built for live interview practice</h3>
          <p className="text-violet-100 mb-6">
            Start a session in this web app, allow microphone access, and get live transcript plus AI answer suggestions.
          </p>
          <div className="flex flex-wrap gap-2">
            {platforms.map((platform) => (
              <span
                key={platform.name}
                className="px-3 py-1.5 bg-white/20 rounded-lg text-sm font-medium backdrop-blur-sm"
              >
                {platform.name}
              </span>
            ))}
          </div>
        </div>
        <div className="absolute right-8 top-1/2 transform -translate-y-1/2 opacity-20">
          <Logo size={200} showText={false} />
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-6 mb-12">
        {features.map((feature, index) => (
          <div key={index} className="card">
            <span className={`badge text-white text-xs ${feature.badgeColor} mb-4`}>
              {feature.badge}
            </span>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
            <p className="text-gray-600">{feature.description}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <span className="badge bg-violet-500 text-white mb-4">INSTANT ANSWERS</span>
        <h3 className="text-xl font-bold text-gray-900 mb-2">AI-Powered Responses</h3>
        <p className="text-gray-600 mb-4">
          Get contextual answers based on your uploaded documents, resume, and session context.
        </p>
        <Link to="/sessions/new" className="btn-accent">
          Try Now
        </Link>
      </div>
    </div>
  )
}
