import { create } from 'zustand'

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

interface SessionState {
  sessions: Session[]
  currentSession: Session | null
  loading: boolean
  fetchSessions: () => Promise<void>
  fetchSession: (id: string) => Promise<void>
  createSession: (data: Partial<Session>) => Promise<Session>
  deleteSession: (id: string) => Promise<void>
}

const API_BASE = '/api'

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSession: null,
  loading: false,

  fetchSessions: async () => {
    set({ loading: true })
    try {
      const response = await fetch(`${API_BASE}/sessions`)
      if (!response.ok) {
        throw new Error('Failed to fetch sessions')
      }
      const sessions = await response.json()
      set({ sessions })
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
      set({ sessions: [] })
    } finally {
      set({ loading: false })
    }
  },

  fetchSession: async (id: string) => {
    set({ loading: true })
    try {
      const response = await fetch(`${API_BASE}/sessions/${id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch session')
      }
      const session = await response.json()
      set({ currentSession: session })
    } catch (error) {
      console.error('Failed to fetch session:', error)
      set({ currentSession: null })
    } finally {
      set({ loading: false })
    }
  },

  createSession: async (data) => {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error('Failed to create session')
    }

    const session = await response.json()
    set({ sessions: [...get().sessions, session] })
    return session
  },

  deleteSession: async (id: string) => {
    try {
      await fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' })
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
    set({ sessions: get().sessions.filter((s) => s.id !== id) })
  },
}))
