export interface VmProject {
  id: string;
  title: string;
  raw_text: string;
  current_tree_json: TreeNode | null;
  created_at: string;
}

export interface TreeNode {
  id: string;
  text: string;
  children: TreeNode[];
}

export type UserPlan = 'free' | 'pro';

export interface UsageLimits {
  maxTextChars: number;
  canImportPdf: boolean;
  canImportWeb: boolean;
  maxSourceSessions: number;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    role?: string;
    plan: UserPlan;
    limits: UsageLimits;
  };
}

export interface ProjectSource {
  id: string;
  project_id: string;
  kind: 'text' | 'pdf' | 'url';
  title: string;
  content_text: string;
  created_at: string;
}

export interface SlideDeck {
  title: string;
  theme?: string;
  slides: Array<{
    title: string;
    subtitle?: string;
    bullets?: string[];
    speakerNotes?: string;
    layout: 'title' | 'title-bullets' | 'two-column' | 'quote' | 'timeline' | 'summary';
    visualIdea?: string;
  }>;
}

export interface FlashcardDeck {
  title: string;
  cards: Array<{
    front: string;
    back: string;
    hint?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
}

const DEV_BEARER_TOKEN_KEY = 'vm_dev_bearer_token';

export const getDevBearerToken = (): string => localStorage.getItem(DEV_BEARER_TOKEN_KEY) || '';
export const setDevBearerToken = (token: string): void => {
  if (token.trim()) {
    localStorage.setItem(DEV_BEARER_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(DEV_BEARER_TOKEN_KEY);
  }
};

const authHeaders = (): Headers => {
  const token = getDevBearerToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const headers = authHeaders();
  headers.set('Content-Type', 'application/json');

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  const resp = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json() as Promise<T>;
};

export const api = {
  me: () => request<MeResponse>('/api/v1/auth/me'),
  listProjects: () => request<{ projects: VmProject[] }>('/api/v1/vm/projects'),
  createProject: (payload: { title: string; rawText: string; sourceSessions?: string[] }) =>
    request<{ project: VmProject }>('/api/v1/vm/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteProject: (projectId: string) =>
    request<{ message: string }>(`/api/v1/vm/projects/${projectId}`, {
      method: 'DELETE',
    }),
  listSources: (projectId: string) =>
    request<{ sources: ProjectSource[] }>(`/api/v1/vm/projects/${projectId}/sources`),
  addSource: (projectId: string, payload: { kind: 'text' | 'pdf' | 'url'; title?: string; contentText: string }) =>
    request<{ source: ProjectSource }>(`/api/v1/vm/projects/${projectId}/sources`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSource: (projectId: string, sourceId: string, payload: { title?: string; contentText: string }) =>
    request<{ source: ProjectSource }>(`/api/v1/vm/projects/${projectId}/sources/${sourceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteSource: (projectId: string, sourceId: string) =>
    request<{ message: string }>(`/api/v1/vm/projects/${projectId}/sources/${sourceId}/delete`, {
      method: 'POST',
    }),
  generate: (projectId: string, inputText?: string) =>
    request<{ tree: TreeNode; version: number }>(`/api/v1/vm/projects/${projectId}/generate`, {
      method: 'POST',
      body: JSON.stringify(inputText ? { inputText } : {}),
    }),
  generateSlides: (projectId: string, payload?: { inputText?: string; slideCount?: number }) =>
    request<{ slides: SlideDeck }>(`/api/v1/vm/projects/${projectId}/generate/slides`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  generateFlashcards: (projectId: string, payload?: { inputText?: string; cardCount?: number }) =>
    request<{ flashcards: FlashcardDeck }>(`/api/v1/vm/projects/${projectId}/generate/flashcards`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  saveTree: (projectId: string, tree: TreeNode) =>
    request<{ tree: TreeNode }>(`/api/v1/vm/projects/${projectId}/tree/patch`, {
      method: 'POST',
      body: JSON.stringify({ tree }),
    }),
  importPdf: async (file: File): Promise<{ text: string }> => {
    const headers = authHeaders();
    headers.set('Content-Type', 'application/pdf');

    const response = await fetch('/api/v1/imports/pdf', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: await file.arrayBuffer(),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json() as Promise<{ text: string }>;
  },
  importWeb: (url: string) =>
    request<{ text: string }>('/api/v1/imports/web', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  exportMm: (projectId: string) => `/api/v1/vm/projects/${projectId}/export/mm`,
};
