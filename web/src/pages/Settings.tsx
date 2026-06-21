import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Save, Cpu, Mic, Globe, KeyRound, Trash2, RefreshCw, Wifi, WifiOff } from 'lucide-react'

interface ProviderStatus {
  id: string
  name: string
  configured: boolean
  models: string[]
}

// localStorage keys for client-side API keys
const LS_OPENAI_KEY = 'augmentorai_openai_api_key'
const LS_ANTHROPIC_KEY = 'augmentorai_anthropic_api_key'
const LS_OPENAI_MODEL = 'augmentorai_openai_model'
const LS_ANTHROPIC_MODEL = 'augmentorai_anthropic_model'

function getLS(key: string): string {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
function setLS(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch {}
}
function removeLS(key: string) {
  try { localStorage.removeItem(key) } catch {}
}

export default function Settings() {
  const [settings, setSettings] = useState({
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
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    anthropicApiKey: '',
    anthropicModel: 'claude-sonnet-4-20250514',
    inputDevice: 'default',
    outputCapture: true,
    sampleRate: '16000',
    defaultLanguage: 'en',
    autoDetectLanguage: true,
    simpleLanguage: true,
    openaiConfigured: false,
    anthropicConfigured: false,
  })

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [ollamaTestResult, setOllamaTestResult] = useState<'ok' | 'fail' | null>(null)
  const [testingOllama, setTestingOllama] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Compute whether localStorage has keys
  const [preferredProvider, setPreferredProvider] = useState<string>(() => localStorage.getItem("augmentorai_preferred_provider") || "");
  const hasOpenAIKey = !!getLS(LS_OPENAI_KEY)
  const hasAnthropicKey = !!getLS(LS_ANTHROPIC_KEY)

  // Load localStorage keys on mount
  useEffect(() => {
    setSettings(prev => ({
      ...prev,
      openaiApiKey: hasOpenAIKey ? '********' : '',
      openaiModel: getLS(LS_OPENAI_MODEL) || 'gpt-4o',
      anthropicApiKey: hasAnthropicKey ? '********' : '',
      anthropicModel: getLS(LS_ANTHROPIC_MODEL) || 'claude-sonnet-4-20250514',
    }))
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    setError(null)
    try {
      const [settingsResponse, modelsResponse] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/settings/models'),
      ])
      if (!settingsResponse.ok) throw new Error('Failed to load settings')
      const data = await settingsResponse.json()

      setSettings((prev) => ({
        ...prev,
        geminiApiKey: '',
        deepseekApiKey: '',
        clearGeminiApiKey: false,
        clearDeepseekApiKey: false,
        geminiConfigured: Boolean(data.gemini_configured),
        deepseekConfigured: Boolean(data.deepseek_configured),
        ollamaUrl: data.ollama_url || prev.ollamaUrl,
        model: data.model || prev.model,
        maxTokens: String(data.max_tokens || 500),
        temperature: String(data.temperature ?? 0.7),
        inputDevice: data.input_device || prev.inputDevice,
        sampleRate: String(data.sample_rate || 16000),
        defaultLanguage: data.default_language || prev.defaultLanguage,
        autoDetectLanguage: data.auto_detect_language ?? prev.autoDetectLanguage,
        // Keep localStorage values — don't overwrite from server
        openaiApiKey: hasOpenAIKey ? '********' : prev.openaiApiKey,
        anthropicApiKey: hasAnthropicKey ? '********' : prev.anthropicApiKey,
      }))

      if (modelsResponse.ok) {
        const modelData = await modelsResponse.json()
        let provs = modelData.providers || []
        // Override OpenAI/Anthropic configured status based on localStorage
        provs = provs.map((p: ProviderStatus) => {
          if (p.id === 'openai' && hasOpenAIKey) return { ...p, configured: true }
          if (p.id === 'anthropic' && hasAnthropicKey) return { ...p, configured: true }
          return p
        })
        setProviders(provs)
        setAvailableModels(modelData.models || [])
        setSettings(prev => ({
          ...prev,
          openaiConfigured: provs.find((p: ProviderStatus) => p.id === 'openai')?.configured || false,
          anthropicConfigured: provs.find((p: ProviderStatus) => p.id === 'anthropic')?.configured || false,
        }))
      }
    } catch (err) {
      console.error(err)
      setError('Could not load settings from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSettings() }, [])

  const testOllamaConnection = async () => {
    setTestingOllama(true)
    setOllamaTestResult(null)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ollama_url: settings.ollamaUrl }),
      })
      const res = await fetch('/api/settings/models')
      if (res.ok) {
        const data = await res.json()
        const ollamaProv = data.providers?.find((p: ProviderStatus) => p.id === 'ollama')
        setOllamaTestResult(ollamaProv?.configured ? 'ok' : 'fail')
        setAvailableModels(data.models || [])
        let provs = data.providers || []
        provs = provs.map((p: ProviderStatus) => {
          if (p.id === 'openai' && getLS(LS_OPENAI_KEY)) return { ...p, configured: true }
          if (p.id === 'anthropic' && getLS(LS_ANTHROPIC_KEY)) return { ...p, configured: true }
          return p
        })
        setProviders(provs)
      } else {
        setOllamaTestResult('fail')
      }
    } catch {
      setOllamaTestResult('fail')
    } finally {
      setTestingOllama(false)
    }
  }

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
      if (!response.ok) throw new Error('Failed to save settings')

      // Save client-side API keys to localStorage
      if (settings.openaiApiKey && settings.openaiApiKey !== '********') {
        setLS(LS_OPENAI_KEY, settings.openaiApiKey)
      }
      if (settings.openaiModel) setLS(LS_OPENAI_MODEL, settings.openaiModel)
      if (settings.anthropicApiKey && settings.anthropicApiKey !== '********') {
        setLS(LS_ANTHROPIC_KEY, settings.anthropicApiKey)
      }
      if (settings.anthropicModel) setLS(LS_ANTHROPIC_MODEL, settings.anthropicModel)
      if (settings.openaiApiKey === '') removeLS(LS_OPENAI_KEY)
      if (settings.anthropicApiKey === '') removeLS(LS_ANTHROPIC_KEY)

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

  const clearOpenAI = () => {
    removeLS(LS_OPENAI_KEY)
    setSettings(s => ({ ...s, openaiApiKey: '' }))
  }

  const clearAnthropic = () => {
    removeLS(LS_ANTHROPIC_KEY)
    setSettings(s => ({ ...s, anthropicApiKey: '' }))
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6 sm:mb-8">
        <div className="flex items-center gap-3">
          <SettingsIcon className="text-gray-400 shrink-0" size={24} />
          <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Settings</h1>
        </div>
        <button onClick={handleSave} disabled={saving || loading} className="btn-primary w-full sm:w-auto justify-center">
          <Save size={18} />
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-500 text-sm mb-4">Loading settings...</p>}

      <div className="space-y-4 sm:space-y-6">
        {/* AI Settings */}
        <div className="card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Cpu size={20} className="text-violet-600 shrink-0" />
            <h2 className="font-semibold text-gray-900 text-base sm:text-lg">AI Settings</h2>
          </div>

          <div className="space-y-4">
            {/* Provider Status */}
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Provider Status</div>
                <button type="button" className="btn-secondary py-1 px-2 text-xs" onClick={loadSettings} disabled={loading}>
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
                    <div key={provider.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${provider.configured ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <span className="font-medium text-gray-800">{provider.name}</span>
                          {provider.models.length > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{provider.models.join(', ')}</p>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        provider.configured
                          ? 'bg-green-100 text-green-700'
                          : provider.id === 'ollama'
                            ? 'bg-yellow-100 text-yellow-700'
                            : provider.id === 'openai' || provider.id === 'anthropic'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${provider.configured ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {provider.configured ? (
                          provider.id === 'openai' || provider.id === 'anthropic' ? 'active (browser)' : 'active'
                        ) : (
                          provider.id === 'ollama' ? 'unreachable' : 'not configured'
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Gemini API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gemini API Key</label>
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 shrink-0" />
                  <input
                    type="password"
                    className="input pl-9 w-full"
                    value={settings.geminiApiKey}
                    placeholder={
                      settings.clearGeminiApiKey
                        ? 'Key will be removed on save'
                        : settings.geminiConfigured
                          ? 'Configured — enter a new key to replace'
                          : 'Enter Gemini API key'
                    }
                    onChange={(e) => setSettings({ ...settings, geminiApiKey: e.target.value, clearGeminiApiKey: false })}
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  disabled={!settings.geminiConfigured && !settings.geminiApiKey}
                  onClick={() => setSettings({ ...settings, geminiApiKey: '', clearGeminiApiKey: settings.geminiConfigured })}
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

            {/* DeepSeek API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">DeepSeek API Key</label>
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 shrink-0" />
                  <input
                    type="password"
                    className="input pl-9 w-full"
                    value={settings.deepseekApiKey}
                    placeholder={
                      settings.clearDeepseekApiKey
                        ? 'Key will be removed on save'
                        : settings.deepseekConfigured
                          ? 'Configured — enter a new key to replace'
                          : 'Enter DeepSeek API key'
                    }
                    onChange={(e) => setSettings({ ...settings, deepseekApiKey: e.target.value, clearDeepseekApiKey: false })}
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  disabled={!settings.deepseekConfigured && !settings.deepseekApiKey}
                  onClick={() => setSettings({ ...settings, deepseekApiKey: '', clearDeepseekApiKey: settings.deepseekConfigured })}
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
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">Default AI Provider</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Choose which AI provider to use by default. You can change this per session.
              </p>
              <select
                value={preferredProvider}
                onChange={(e) => {
                  setPreferredProvider(e.target.value);
                  localStorage.setItem("augmentorai_preferred_provider", e.target.value);
                }}
                className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600"
              >
                <option value="">Auto (try each provider)</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>
            

            {/* Advanced Providers Accordion */}
            <div className="border-t border-gray-200 pt-4 mt-6">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex items-center justify-between w-full text-left font-medium text-gray-800 focus:outline-none"
              >
                <span>Advanced Providers (Local/Browser Only)</span>
                <span className="text-gray-500">{advancedOpen ? '▲' : '▼'}</span>
              </button>
              
              {advancedOpen && (
                <div className="mt-4 space-y-6">
                  {/* OpenAI API Key */}
                  <div>
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      <KeyRound size={14} className="text-amber-600 shrink-0" />
                      <label className="text-sm font-medium text-gray-700">OpenAI API Key</label>
                      <span className="text-xs text-amber-600 font-medium ml-1">(Client-side)</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      Stored in your browser only. Never sent to the server. Used per-session when you start a live session.
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1 min-w-0">
                        <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 shrink-0" />
                        <input
                          type="password"
                          className="input pl-9 w-full"
                          value={settings.openaiApiKey}
                          placeholder={getLS(LS_OPENAI_KEY) ? '******** (saved in browser)' : 'Enter OpenAI API key'}
                          onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-secondary shrink-0"
                        disabled={!getLS(LS_OPENAI_KEY) && (!settings.openaiApiKey || settings.openaiApiKey === '********')}
                        onClick={clearOpenAI}
                        title="Clear OpenAI API key from browser"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-1">
                      <label className="text-xs text-gray-500">Model</label>
                      <select
                        className="input text-sm mt-0.5 w-full"
                        value={settings.openaiModel}
                        onChange={(e) => setSettings({ ...settings, openaiModel: e.target.value })}
                      >
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                      </select>
                    </div>
                  </div>

                  {/* Anthropic API Key */}
                  <div>
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      <KeyRound size={14} className="text-amber-600 shrink-0" />
                      <label className="text-sm font-medium text-gray-700">Anthropic API Key</label>
                      <span className="text-xs text-amber-600 font-medium ml-1">(Client-side)</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">
                      Stored in your browser only. Never sent to the server. Used per-session when you start a live session.
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1 min-w-0">
                        <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 shrink-0" />
                        <input
                          type="password"
                          className="input pl-9 w-full"
                          value={settings.anthropicApiKey}
                          placeholder={getLS(LS_ANTHROPIC_KEY) ? '******** (saved in browser)' : 'Enter Anthropic API key'}
                          onChange={(e) => setSettings({ ...settings, anthropicApiKey: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-secondary shrink-0"
                        disabled={!getLS(LS_ANTHROPIC_KEY) && (!settings.anthropicApiKey || settings.anthropicApiKey === '********')}
                        onClick={clearAnthropic}
                        title="Clear Anthropic API key from browser"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-1">
                      <label className="text-xs text-gray-500">Model</label>
                      <select
                        className="input text-sm mt-0.5 w-full"
                        value={settings.anthropicModel}
                        onChange={(e) => setSettings({ ...settings, anthropicModel: e.target.value })}
                      >
                        <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                        <option value="claude-3.5-haiku">Claude 3.5 Haiku</option>
                        <option value="claude-3-opus">Claude 3 Opus</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ollama URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ollama URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 min-w-0 w-full"
                  value={settings.ollamaUrl}
                  onChange={(e) => { setSettings({ ...settings, ollamaUrl: e.target.value }); setOllamaTestResult(null) }}
                />
                <button
                  type="button"
                  onClick={testOllamaConnection}
                  disabled={testingOllama}
                  className="btn-secondary text-sm px-3 shrink-0"
                  title="Test Ollama connection"
                >
                  {testingOllama ? (
                    <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin block" />
                  ) : ollamaTestResult === 'ok' ? (
                    <Wifi size={16} className="text-green-600" />
                  ) : ollamaTestResult === 'fail' ? (
                    <WifiOff size={16} className="text-red-500" />
                  ) : (
                    <Wifi size={16} />
                  )}
                </button>
              </div>
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-gray-500">
                  {ollamaTestResult === 'ok' && <span className="text-green-600">✓ Connected</span>}
                  {ollamaTestResult === 'fail' && <span className="text-red-500">✗ Unreachable — try a different URL</span>}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                  <span>Quick set:</span>
                  {[
                    { label: 'Docker (in-compose)', url: 'http://ollama:11434' },
                    { label: 'Host machine', url: 'http://host.docker.internal:11434' },
                    { label: 'Localhost', url: 'http://localhost:11434' },
                  ].map(({ label, url }) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => { setSettings({ ...settings, ollamaUrl: url }); setOllamaTestResult(null) }}
                      className="underline hover:text-violet-600"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Model selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ollama Fallback Model</label>
              <select
                className="input w-full"
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
                  ...availableModels.filter((m) => !m.startsWith('gemini') && !m.startsWith('deepseek') && !m.startsWith('gpt') && !m.startsWith('claude')),
                ].filter((m, i, a) => m && a.indexOf(m) === i).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Gemini, DeepSeek, OpenAI, and Anthropic are tried first; this model is only for Ollama fallback.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
                <input type="number" className="input w-full" value={settings.maxTokens} onChange={(e) => setSettings({ ...settings, maxTokens: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature</label>
                <input type="number" step="0.1" min="0" max="2" className="input w-full" value={settings.temperature} onChange={(e) => setSettings({ ...settings, temperature: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        {/* Audio Settings */}
        <div className="card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Mic size={20} className="text-violet-600 shrink-0" />
            <h2 className="font-semibold text-gray-900 text-base sm:text-lg">Audio Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Input Device</label>
              <select className="input w-full" value={settings.inputDevice} onChange={(e) => setSettings({ ...settings, inputDevice: e.target.value })}>
                <option value="default">System Default</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-700">System Audio Capture</div>
                <p className="text-xs text-gray-500">Capture audio from other applications</p>
              </div>
              <div
                onClick={() => setSettings({ ...settings, outputCapture: !settings.outputCapture })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${settings.outputCapture ? 'bg-violet-600' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${settings.outputCapture ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sample Rate</label>
              <select className="input w-full" value={settings.sampleRate} onChange={(e) => setSettings({ ...settings, sampleRate: e.target.value })}>
                <option value="16000">16000 Hz (Recommended)</option>
                <option value="22050">22050 Hz</option>
                <option value="44100">44100 Hz</option>
              </select>
            </div>
          </div>
        </div>

        {/* Language Settings */}
        <div className="card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4 sm:mb-6">
            <Globe size={20} className="text-violet-600 shrink-0" />
            <h2 className="font-semibold text-gray-900 text-base sm:text-lg">Language Settings</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Language</label>
              <select className="input w-full" value={settings.defaultLanguage} onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="zh">Chinese</option>
                <option value="ja">Japanese</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-700">Auto-detect Language</div>
                <p className="text-xs text-gray-500">Automatically detect spoken language</p>
              </div>
              <div
                onClick={() => setSettings({ ...settings, autoDetectLanguage: !settings.autoDetectLanguage })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${settings.autoDetectLanguage ? 'bg-violet-600' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${settings.autoDetectLanguage ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-700">Simple Language Mode</div>
                <p className="text-xs text-gray-500">Generate simpler, more concise responses</p>
              </div>
              <div
                onClick={() => setSettings({ ...settings, simpleLanguage: !settings.simpleLanguage })}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${settings.simpleLanguage ? 'bg-violet-600' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${settings.simpleLanguage ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

