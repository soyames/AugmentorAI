import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Save, Cpu, Mic, Globe, KeyRound, Trash2, RefreshCw } from 'lucide-react'

interface ProviderStatus {
  id: string
  name: string
  configured: boolean
  models: string[]
}

export default function Settings() {
  const [settings, setSettings] = useState({
    // AI Settings
    geminiApiKey: '',
    geminiConfigured: false,
    clearGeminiApiKey: false,
    deepseekApiKey: '',
    deepseekConfigured: false,
    clearDeepseekApiKey: false,
    ollamaUrl: 'http://localhost:11434',
    model: 'qwen2.5-coder:3b',
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
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [availableModels, setAvailableModels] = useState<string[]>([])

  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      const [settingsResponse, modelsResponse] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/settings/models'),
      ])
      if (!settingsResponse.ok) {
        throw new Error('Failed to load settings')
      }
      const data = await settingsResponse.json()
      setSettings((prev) => ({
        ...prev,
        geminiApiKey: '',
        deepseekApiKey: '',
        clearGeminiApiKey: false,
        clearDeepseekApiKey: false,
        geminiConfigured: Boolean(data.gemini_configured),
        deepseekConfigured: Boolean(data.deepseek_configured),
        ollamaUrl: data.ollama_url,
        model: data.model,
        maxTokens: String(data.max_tokens),
        temperature: String(data.temperature),
        inputDevice: data.input_device,
        sampleRate: String(data.sample_rate),
        defaultLanguage: data.default_language,
        autoDetectLanguage: data.auto_detect_language,
      }))

      if (modelsResponse.ok) {
        const modelData = await modelsResponse.json()
        setProviders(modelData.providers || [])
        setAvailableModels(modelData.models || [])
      }
    } catch (err) {
      console.error(err)
      setError('Could not load settings from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
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
          ...(settings.geminiApiKey ? { gemini_api_key: settings.geminiApiKey } : {}),
          ...(settings.deepseekApiKey ? { deepseek_api_key: settings.deepseekApiKey } : {}),
          clear_gemini_api_key: settings.clearGeminiApiKey,
          clear_deepseek_api_key: settings.clearDeepseekApiKey,
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

      await loadSettings()
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
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Provider Status</div>
                <button
                  type="button"
                  className="btn-secondary py-1 px-2 text-xs"
                  onClick={loadSettings}
                  disabled={loading}
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
              <div className="space-y-2">
                {loading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                    <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    Checking provider status...
                  </div>
                ) : providers.length === 0 ? (
                  <p className="text-xs text-gray-500">No provider status available.</p>
                ) : (
                  providers.map((provider) => (
                    <div key={provider.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          provider.configured
                            ? provider.id === 'ollama'
                              ? 'bg-green-500'
                              : 'bg-green-500'
                            : 'bg-gray-300'
                        }`} />
                        <div>
                          <span className="font-medium text-gray-800">{provider.name}</span>
                          {provider.models.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">{provider.models.join(', ')}</p>
                          )}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        provider.configured
                          ? 'bg-green-100 text-green-700'
                          : provider.id === 'ollama'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}>
                        {provider.configured ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            active
                          </>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            {provider.id === 'ollama' ? 'unreachable' : 'not configured'}
                          </>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gemini API Key
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    className="input pl-9"
                    value={settings.geminiApiKey}
                    placeholder={
                      settings.clearGeminiApiKey
                        ? 'Key will be removed on save'
                        : settings.geminiConfigured
                          ? 'Configured - enter a new key to replace'
                          : 'Enter Gemini API key'
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        geminiApiKey: e.target.value,
                        clearGeminiApiKey: false,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!settings.geminiConfigured && !settings.geminiApiKey}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      geminiApiKey: '',
                      clearGeminiApiKey: settings.geminiConfigured,
                    })
                  }
                  title="Remove Gemini API key"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {settings.geminiConfigured && !settings.clearGeminiApiKey
                  ? 'A Gemini key is stored on the server.'
                  : 'No Gemini key is currently stored on the server.'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                DeepSeek API Key
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    className="input pl-9"
                    value={settings.deepseekApiKey}
                    placeholder={
                      settings.clearDeepseekApiKey
                        ? 'Key will be removed on save'
                        : settings.deepseekConfigured
                          ? 'Configured - enter a new key to replace'
                          : 'Enter DeepSeek API key'
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        deepseekApiKey: e.target.value,
                        clearDeepseekApiKey: false,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!settings.deepseekConfigured && !settings.deepseekApiKey}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      deepseekApiKey: '',
                      clearDeepseekApiKey: settings.deepseekConfigured,
                    })
                  }
                  title="Remove DeepSeek API key"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {settings.deepseekConfigured && !settings.clearDeepseekApiKey
                  ? 'A DeepSeek key is stored on the server.'
                  : 'No DeepSeek key is currently stored on the server.'}
              </p>
            </div>

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
                Ollama Fallback Model
              </label>
              <select
                className="input"
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
              >
                {[
                  settings.model,
                  'qwen2.5-coder:3b',
                  'llama3.1',
                  'llama3.1:70b',
                  'mistral',
                  'qwen2.5',
                  'gemma2',
                  ...availableModels.filter((model) => !model.startsWith('gemini') && !model.startsWith('deepseek')),
                ]
                  .filter((model, index, list) => model && list.indexOf(model) === index)
                  .map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Gemini and DeepSeek are used first automatically; this model is only for Ollama fallback.
              </p>
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
