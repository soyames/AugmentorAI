import { Download as DownloadIcon, Monitor, Apple } from 'lucide-react'
import Logo from '../components/Logo'

const platforms = [
  {
    name: 'Windows',
    icon: Monitor,
    version: '1.0.0',
    size: '85 MB',
    link: '#',
    recommended: true,
  },
  {
    name: 'macOS (Apple Silicon)',
    icon: Apple,
    version: '1.0.0',
    size: '92 MB',
    link: '#',
    recommended: false,
  },
  {
    name: 'macOS (Intel)',
    icon: Apple,
    version: '1.0.0',
    size: '90 MB',
    link: '#',
    recommended: false,
  },
]

const features = [
  'System audio capture for any application',
  'Better performance and lower latency',
  'Native OS integration',
  'Automatic updates',
  'Offline support',
]

export default function Download() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <DownloadIcon className="text-gray-400" size={24} />
        <h1 className="text-2xl font-semibold text-gray-900">Download Desktop App</h1>
      </div>

      {/* Hero */}
      <div className="card mb-8 text-center py-12">
        <div className="flex justify-center mb-6">
          <Logo size={80} showText={false} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          AugmentorAI Desktop
        </h2>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          Get the full experience with our desktop application. Capture system audio seamlessly and practice interviews with any platform.
        </p>

        {/* Download Buttons */}
        <div className="flex flex-col items-center gap-3">
          {platforms.map((platform) => (
            <a
              key={platform.name}
              href={platform.link}
              className={`flex items-center gap-4 px-6 py-3 rounded-lg border transition-colors w-80 ${
                platform.recommended
                  ? 'bg-gray-900 text-white hover:bg-gray-800 border-gray-900'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
              }`}
            >
              <platform.icon size={24} />
              <div className="flex-1 text-left">
                <div className="font-medium">{platform.name}</div>
                <div className={`text-sm ${platform.recommended ? 'text-gray-400' : 'text-gray-500'}`}>
                  v{platform.version} • {platform.size}
                </div>
              </div>
              {platform.recommended && (
                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded">
                  Recommended
                </span>
              )}
            </a>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Why use the Desktop App?
        </h3>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Requirements */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          System Requirements
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="card py-4">
            <div className="font-medium text-gray-900 mb-1">Windows</div>
            <p className="text-gray-600">Windows 10 or later (64-bit)</p>
          </div>
          <div className="card py-4">
            <div className="font-medium text-gray-900 mb-1">macOS</div>
            <p className="text-gray-600">macOS 11 (Big Sur) or later</p>
          </div>
        </div>
      </div>
    </div>
  )
}
