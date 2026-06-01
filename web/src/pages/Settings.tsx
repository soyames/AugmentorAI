import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Save, Cpu, Mic, Globe } from 'lucide-react'

export default function Settings() {
  const [settings, setSettings] = useState({
    // AI Settings
    ollamaUrl: 'http://localhost:11434',
    model: 'llama3.1',
    maxTokens: '500',
    temperature: '0.7',

    // Audio Settings
    inputDevice: 'default',
    outputCapture: true,
    sampleRate: '16000',

    // Language Settings
    defaultLanguage: 'en',
    autoDetectLanguage: true,
    simpleLanguage: true,
  })

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/settings')
        if (!response.ok) {
          throw new Error('Failed to load settings')
        }
        const data = await response.json()
        setSettings((prev) => ({
          ...prev,
          ollamaUrl: data.ollama_url,
          model: data.model,
          maxTokens: String(data.max_tokens),
          temperature: String(data.temperature),
          inputDevice: data.input_device,
          sampleRate: String(data.sample_rate),
          defaultLanguage: data.default_language,
          autoDetectLanguage: data.auto_detect_language,
        }))
      } catch (err) {
        console.error(err)
        setError('Could not load settings from the server.')
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ollama_url: settings.ollamaUrl,
          model: settings.model,
          max_tokens: Number(settings.maxTokens),
          temperature: Number(settings.temperature),
          input_device: settings.inputDevice,
          sample_rate: Number(settings.sampleRate),
          default_language: settings.defaultLanguage,
          auto_detect_language: settings.autoDetectLanguage,
        }),
      })
      if (!response.ok) {
        throw new Error('Failed to save settings')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error(err)
      setError('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <SettingsIcon className="text-gray-400" size={24} />
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        </div>
        <button onClick={handleSave} disabled={saving || loading} className="btn-primary">
          <Save size={18} />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-500 text-sm mb-4">Loading settings...</p>}

      <div className="space-y-6">
        {/* AI Settings */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <Cpu size={20} className="text-violet-600" />
            <h2 className="font-semibold text-gray-900">AI Settings</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ollama URL
              </label>
              <input
                type="text"
                className="input"
                value={settings.ollamaUrl}
                onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Local Ollama server address
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Model
              </label>
              <select
                className="input"
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              >
                <option value="llama3.1">Llama 3.1 8B - Super Fast</option>
                <option value="llama3.1:70b">Llama 3.1 70B - Fast</option>
                <option value="mistral">Mistral 7B - Super Fast</option>
                <option value="qwen2.5">Qwen 2.5 - Fast</option>
                <option value="gemma2">Gemma 2 - Fast</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  className="input"
                  value={settings.maxTokens}
                  onChange={(e) => setSettings({ ...settings, maxTokens: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temperature
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  className="input"
                  value={settings.temperature}
                  onChange={(e) => setSettings({ ...settings, temperature: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Audio Settings */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <Mic size={20} className="text-violet-600" />
            <h2 className="font-semibold text-gray-900">Audio Settings</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Input Device
              </label>
              <select
                className="input"
                value={settings.inputDevice}
                onChange={(e) => setSettings({ ...settings, inputDevice: e.target.value })}
              >
                <option value="default">System Default</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">
                  System Audio Capture
                </div>
                <p className="text-xs text-gray-500">
                  Capture audio from other applications
                </p>
              </div>
              <div
                onClick={() => setSettings({ ...settings, outputCapture: !settings.outputCapture })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.outputCapture ? 'bg-violet-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                    settings.outputCapture ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sample Rate
              </label>
              <select
                className="input"
                value={settings.sampleRate}
                onChange={(e) => setSettings({ ...settings, sampleRate: e.target.value })}
              >
                <option value="16000">16000 Hz (Recommended)</option>
                <option value="22050">22050 Hz</option>
                <option value="44100">44100 Hz</option>
              </select>
            </div>
          </div>
        </div>

        {/* Language Settings */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <Globe size={20} className="text-violet-600" />
            <h2 className="font-semibold text-gray-900">Language Settings</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Language
              </label>
              <select
                className="input"
                value={settings.defaultLanguage}
                onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">
                  Auto-detect Language
                </div>
                <p className="text-xs text-gray-500">
                  Automatically detect spoken language
                </p>
              </div>
              <div
                onClick={() => setSettings({ ...settings, autoDetectLanguage: !settings.autoDetectLanguage })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.autoDetectLanguage ? 'bg-violet-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                    settings.autoDetectLanguage ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">
                  Simple Language Mode
                </div>
                <p className="text-xs text-gray-500">
                  Generate simpler, more concise responses
                </p>
              </div>
              <div
                onClick={() => setSettings({ ...settings, simpleLanguage: !settings.simpleLanguage })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.simpleLanguage ? 'bg-violet-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                    settings.simpleLanguage ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
