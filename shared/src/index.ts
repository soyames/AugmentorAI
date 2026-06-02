// Shared types between web and desktop workspaces
export interface InterviewSession {
  id: string;
  title: string;
  created_at: string;
  status: string;
}

export interface AnswerSuggestion {
  id: string;
  session_id: string;
  question: string;
  answer: string;
  confidence_score: number | null;
  confidence_factors: Record<string, unknown> | null;
  created_at: string;
}
