export type Contract = {
  id: string; name: string; contract_type: string; status: string;
  effective_date: string | null; expiration_date: string | null; created_at: string;
};
export type Risk = { id: string; contract_id: string; title: string; category: string; severity: string; explanation: string; business_impact: string | null; suggested_action: string | null; review_status: string; };
export type Obligation = { id: string; contract_id: string; responsible_party: string | null; description: string; due_date: string | null; due_date_text: string | null; priority: string; status: string; };
export type ExtractedClause = { id: string; category: string; title: string | null; text: string; section_number: string | null; page_number: number | null; risk_level: string };
export type ContractAnalysis = {
  contract_id: string;
  name?: string;
  contract_type?: string;
  status: string;
  summary?: string;
  effective_date?: string | null;
  expiration_date?: string | null;
  clauses: ExtractedClause[];
  risks: Risk[];
  obligations: Obligation[];
};

const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api/v1';
const tokenKey = 'lexora.access_token';

function handleUnauthorized() {
  localStorage.removeItem(tokenKey);
  window.dispatchEvent(new Event('lexora-auth-expired'));
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(tokenKey);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (response.status === 401) handleUnauthorized();
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `Request failed (${response.status})`);
  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  login: (email: string, password: string) => request<{ access_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (full_name: string, email: string, password: string) => request('/auth/register', { method: 'POST', body: JSON.stringify({ full_name, email, password }) }),
  me: () => request<{ id: string; email: string; full_name: string }>('/auth/me'),
  contracts: () => request<{ items: Contract[]; total: number }>('/legal/contracts'),
  uploadContract: (file: File, contract_type: string, name?: string) => {
    const body = new FormData();
    body.append('file', file);
    body.append('contract_type', contract_type);
    if (name) body.append('name', name);
    const token = localStorage.getItem(tokenKey);
    return fetch(`${API_URL}/legal/contracts/upload`, { method: 'POST', body, headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (response) => { if (response.status === 401) handleUnauthorized(); if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? `Request failed (${response.status})`); return response.json() as Promise<Contract>; });
  },
  analyzeContract: (id: string) => request<{ contract_id: string; status: string; clause_count: number; risk_count: number; obligation_count: number }>(`/legal/contracts/${id}/analyze`, { method: 'POST' }),
  analysis: (id: string) => request<ContractAnalysis>(`/legal/contracts/${id}/analysis`),
  risks: (contractId: string) => request<Risk[]>(`/legal/contracts/${contractId}/risks`),
  allRisks: (filters?: { contract_id?: string; severity?: string; review_status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.contract_id) params.set('contract_id', filters.contract_id);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.review_status) params.set('review_status', filters.review_status);
    const qs = params.toString();
    return request<Risk[]>(`/legal/risks${qs ? `?${qs}` : ''}`);
  },
  reviewRisk: (riskId: string, status: string) => request<Risk>(`/legal/risks/${riskId}/review`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  obligations: () => request<Obligation[]>('/legal/obligations'),
  updateObligation: (id: string, status: string) => request<Obligation>(`/legal/obligations/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  summary: (document_text: string, contract_type?: string) => request('/legal/summary', { method: 'POST', body: JSON.stringify({ document_text, contract_type }) }),
  clauses: (text: string) => request('/legal/clauses', { method: 'POST', body: JSON.stringify({ text }) }),
  workflow: (question: string, document_text: string, chunks: { chunk_id: string; content: string; page_number?: number | null; section_number?: string | null; section_title?: string | null; clause_category?: string | null; document_name?: string | null }[] = []) => request<{ answer: string; citations: string[]; evidence_valid: boolean; risks: Risk[]; obligations: Obligation[] }>('/legal/workflow', { method: 'POST', body: JSON.stringify({ task: 'question', question, document_text, chunks }) }),
  compare: (original_text: string, revised_text: string) => request<{ changed: boolean; additions: number; deletions: number; changes: { change_type: string; original?: string; revised?: string }[] }>('/legal/compare', { method: 'POST', body: JSON.stringify({ original_text, revised_text }) }),
};

export const auth = { tokenKey, isSignedIn: () => Boolean(localStorage.getItem(tokenKey)), signOut: () => localStorage.removeItem(tokenKey) };
