export interface Session {
  id: string
  title: string
  description?: string
  mode: string
  language: string
  status?: string
  ai_usage?: number
  created_at: string
  updated_at: string
}

export interface Document {
  id: string
  session_id?: string
  doc_type: string
  filename: string
  extracted_text?: string
  embedding_status: string
  created_at: string
}

export interface Resume {
  id: string
  filename: string
  extracted_text?: string
  embedding_status: string
  created_at: string
}

export interface TranscriptChunk {
  id: string
  session_id: string
  speaker: 'user' | 'interviewer'
  text: string
  language: string
  timestamp_start?: number
  timestamp_end?: number
  is_question: boolean
  created_at: string
}

export interface AnswerSuggestion {
  id: string
  session_id: string
  transcript_chunk_id?: string
  question?: string
  answer_text: string
  confidence: number
  language: string
  created_at: string
}

export interface Settings {
  ollama_url: string
  model: string
  max_tokens: number
  temperature: number
  input_device: string
  sample_rate: number
  default_language: string
  auto_detect_language: boolean
}
