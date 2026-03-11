const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function adminHeaders(): HeadersInit {
  const key = typeof window !== 'undefined'
    ? localStorage.getItem('admin_key') || ''
    : '';
  return {
    'Content-Type': 'application/json',
    'x-admin-key': key,
  };
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: adminHeaders(),
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Surveys ---
export interface Question {
  id: string;
  type: 'multiple_choice' | 'likert' | 'open';
  text: string;
  options?: string[];
}

export interface Survey {
  id: string;
  title: string;
  description: string;
  survey_type: string;
  questions: Question[];
  target_agent_ids: string[] | null;
  reward_base: number;
  client_deposit: number;
  status: string;
  deadline: string | null;
  created_by: string;
  created_at: string;
}

export interface CreateSurveyInput {
  title: string;
  description?: string;
  surveyType: string;
  questions: Question[];
  targetAgentIds?: string[];
  rewardBase: number;
  clientDeposit: number;
  createdBy: string;
  deadline?: string;
}

export const surveys = {
  list: () => req<{ surveys: Survey[]; total: number }>('/api/surveys'),
  get: (id: string) => req<Survey>(`/api/surveys/${id}`),
  create: (data: CreateSurveyInput) =>
    req<{ id: string; status: string }>('/api/surveys', { method: 'POST', body: JSON.stringify(data) }),
  deliver: (id: string) =>
    req<{ delivered: number; surveyId: string }>(`/api/surveys/${id}/deliver`, { method: 'POST' }),
  close: (id: string) =>
    req<Survey>(`/api/surveys/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'closed' }),
    }),
};

// --- Responses ---
export interface Response {
  id: string;
  agent_id: string;
  agent_name: string;
  answers: { questionId: string; value: string | number; reasoning: string; confidence: number }[];
  quality_score: number | null;
  quality_breakdown: Record<string, number> | null;
  reward_amount: number | null;
  processing_ms: number | null;
  status: string;
  submitted_at: string;
}

export const responses = {
  list: (surveyId: string) =>
    req<{ surveyId: string; responses: Response[]; total: number }>(`/api/responses/${surveyId}`),
  score: (surveyId: string) =>
    req<{ scored: number; results: unknown[] }>(`/api/responses/${surveyId}/score`, { method: 'POST' }),
};

// --- Rewards ---
export interface RewardRecord {
  rewardId: string;
  agentId: string;
  responseId: string;
  amountUsdc: number;
  status: string;
}

export interface RewardBatchResult {
  surveyId: string;
  rewards: RewardRecord[];
  totalAmount: number;
  rewardCount: number;
}

export const rewards = {
  batch: (surveyId: string) =>
    req<RewardBatchResult>('/api/rewards/batch', {
      method: 'POST',
      body: JSON.stringify({ surveyId }),
    }),
};

// --- Agents ---
export interface Agent {
  id: string;
  name: string;
  operator_wallet: string;
  model_family: string | null;
  category: string | null;
  status: string;
  quality_score: number;
  is_ai_panel: boolean;
  created_at: string;
}

export const agents = {
  list: (status?: string) =>
    req<{ agents: Agent[]; total: number }>(`/api/agents${status ? `?status=${status}` : ''}`),
  activate: (id: string, status = 'active') =>
    req<Agent>(`/api/agents/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
};
