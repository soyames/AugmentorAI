interface LogoProps {
  size?: number
  showText?: boolean
}

export default function Logo({ size = 40, showText = true }: LogoProps) {
  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill="url(#logoGrad)" />
        <path
          d="M32 12c-8 0-14 6-14 14 0 4 2 8 5 10v8c0 2 2 4 4 4h10c2 0 4-2 4-4v-8c3-2 5-6 5-10 0-8-6-14-14-14z"
          fill="white"
          opacity="0.9"
        />
        <circle cx="26" cy="24" r="3" fill="#8B5CF6" />
        <circle cx="38" cy="24" r="3" fill="#8B5CF6" />
        <circle cx="32" cy="32" r="3" fill="#6366F1" />
        <circle cx="26" cy="36" r="2" fill="#8B5CF6" />
        <circle cx="38" cy="36" r="2" fill="#8B5CF6" />
        <line x1="26" y1="24" x2="32" y2="32" stroke="#8B5CF6" strokeWidth="1.5" />
        <line x1="38" y1="24" x2="32" y2="32" stroke="#8B5CF6" strokeWidth="1.5" />
        <line x1="26" y1="36" x2="32" y2="32" stroke="#6366F1" strokeWidth="1.5" />
        <line x1="38" y1="36" x2="32" y2="32" stroke="#6366F1" strokeWidth="1.5" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
      </svg>
      {showText && (
        <span className="text-xl font-bold text-gray-900">
          Augmentor<span className="text-violet-600">AI</span>
        </span>
      )}
    </div>
  )
}
