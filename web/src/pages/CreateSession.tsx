import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Phone, Building2, Globe, Cpu, Sparkles, ArrowLeft, ArrowRight, FolderOpen } from 'lucide-react'
import { useSessionStore } from '../store/sessionStore'

type Step = 1 | 2 | 3 | 4 | 5

interface Resume {
  id: string
  filename: string
}

interface Document {
  id: string
  filename: string
  doc_type: string
}

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'it', name: 'Italian' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
]

const aiModels = [
  { id: 'llama3.1', name: 'Llama 3.1 8B', speed: 'Super Fast' },
  { id: 'llama3.1:70b', name: 'Llama 3.1 70B', speed: 'Fast' },
  { id: 'mistral', name: 'Mistral 7B', speed: 'Super Fast' },
  { id: 'qwen2.5', name: 'Qwen 2.5', speed: 'Fast' },
  { id: 'gemma2', name: 'Gemma 2', speed: 'Fast' },
]

export default function CreateSession() {
  const navigate = useNavigate()
  const { createSession } = useSessionStore()
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [resumes, setResumes] = useState<Resume[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    sessionType: 'interview' as 'call' | 'interview',
    company: '',
    jobDescription: '',
    resumeId: '',
    documents: [] as string[],
    language: 'en',
    simpleLanguage: true,
    extraContext: '',
    aiModel: 'llama3.1',
    autoGenerate: true,
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        const [resumeRes, docRes] = await Promise.all([
          fetch('/api/documents/resumes'),
          fetch('/api/documents'),
        ])
        if (!resumeRes.ok || !docRes.ok) {
          throw new Error('Failed to load data')
        }

        const [resumeData, docData] = await Promise.all([resumeRes.json(), docRes.json()])
        setResumes(resumeData)
        setDocuments(docData)
      } catch (error) {
        console.error('Failed to load create-session data:', error)
        setFetchError('Could not load uploaded files. Check server connection.')
      }
    }

    loadData()
  }, [])

  const handleNext = () => {
    if (step < 5) setStep((step + 1) as Step)
  }

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step)
  }

  const handleClose = () => {
    navigate('/sessions')
  }

  const handleCreate = async () => {
    setLoading(true)
    try {
      const selectedResume = resumes.find((r) => r.id === formData.resumeId)
      const selectedDocumentNames = documents
        .filter((doc) => formData.documents.includes(doc.id))
        .map((doc) => doc.filename)
        .join(', ')

      const contextNotes = [
        selectedResume ? `Resume: ${selectedResume.filename}` : '',
        selectedDocumentNames ? `Documents: ${selectedDocumentNames}` : '',
        formData.extraContext ? `Notes: ${formData.extraContext}` : '',
      ]
        .filter(Boolean)
        .join('\n')

      const fullDescription = [formData.jobDescription, contextNotes].filter(Boolean).join('\n\n')

      const session = await createSession({
        title: formData.company || 'New Session',
        description: fullDescription.slice(0, 1500),
        mode: formData.sessionType,
        language: formData.language,
      })

      if (formData.documents.length > 0) {
        await Promise.all(
          formData.documents.map(async (docId) => {
            await fetch(`/api/documents/${docId}/attach`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: session.id }),
            })
          }),
        )
      }

      navigate(`/sessions/${session.id}/live`)
    } catch (error) {
      console.error('Failed to create session:', error)
      alert('Failed to create session. Make sure backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <span className="font-semibold text-gray-900">Create Session</span>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {fetchError && <p className="px-6 pt-4 text-sm text-red-500">{fetchError}</p>}

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setFormData({ ...formData, sessionType: 'call' })}
                  className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                    formData.sessionType === 'call'
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Phone size={18} />
                  Regular Call
                </button>
                <button
                  onClick={() => setFormData({ ...formData, sessionType: 'interview' })}
                  className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                    formData.sessionType === 'interview'
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Building2 size={18} />
                  Interview
                </button>
              </div>

              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  <Building2 size={14} />
                  Company
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="Company name"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  Job Description
                </label>
                <textarea
                  className="input min-h-24 resize-none"
                  placeholder="Paste the job description here..."
                  value={formData.jobDescription}
                  onChange={(e) => setFormData({ ...formData, jobDescription: e.target.value })}
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  Resume
                </label>
                <select
                  className="input"
                  value={formData.resumeId}
                  onChange={(e) => setFormData({ ...formData, resumeId: e.target.value })}
                >
                  <option value="">Select a resume...</option>
                  {resumes.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.filename}
                    </option>
                  ))}
                </select>
                {resumes.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No resumes found. Upload one from the Resumes page.</p>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Documents</h3>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <FolderOpen size={14} />
                Select documents for this session
              </label>
              <div className="max-h-56 overflow-auto border border-gray-200 rounded-lg p-3 space-y-2">
                {documents.length === 0 ? (
                  <p className="text-sm text-gray-500">No documents found. Upload files from Documents page.</p>
                ) : (
                  documents.map((doc) => (
                    <label key={doc.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.documents.includes(doc.id)}
                        onChange={(e) => {
                          const nextDocs = e.target.checked
                            ? [...formData.documents, doc.id]
                            : formData.documents.filter((item) => item !== doc.id)
                          setFormData({ ...formData, documents: nextDocs })
                        }}
                      />
                      <span>{doc.filename}</span>
                      <span className="text-xs text-gray-400">({doc.doc_type})</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="font-semibold text-gray-900">Language & AI Settings</h3>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                    <Globe size={14} />
                    Language
                  </label>
                  <select
                    className="input"
                    value={formData.language}
                    onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  >
                    {languages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Extra Context/Instructions</label>
                <textarea
                  className="input min-h-20 resize-none"
                  placeholder="Any extra context for this interview session..."
                  value={formData.extraContext}
                  onChange={(e) => setFormData({ ...formData, extraContext: e.target.value })}
                />
              </div>

              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  <Cpu size={14} />
                  AI Model
                </label>
                <select
                  className="input"
                  value={formData.aiModel}
                  onChange={(e) => setFormData({ ...formData, aiModel: e.target.value })}
                >
                  {aiModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.speed}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Auto Generate AI Response</h3>
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-gray-700">Auto Generate AI Response</span>
                <div
                  onClick={() => setFormData({ ...formData, autoGenerate: !formData.autoGenerate })}
                  className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${
                    formData.autoGenerate ? 'bg-violet-600' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform mt-0.5 ${
                      formData.autoGenerate ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </div>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4 text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Sparkles size={32} className="text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-xl">Ready to Create</h3>
              <p className="text-gray-600">Click "Create Session" to start practicing.</p>
            </div>
          )}
        </div>

        <div className="flex justify-between p-4 border-t border-gray-200">
          <button onClick={step === 1 ? handleClose : handleBack} className="btn-secondary">
            <ArrowLeft size={18} />
            {step === 1 ? 'Close' : 'Back'}
          </button>

          {step < 5 ? (
            <button onClick={handleNext} className="btn-primary">
              Next
              <ArrowRight size={18} />
            </button>
          ) : (
            <button onClick={handleCreate} disabled={loading} className="btn-primary">
              {loading ? 'Creating...' : 'Create Session'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
